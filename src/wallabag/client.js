// -----------------------------------------------------------------------------
// The REST API of Wallabag (`<base>/api/...`), the few calls the integration
// needs, authenticated by OAuth2: an API client (`client_id`, `client_secret`,
// created in Wallabag → API clients management) and the user's credentials
// (`password` grant), then the `refresh_token` grant.
//
// Facts checked on a real server, Wallabag 2.6.14 (docker.io/wallabag/wallabag),
// see test/fixtures/wallabag/2.6.14/:
// - `POST /oauth/v2/token` answers `{ access_token, expires_in: 3600,
//   refresh_token, ... }`; a wrong password is a 400 `invalid_grant`, a wrong
//   client a 400 `invalid_client`, a wrong refresh token a 400 `invalid_grant`;
// - an API call without a valid token is a 401 `{ error, error_description }`;
//   other errors are `{ type, title, status, detail }` (404 "Not Found", 500);
// - `GET /api/entries.json` is paged (`page`, `perPage`, `total`, `pages`,
//   `_embedded.items`); `detail=metadata` leaves the content out; a page past
//   the last one is a 404; `is_archived` and `is_starred` are 0/1; dates look
//   like `2026-10-22T00:41:45+0000`; `reading_time` is in minutes;
// - `POST /api/entries.json` fetches the page before answering (seconds), and
//   saves anything, even "not a url": the address is checked here first; an
//   address already saved answers the existing entry (its tags merged);
// - `GET /api/entries/exists.json?url=...&return_id=1` answers
//   `{ exists: <id> }` or `{ exists: null }`.
// -----------------------------------------------------------------------------

import { scrubUrls } from './model.js';

export const DEFAULT_TIMEOUT = 15_000;
// Saving an address makes Wallabag fetch the page first.
export const SAVE_TIMEOUT = 50_000;
// A token is renewed that long before it expires.
const TOKEN_MARGIN = 60_000;

export class WallabagError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'client' | 'not_found' | 'timeout' | 'http' | 'invalid'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'WallabagError';
    this.kind = kind;
    this.status = status;
  }
}

export class WallabagClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {{ clientId: string, clientSecret: string, username: string, password: string }} options.credentials
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   * @param {() => number} [options.now]
   */
  constructor({ url, credentials, fetch: fetchImpl, timeout, now = Date.now }) {
    this.url = url;
    this.credentials = credentials;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
    this.now = now;
    this.token = null; // { access, refresh, expiresAt }
    this.authenticating = null;
  }

  async #request(method, path, { body, form, token, timeout = this.timeout } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    let payload;
    if (form) {
      payload = new URLSearchParams(form);
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let response;
    let raw;
    try {
      response = await this.fetch(`${this.url}${path}`, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
      });
      raw = await response.text();
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new WallabagError('timeout', `No answer from Wallabag within ${timeout} ms`);
      }
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
      throw new WallabagError('unreachable', `Wallabag unreachable (${cause})`);
    }
    let data = null;
    try {
      data = raw.trim() === '' ? null : JSON.parse(raw);
    } catch {
      if (response.ok) {
        // A proxy login page answering 200 in HTML, for instance.
        throw new WallabagError(
          'invalid',
          `${path.split('?')[0]}: the answer is not JSON (is this Wallabag?)`,
        );
      }
    }
    if (!response.ok) {
      throw WallabagClient.#fail(path, response.status, data);
    }
    return data;
  }

  static #fail(path, status, data) {
    const detail =
      (typeof data?.error_description === 'string' && data.error_description) ||
      (typeof data?.detail === 'string' && data.detail) ||
      (typeof data?.error === 'string' && data.error) ||
      `HTTP ${status}`;
    const where = path.split('?')[0];
    let kind = status === 404 ? 'not_found' : 'http';
    if (where === '/oauth/v2/token') {
      // A 404 there: not Wallabag (or a wrong path).
      kind =
        data?.error === 'invalid_client'
          ? 'client'
          : data?.error === 'invalid_grant'
            ? 'unauthorized'
            : status === 404
              ? 'invalid'
              : 'http';
    } else if (status === 401) {
      kind = 'unauthorized';
    } else if (status === 403) {
      // The article of another user: not a credential problem.
      kind = 'not_found';
    }
    return new WallabagError(
      kind,
      `${where}: ${scrubUrls(String(detail)).replace(/\s+/g, ' ').slice(0, 120)}`,
      status,
    );
  }

  /** A valid access token: the current one, a refreshed one, or a new one. */
  async #accessToken() {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN > this.now()) {
      return this.token.access;
    }
    // Concurrent requests share one authentication.
    this.authenticating ??= this.#authenticate().finally(() => {
      this.authenticating = null;
    });
    return this.authenticating;
  }

  async #authenticate() {
    const { clientId, clientSecret, username, password } = this.credentials;
    const client = { client_id: clientId, client_secret: clientSecret };
    if (this.token?.refresh) {
      try {
        return this.#keep(
          await this.#request('POST', '/oauth/v2/token', {
            form: { grant_type: 'refresh_token', ...client, refresh_token: this.token.refresh },
          }),
        );
      } catch (err) {
        if (!(err instanceof WallabagError) || !['unauthorized', 'client'].includes(err.kind)) {
          throw err;
        }
        // The refresh token expired (14 days by default): log in again.
        this.token = null;
      }
    }
    return this.#keep(
      await this.#request('POST', '/oauth/v2/token', {
        form: { grant_type: 'password', ...client, username, password },
      }),
    );
  }

  #keep(data) {
    if (typeof data?.access_token !== 'string' || data.access_token === '') {
      throw new WallabagError('invalid', 'This address does not answer like Wallabag');
    }
    const seconds = Number(data.expires_in);
    this.token = {
      access: data.access_token,
      refresh: typeof data.refresh_token === 'string' ? data.refresh_token : null,
      expiresAt: this.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000,
    };
    return this.token.access;
  }

  /** An API call, logged in; a token refused on the way is renewed once. */
  async #api(method, path, options = {}) {
    const token = await this.#accessToken();
    try {
      return await this.#request(method, `/api${path}`, { ...options, token });
    } catch (err) {
      if (!(err instanceof WallabagError) || err.kind !== 'unauthorized') {
        throw err;
      }
      if (this.token?.access === token) {
        this.token.expiresAt = 0; // revoked or expired early: refresh it
      }
      return this.#request(method, `/api${path}`, {
        ...options,
        token: await this.#accessToken(),
      });
    }
  }

  /** `{ id, username }`: the owner of the credentials. */
  async user() {
    const user = await this.#api('GET', '/user.json');
    if (!user || !Number.isInteger(user.id)) {
      throw new WallabagError('invalid', 'This address does not answer like Wallabag');
    }
    return user;
  }

  /**
   * One page of entries, without their content.
   * @param {{ archive?: 0 | 1, starred?: 0 | 1, sort?: string, tags?: string, page?: number, perPage?: number }} query
   * @returns {Promise<{ total: number, pages: number, items: object[] }>}
   */
  async entries({ archive, starred, sort = 'created', tags, page = 1, perPage = 30 } = {}) {
    const params = new URLSearchParams({
      sort,
      order: 'desc',
      page: String(page),
      perPage: String(perPage),
      detail: 'metadata',
    });
    if (archive !== undefined) {
      params.set('archive', String(archive));
    }
    if (starred !== undefined) {
      params.set('starred', String(starred));
    }
    if (tags) {
      params.set('tags', tags);
    }
    let data;
    try {
      data = await this.#api('GET', `/entries.json?${params}`);
    } catch (err) {
      if (err instanceof WallabagError && err.kind === 'not_found' && page > 1) {
        // Past the last page (entries archived meanwhile).
        return { total: 0, pages: 0, items: [] };
      }
      throw err;
    }
    const items = data?._embedded?.items;
    if (!Array.isArray(items)) {
      throw new WallabagError('invalid', 'Wallabag did not answer its entries');
    }
    return {
      total: Number.isInteger(data.total) ? data.total : items.length,
      pages: Number.isInteger(data.pages) ? data.pages : 1,
      items: items.filter((item) => Number.isInteger(item?.id)),
    };
  }

  /** The id of the entry saved with that address, or null. */
  async exists(url, timeout) {
    const data = await this.#api(
      'GET',
      `/entries/exists.json?${new URLSearchParams({ url, return_id: '1' })}`,
      { timeout },
    );
    return Number.isInteger(data?.exists) ? data.exists : null;
  }

  /** Save an address (Wallabag fetches the page). Answers the entry. */
  async save(url, tags) {
    const body = { url };
    if (tags) {
      body.tags = tags;
    }
    const entry = await this.#api('POST', '/entries.json', { body, timeout: SAVE_TIMEOUT });
    if (!Number.isInteger(entry?.id)) {
      throw new WallabagError('invalid', 'Wallabag did not answer the saved entry');
    }
    return entry;
  }

  /** One entry (with its content: only used for a single article). */
  async entry(id) {
    const entry = await this.#api('GET', `/entries/${id}.json`);
    if (!Number.isInteger(entry?.id)) {
      throw new WallabagError('invalid', 'Wallabag did not answer the entry');
    }
    return entry;
  }

  /** Archive an entry. Answers the entry. */
  async archive(id) {
    const entry = await this.#api('PATCH', `/entries/${id}.json`, { body: { archive: 1 } });
    if (!Number.isInteger(entry?.id)) {
      throw new WallabagError('invalid', 'Wallabag did not answer the archived entry');
    }
    return entry;
  }
}
