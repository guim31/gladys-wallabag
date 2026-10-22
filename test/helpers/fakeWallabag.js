// -----------------------------------------------------------------------------
// A fake Wallabag behind a `fetch` function: it starts from the bodies
// recorded on a real Wallabag 2.6.14 (test/fixtures/wallabag/2.6.14/), keeps
// its articles in memory, issues OAuth2 tokens (password and refresh_token
// grants) and answers the errors the real server answers.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.40:8080';
export const CLIENT_ID = '1_testclientrandomid0123';
export const CLIENT_SECRET = 'testclientsecret0123456789';
export const USERNAME = 'wallabag';
export const PASSWORD = 'correct horse battery';
export const CONFIG = {
  url: HOST,
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  username: USERNAME,
  password: PASSWORD,
};
// 10:00 UTC, 12:00 in Paris: the same day in both time zones as the fixtures.
export const NOW = Date.parse('2026-10-22T10:00:00.000Z');

export const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/wallabag/2.6.14/${name}.json`, import.meta.url), 'utf8'),
  );

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** A date as Wallabag writes it: `2026-10-22T00:41:45+0000`. */
export const wallabagDate = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, '+0000');

export function createWallabag() {
  const recorded = fixture('entries-recent').body._embedded.items;
  const state = {
    user: fixture('user').body,
    entries: structuredClone(recorded),
    tokens: new Map(), // access token -> expired?
    refreshTokens: new Set(),
    issued: 0,
    passwordGrants: 0,
    down: false,
    html: false,
    slow: false,
    requests: [],
    clock: Date.parse('2026-10-22T09:00:00.000Z'),
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(type === 'application/json' ? JSON.stringify(body) : body, {
      status,
      headers: { 'content-type': type },
    });
  const problem = (status, detail) =>
    answer(status, {
      type: 'https://tools.ietf.org/html/rfc2616#section-10',
      title: 'An error occurred',
      status,
      detail,
    });

  /** A new article, as Wallabag stores it after fetching the page. */
  function addEntry({
    url,
    title = 'A new article',
    tags = [],
    readingTime = 5,
    archived = false,
    starred = false,
  } = {}) {
    state.clock += 60_000;
    const id = Math.max(0, ...state.entries.map((e) => e.id)) + 1;
    const at = wallabagDate(state.clock);
    const address = url ?? `https://news.example.org/${id}`;
    const entry = {
      ...structuredClone(recorded[0]),
      id,
      title,
      url: address,
      given_url: address,
      domain_name: new URL(address).hostname,
      reading_time: readingTime,
      tags: tags.map((label, index) => ({ id: 100 + index, label, slug: `t:${label}` })),
      is_archived: archived ? 1 : 0,
      is_starred: starred ? 1 : 0,
      archived_at: archived ? at : null,
      starred_at: starred ? at : null,
      created_at: at,
      updated_at: at,
    };
    state.entries.push(entry);
    return entry;
  }

  function archive(id, at) {
    state.clock += 1000;
    const entry = state.entries.find((e) => e.id === id);
    entry.is_archived = 1;
    entry.archived_at = wallabagDate(at ?? state.clock);
    return entry;
  }

  function issue() {
    state.issued += 1;
    const access = `access-${state.issued}`;
    const refresh = `refresh-${state.issued}`;
    state.tokens.set(access, false);
    state.refreshTokens.add(refresh);
    return {
      access_token: access,
      expires_in: 3600,
      token_type: 'bearer',
      scope: null,
      refresh_token: refresh,
    };
  }

  function list(searchParams) {
    let items = [...state.entries];
    if (searchParams.has('archive')) {
      items = items.filter((e) => e.is_archived === Number(searchParams.get('archive')));
    }
    if (searchParams.has('starred')) {
      items = items.filter((e) => e.is_starred === Number(searchParams.get('starred')));
    }
    const tags = (searchParams.get('tags') ?? '').split(',').filter(Boolean);
    if (tags.length > 0) {
      items = items.filter((e) => tags.every((t) => e.tags.some((tag) => tag.label === t)));
    }
    const key =
      { archived: 'archived_at', updated: 'updated_at' }[searchParams.get('sort')] ?? 'created_at';
    items.sort((a, b) => (a[key] ?? '').localeCompare(b[key] ?? '') || a.id - b.id);
    if (searchParams.get('order') !== 'asc') {
      items.reverse();
    }
    const perPage = Number(searchParams.get('perPage') ?? 30);
    const page = Number(searchParams.get('page') ?? 1);
    const pages = Math.max(1, Math.ceil(items.length / perPage));
    if (page > pages) {
      return fixture('entries-page-out');
    }
    const slice = items.slice((page - 1) * perPage, page * perPage).map((e) => ({
      ...e,
      content: searchParams.get('detail') === 'metadata' ? null : '<p>Content</p>',
    }));
    return {
      status: 200,
      body: {
        page,
        limit: perPage,
        pages,
        total: items.length,
        _links: {},
        _embedded: { items: slice },
      },
    };
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${pathname}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.slow) {
      await new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal.reason));
      });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    if (method === 'POST' && pathname === '/oauth/v2/token') {
      const form = new URLSearchParams(String(init.body));
      if (form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) {
        return answer(400, fixture('token-bad-client').body);
      }
      if (form.get('grant_type') === 'password') {
        state.passwordGrants += 1;
        if (form.get('username') !== USERNAME || form.get('password') !== PASSWORD) {
          return answer(400, fixture('token-bad-password').body);
        }
        return answer(200, issue());
      }
      if (form.get('grant_type') === 'refresh_token') {
        if (!state.refreshTokens.delete(form.get('refresh_token'))) {
          return answer(400, fixture('token-bad-refresh').body);
        }
        return answer(200, issue());
      }
      return answer(400, { error: 'invalid_request', error_description: 'Invalid grant_type' });
    }
    if (!pathname.startsWith('/api/')) {
      return problem(404, 'Not Found');
    }
    const token = (init.headers?.Authorization ?? '').replace(/^Bearer /, '');
    if (!state.tokens.has(token) || state.tokens.get(token)) {
      return answer(401, fixture('unauthorized').body);
    }
    const path = pathname.slice(4);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;

    if (method === 'GET' && path === '/user.json') {
      return answer(200, state.user);
    }
    if (method === 'GET' && path === '/entries.json') {
      const { status, body: page } = list(searchParams);
      return answer(status, page);
    }
    if (method === 'GET' && path === '/entries/exists.json') {
      const entry = state.entries.find((e) => e.url === searchParams.get('url'));
      return answer(200, { exists: entry ? entry.id : null });
    }
    if (method === 'POST' && path === '/entries.json') {
      if (!body?.url) {
        return answer(500, fixture('server-error').body);
      }
      const tags = (body.tags ?? '').split(',').filter(Boolean);
      const known = state.entries.find((e) => e.url === body.url);
      if (known) {
        for (const label of tags) {
          if (!known.tags.some((t) => t.label === label)) {
            known.tags.push({ id: 200 + known.tags.length, label, slug: `t:${label}` });
          }
        }
        return answer(200, known);
      }
      const page = state.pages?.[body.url] ?? { title: new URL(body.url).pathname, readingTime: 0 };
      return answer(
        200,
        addEntry({ url: body.url, title: page.title, readingTime: page.readingTime, tags }),
      );
    }
    const match = path.match(/^\/entries\/(\d+)\.json$/);
    if (method === 'PATCH' && match) {
      const entry = state.entries.find((e) => e.id === Number(match[1]));
      if (!entry) {
        return answer(404, fixture('patch-missing').body);
      }
      if (body?.archive === 1 && entry.is_archived !== 1) {
        archive(entry.id);
      }
      return answer(200, entry);
    }
    return problem(404, 'Not Found');
  }

  return {
    state,
    fetch,
    addEntry,
    archive,
    goDown() {
      state.down = true;
    },
    goUp() {
      state.down = false;
    },
    /** Every access token issued so far is now expired. */
    expireTokens() {
      for (const token of state.tokens.keys()) {
        state.tokens.set(token, true);
      }
    },
  };
}
