// -----------------------------------------------------------------------------
// The hub: the link to one Wallabag account and everything Gladys sees of it
// — the device, its states, the connection status, the scene events, and the
// articles saved and archived from scenes.
//
// Wallabag pushes nothing: the container reads it every `refresh_minutes`
// (5 by default) on its own timer (should_poll: false). A read is four small
// kinds of requests, without the content of the articles (`detail=metadata`):
// the unread articles (paged, for their count and reading time), the starred
// count, the articles archived most recently (read today, archive events),
// and the articles saved most recently (new article events). The user is
// read once.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  buildWallabagDevice,
  buildWallabagStates,
  parseExternalId,
  wallabagIds,
} from './devices.js';
import { WallabagClient, WallabagError } from './wallabag/client.js';
import { parseEntryRef, parseTags, parseUrl, summarizeEntry } from './wallabag/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, commandMessage } from './texts.js';

const logger = createLogger({ name: 'wallabag-hub' });

export const WIDGET_KEY = 'unread';
export const TRIGGERS = { entry: 'new_entry', archived: 'entry_archived' };

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 15_000,
  // How long the articles read for a widget with a tag are reused.
  widgetCache: 60_000,
};

// The unread articles are read by pages of UNREAD_PAGE, UNREAD_PAGES at most:
// past that, the reading time of the others is estimated from the average.
export const UNREAD_PAGE = 100;
export const UNREAD_PAGES = 20;
// The articles archived most recently, by pages, until one archived before
// today (ARCHIVED_PAGES pages at most).
export const ARCHIVED_PAGE = 50;
export const ARCHIVED_PAGES = 10;
// The articles saved since the previous read: past that many (an import), the
// oldest are recorded as seen without being announced.
export const NEW_PAGE = 50;
// Past that many events of a kind in one read, the rest is recorded as seen.
export const MAX_EVENTS_PER_READ = 10;
// Reads after which an event Gladys keeps refusing is given up.
export const MAX_TRIES = 3;
export const MAX_READ = 10;
// The unread articles kept for the widget.
export const WIDGET_ITEMS = 6;

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, values) {
    const messages = commandMessage(code, values);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const linkOf = (config) =>
  JSON.stringify([
    config.url,
    config.clientId,
    config.clientSecret,
    config.username,
    config.password,
  ]);
const ints = (list) => (Array.isArray(list) ? list.filter(Number.isInteger) : []);
const complete = (config) =>
  Boolean(
    config.url && config.clientId && config.clientSecret && config.username && config.password,
  );

/** Local midnight (TZ is the time zone of Gladys, set by the supervisor). */
export function startOfDay(now) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = {
      url: null,
      urlInvalid: false,
      clientId: '',
      clientSecret: '',
      username: '',
      password: '',
      refreshMinutes: 5,
      language: 'fr',
    };
    this.client = null;
    /** the owner of the credentials: { id, name } */
    this.user = null;
    /** { unread, starred, read_today, reading_time } */
    this.counters = null;
    /** the newest unread articles (summaries), for the widget */
    this.unreadItems = [];
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    this.lastStatus = '';
    /** what the triggers already saw: { user, server, lastId, archivedAt, archivedIds } */
    this.seen = null;
    /** event id -> reads at which Gladys refused it */
    this.retries = new Map();
    this.eventFailing = false;
    this.devicesFailing = false;
    this.publishFailing = false;
    this.widgetLists = new Map();
    this.configuring = Promise.resolve();
    this.refreshTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.counters !== null;
  }

  async start(config) {
    const saved = await this.store.load();
    // A damaged file is a new baseline, not a crash on every read.
    this.seen =
      Number.isInteger(saved.user) &&
      Number.isInteger(saved.lastId) &&
      saved.lastId >= 0 &&
      Number.isInteger(saved.archivedAt)
        ? {
            user: saved.user,
            server: typeof saved.server === 'string' ? saved.server : '',
            lastId: saved.lastId,
            archivedAt: saved.archivedAt,
            archivedIds: ints(saved.archivedIds),
          }
        : null;
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged = linkOf(previous) !== linkOf(config) || !this.client;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.user = null;
      this.counters = null;
      this.unreadItems = [];
      this.failure = null;
      this.announced = false;
      this.widgetLists.clear();
      if (complete(config)) {
        this.client = new WallabagClient({
          url: config.url,
          credentials: {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            username: config.username,
            password: config.password,
          },
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
          now: this.now,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged) {
      await this.refresh();
    } else {
      // Language or interval only: same data, new names and texts.
      this.gladys.forgetPublishedStates?.();
      this.widgetLists.clear();
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    await this.store.flush();
  }

  // --- Reading Wallabag -----------------------------------------------------

  /** Read Wallabag (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    const midnight = startOfDay(this.now());
    let user;
    let unread;
    let starred;
    let archived;
    let recent;
    try {
      user = this.user ?? (await client.user());
      [unread, starred, archived, recent] = await Promise.all([
        this.#readUnread(client),
        client.entries({ starred: 1, perPage: 1 }),
        this.#readArchived(client, midnight),
        client.entries({ perPage: NEW_PAGE }),
      ]);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped) {
      return;
    }
    this.user = { id: user.id, name: user.username || user.name || String(user.id) };
    const minutes = unread.items.reduce((sum, e) => sum + e.readingTime, 0);
    this.counters = {
      unread: unread.total,
      starred: starred.total,
      read_today: archived.filter((e) => e.archivedAt !== null && e.archivedAt >= midnight).length,
      // Past the pages read, the others are estimated from the average.
      reading_time:
        unread.items.length > 0 && unread.total > unread.items.length
          ? Math.round((minutes * unread.total) / unread.items.length)
          : minutes,
    };
    this.unreadItems = unread.items.slice(0, WIDGET_ITEMS);
    this.widgetLists.clear();
    this.#recover();
    await this.#update();
    if (client !== this.client || this.stopped || !this.user) {
      return; // the configuration changed meanwhile
    }
    await this.#announce(recent.items.map(summarizeEntry), archived);
    await this.updateConnectionStatus();
  }

  /** Every unread article (UNREAD_PAGES pages at most), newest first. */
  async #readUnread(client) {
    const first = await client.entries({ archive: 0, perPage: UNREAD_PAGE });
    const items = first.items.map(summarizeEntry);
    for (let page = 2; page <= Math.min(first.pages, UNREAD_PAGES); page += 1) {
      const next = await client.entries({ archive: 0, perPage: UNREAD_PAGE, page });
      items.push(...next.items.map(summarizeEntry));
      if (next.items.length < UNREAD_PAGE) {
        break;
      }
    }
    return { total: first.total, items };
  }

  /** The articles archived most recently, down to the first archived before today. */
  async #readArchived(client, midnight) {
    const items = [];
    for (let page = 1; page <= ARCHIVED_PAGES; page += 1) {
      const next = await client.entries({
        archive: 1,
        sort: 'archived',
        perPage: ARCHIVED_PAGE,
        page,
      });
      items.push(...next.items.map(summarizeEntry));
      const last = items.at(-1);
      if (
        page >= next.pages ||
        next.items.length < ARCHIVED_PAGE ||
        !last ||
        (last.archivedAt ?? 0) < midnight
      ) {
        break;
      }
    }
    return items;
  }

  /**
   * What the triggers saw of this user on this server: user ids are small
   * integers (the first user is 1 everywhere), another server is a new baseline.
   */
  #known(userId) {
    const seen = this.seen;
    return seen?.user === userId && seen.server === (this.config.url ?? '') ? seen : null;
  }

  /** Device, states and widget from the last read. */
  async #update() {
    if (!this.user) {
      return; // nothing read yet: never replace the Discovery list by nothing
    }
    await this.publishDevices();
    await this.publishStates();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof WallabagError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`Wallabag: ${err.message}`);
    } else {
      logger.debug(`Wallabag still failing: ${err.message}`);
    }
    this.failure = kind;
    if (['unauthorized', 'client', 'invalid', 'not_found'].includes(kind)) {
      // Other credentials may belong to another user.
      this.user = null;
    }
  }

  #recover() {
    const { unread } = this.counters;
    if (this.failure !== null) {
      logger.info(`Wallabag answers again (${unread} unread)`);
    } else if (!this.announced) {
      logger.info(`Connected to Wallabag (${unread} unread)`);
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire the articles saved and archived since the last read. The first read
   * of a Wallabag user is a silent baseline: installing the integration
   * announces nothing already there.
   * @param {object[]} recent the newest saved articles (summaries)
   * @param {object[]} archived the newest archived articles (summaries)
   */
  async #announce(recent, archived) {
    const userId = this.user.id;
    const known = this.#known(userId);
    let lastId = Math.max(known?.lastId ?? 0, ...recent.map((e) => e.id));
    // The archive cursor: the newest archive time seen, and the ids archived at
    // that very second (Wallabag dates have no milliseconds).
    let cursor = { at: known?.archivedAt ?? 0, ids: known?.archivedIds ?? [] };
    const advance = (entry) => {
      if (entry.archivedAt > cursor.at) {
        cursor = { at: entry.archivedAt, ids: [entry.id] };
      } else if (!cursor.ids.includes(entry.id)) {
        cursor = { at: cursor.at, ids: [...cursor.ids, entry.id] };
      }
    };
    const isNewArchive = (entry) =>
      entry.archivedAt !== null &&
      (entry.archivedAt > cursor.at ||
        (entry.archivedAt === cursor.at && !cursor.ids.includes(entry.id)));
    const byArchive = (a, b) => a.archivedAt - b.archivedAt || a.id - b.id;

    if (!known) {
      for (const entry of archived.filter(isNewArchive).sort(byArchive)) {
        advance(entry);
      }
    } else {
      const fresh = recent.filter((e) => e.id > known.lastId).sort((a, b) => a.id - b.id);
      if (fresh.length > MAX_EVENTS_PER_READ) {
        logger.info(
          `${fresh.length} new articles at once: ${MAX_EVENTS_PER_READ} announced at most`,
        );
      }
      // The newest ones: the oldest of a burst are the least worth a message.
      for (const entry of fresh.slice(-MAX_EVENTS_PER_READ)) {
        const outcome = await this.#fire(TRIGGERS.entry, `entry:${entry.id}`, entryData(entry));
        if (outcome === 'retry') {
          lastId = entry.id - 1;
          break;
        }
      }
      const done = archived.filter(isNewArchive).sort(byArchive);
      for (const entry of done.slice(0, -MAX_EVENTS_PER_READ)) {
        advance(entry); // the oldest of a burst: seen, not announced
      }
      for (const entry of done.slice(-MAX_EVENTS_PER_READ)) {
        const outcome = await this.#fire(
          TRIGGERS.archived,
          `archived:${entry.id}:${entry.archivedAt}`,
          entryData(entry),
        );
        if (outcome === 'retry') {
          break;
        }
        advance(entry);
      }
    }
    const next = {
      user: userId,
      server: this.config.url ?? '',
      lastId,
      archivedAt: cursor.at,
      archivedIds: cursor.ids.slice(-100),
    };
    if (JSON.stringify(next) !== JSON.stringify(this.seen)) {
      this.seen = next;
      await this.store.save(next);
    }
  }

  /** @returns {Promise<'sent' | 'retry' | 'dropped'>} */
  async #fire(key, id, data) {
    logger.debug(`${key}: ${id}`);
    try {
      await this.gladys.publishSceneEvent(key, data);
      if (this.eventFailing) {
        logger.info('Scene events accepted again');
      }
      this.eventFailing = false;
      this.retries.delete(id);
      return 'sent';
    } catch (err) {
      if (this.eventFailing) {
        logger.debug(`Cannot fire ${key}: ${err.message}`);
      } else {
        logger.warn(`Cannot fire ${key}: ${err.message}`);
      }
      this.eventFailing = true;
      // A refusal for good (4xx but 429) is not retried: it would be refused
      // at every read. Otherwise (Gladys restarting), it is fired again at the
      // next read, up to MAX_TRIES reads.
      const status = err?.status;
      const final = Number.isInteger(status) && status >= 400 && status < 500 && status !== 429;
      const tries = (this.retries.get(id) ?? 0) + 1;
      if (!final && tries < MAX_TRIES) {
        this.retries.set(id, tries);
        return 'retry';
      }
      this.retries.delete(id);
      if (!final) {
        logger.warn(`${key} ${id} given up: Gladys refused it ${tries} times`);
      }
      return 'dropped';
    }
  }

  // --- Device and states ----------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  buildDevices() {
    if (!this.user || !this.counters) {
      return [];
    }
    return [buildWallabagDevice(this.gladys, this.user, this.language, this.config.url ?? '')];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      if (this.devicesFailing) {
        logger.debug(`Cannot publish the devices: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the devices: ${err.message}`);
      }
      this.devicesFailing = true;
      return;
    }
    this.devicesFailing = false;
  }

  /**
   * The states of the device, once the user added it (Gladys drops the others).
   * @param {string} [justCreated] the external id of a device just added
   */
  async publishStates(justCreated) {
    if (!this.user || !this.counters || this.stopped) {
      return;
    }
    const device = wallabagIds(this.gladys, this.user.id).device;
    if (device !== justCreated && !this.#isCreated(device)) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(
        buildWallabagStates(this.gladys, this.user.id, this.counters),
        { heartbeat: this.timings.heartbeat },
      );
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  #ours(device) {
    const user = parseExternalId(this.gladys, device?.external_id);
    return user !== null && user === this.user?.id;
  }

  /** The user added the device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.#ours(device)) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** onPoll (the device is not polled: the container reads on its timer). */
  async poll(device) {
    if (this.#ours(device)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  /**
   * The newest unread articles, of every tag (from the last read) or of one
   * (read on demand and reused a minute), with their count. Null when
   * Wallabag cannot be read.
   * @param {string} tag
   * @returns {Promise<{ total: number, entries: object[] } | null>}
   */
  async widgetEntries(tag, count) {
    if (!this.loaded || this.failure !== null) {
      return null;
    }
    if (!tag) {
      return { total: this.counters.unread, entries: this.unreadItems.slice(0, count) };
    }
    const cached = this.widgetLists.get(tag);
    if (cached && this.now() - cached.at < this.timings.widgetCache) {
      return cached.list;
    }
    const client = this.client;
    try {
      const page = await client.entries({ archive: 0, tags: tag, perPage: count });
      const list = { total: page.total, entries: page.items.map(summarizeEntry) };
      if (client === this.client) {
        this.widgetLists.set(tag, { at: this.now(), list });
      }
      return list;
    } catch (err) {
      logger.debug(`Widget list not read: ${err.message}`);
      return null;
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    const config = this.config;
    if (config.urlInvalid) {
      return 'invalid';
    }
    if (!config.url) {
      return 'none';
    }
    if (!config.clientId || !config.clientSecret) {
      return 'client';
    }
    if (!config.username || !config.password) {
      return 'login';
    }
    if (this.failure) {
      return (
        {
          unauthorized: 'unauthorized',
          client: 'client_refused',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
          http: 'error',
        }[this.failure] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    return key ? this.#statusOf(key) : null;
  }

  #statusOf(key) {
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.client) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
      // Recorded once Gladys took it: a failed call is sent again next time.
      this.lastStatus = fingerprint;
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    if (!this.loaded || !this.user) {
      // The configuration changed during the test: nothing read yet.
      return this.#statusOf('unreachable');
    }
    const { unread, starred, reading_time: minutes } = this.counters;
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.user.name, unread, starred, minutes),
      ]),
    );
  }

  /** The client, logged in, or a coded error (not configured, never read). */
  async #ready() {
    const client = this.client;
    if (!client) {
      throw new CommandError('unreachable', this.language);
    }
    if (!this.user) {
      await this.refresh();
    }
    if (!this.user || client !== this.client) {
      throw this.#commandError(new WallabagError(this.failure ?? 'unreachable', ''), 'read');
    }
    return client;
  }

  /**
   * Save an address in Wallabag, with tags.
   * @returns {Promise<{ entry: object, already: boolean }>}
   */
  async saveUrl(rawUrl, rawTags) {
    const url = parseUrl(rawUrl);
    if (!url) {
      throw new CommandError('url', this.language);
    }
    const client = await this.#ready();
    let already = false;
    try {
      already = (await client.exists(url)) !== null;
    } catch (err) {
      logger.debug(`Existence not checked: ${err.message}`);
    }
    let entry;
    try {
      entry = summarizeEntry(await client.save(url, parseTags(rawTags)));
    } catch (err) {
      throw this.#commandError(err, 'http');
    }
    logger.info(already ? 'Article already in Wallabag, tags added' : 'Article saved in Wallabag');
    await this.refresh();
    return { entry, already };
  }

  /**
   * Archive (mark as read) an article: its id, or its address.
   * @returns {Promise<object>} the article
   */
  async archiveEntry(raw) {
    const ref = parseEntryRef(raw);
    if (!ref) {
      throw new CommandError('entry', this.language);
    }
    const client = await this.#ready();
    let entry;
    try {
      const id = ref.id ?? (await client.exists(ref.url));
      if (id === null) {
        throw new CommandError('missing', this.language);
      }
      entry = summarizeEntry(await client.archive(id));
    } catch (err) {
      if (err instanceof WallabagError && err.kind === 'not_found') {
        throw new CommandError('missing', this.language);
      }
      throw this.#commandError(err, 'http');
    }
    logger.info('Article archived in Wallabag');
    await this.refresh();
    return entry;
  }

  /**
   * The newest unread articles, of every tag or of one, read now.
   * @param {{ count?: unknown, tag?: unknown }} request
   * @returns {Promise<{ entries: object[], total: number }>}
   */
  async readUnread({ count, tag }) {
    const client = await this.#ready();
    const wanted = Math.min(Math.max(Math.round(Number(count)) || 5, 1), MAX_READ);
    const label = typeof tag === 'string' ? tag.trim().slice(0, 100) : '';
    let page;
    try {
      page = await client.entries({ archive: 0, tags: label || undefined, perPage: wanted });
    } catch (err) {
      throw this.#commandError(err, 'read');
    }
    return { entries: page.items.map(summarizeEntry), total: page.total };
  }

  #commandError(err, fallback) {
    if (err instanceof CommandError) {
      return err;
    }
    const kind = err instanceof WallabagError ? err.kind : 'unreachable';
    const detail = err.message.replace(/^[^:]*: /, '');
    if (kind === 'unauthorized' || kind === 'client') {
      return new CommandError('unauthorized', this.language);
    }
    if (kind === 'timeout' && fallback === 'http') {
      // The request may have reached Wallabag: the change may be done.
      return new CommandError('timeout', this.language);
    }
    if (kind === 'unreachable' || kind === 'timeout') {
      return new CommandError('unreachable', this.language);
    }
    return new CommandError(fallback, this.language, { detail });
  }
}

/** The data of both triggers. */
export function entryData(entry) {
  return {
    // The filter of the triggers: the site, as Wallabag names it.
    domain: entry.domain,
    title: entry.title,
    url: entry.url.slice(0, 1000),
    tags: entry.tags.join(', ').slice(0, 1000),
    reading_time: entry.readingTime,
    starred: entry.starred,
    entry_id: entry.id,
  };
}
