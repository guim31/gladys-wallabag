// The Wallabag client and the pure helpers, on the answers recorded on a real
// Wallabag 2.6.14: address normalization, error kinds, dates, references.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeUrl } from '../src/config.js';
import { WallabagClient, WallabagError } from '../src/wallabag/client.js';
import {
  formatMinutes,
  parseEntryRef,
  parseTags,
  parseUrl,
  summarizeEntry,
  timeOf,
} from '../src/wallabag/model.js';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  HOST,
  PASSWORD,
  USERNAME,
  createWallabag,
  fixture,
} from './helpers/fakeWallabag.js';

const credentials = (overrides = {}) => ({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  username: USERNAME,
  password: PASSWORD,
  ...overrides,
});

test('addresses: a bare host, a port, wallabag.it, a pasted /api, no credentials', () => {
  assert.equal(normalizeUrl('192.0.2.10'), 'http://192.0.2.10');
  assert.equal(normalizeUrl(' 192.0.2.10:8080/ '), 'http://192.0.2.10:8080');
  assert.equal(normalizeUrl('https://app.wallabag.it/'), 'https://app.wallabag.it');
  assert.equal(normalizeUrl('https://example.org/wallabag/api/'), 'https://example.org/wallabag');
  assert.equal(normalizeUrl('https://user:pw@example.org'), null);
  assert.equal(normalizeUrl('ftp://example.org'), null);
  assert.equal(normalizeUrl(''), null);
  const config = normalizeConfig({ url: 'nope nope', password: ' spaced ', refresh_minutes: '7' });
  assert.equal(config.urlInvalid, true);
  assert.equal(config.password, ' spaced ');
  assert.equal(config.refreshMinutes, 5);
  assert.equal(config.language, 'fr');
});

test('the error kinds of the token endpoint and of the API', async () => {
  const server = createWallabag();
  const kindOf = async (options) => {
    const client = new WallabagClient({ url: HOST, fetch: server.fetch, ...options });
    try {
      await client.user();
      return 'ok';
    } catch (err) {
      assert.ok(err instanceof WallabagError);
      assert.doesNotMatch(err.message, new RegExp(`${PASSWORD}|${CLIENT_SECRET}`));
      return err.kind;
    }
  };
  assert.equal(await kindOf({ credentials: credentials() }), 'ok');
  assert.equal(await kindOf({ credentials: credentials({ password: 'x' }) }), 'unauthorized');
  assert.equal(await kindOf({ credentials: credentials({ clientSecret: 'x' }) }), 'client');
  server.state.html = true;
  assert.equal(await kindOf({ credentials: credentials() }), 'invalid');
  server.state.html = false;
  server.state.slow = true;
  assert.equal(await kindOf({ credentials: credentials(), timeout: 50 }), 'timeout');
  server.state.slow = false;
  server.goDown();
  assert.equal(await kindOf({ credentials: credentials() }), 'unreachable');
});

test('a missing article is not_found; a page past the last one is empty', async () => {
  const server = createWallabag();
  const client = new WallabagClient({ url: HOST, fetch: server.fetch, credentials: credentials() });
  await assert.rejects(client.archive(99999), (err) => err.kind === 'not_found');
  assert.deepEqual(await client.entries({ archive: 0, perPage: 2, page: 9 }), {
    total: 0,
    pages: 0,
    items: [],
  });
  assert.equal(await client.exists('https://news.example.org/weather'), 8);
  assert.equal(await client.exists('https://nothing.example.org/'), null);
});

test('an article of the real API, summarized', () => {
  const [bread, , weather, zigbee] = fixture('entries-recent').body._embedded.items;
  assert.deepEqual(summarizeEntry(zigbee), {
    id: 7,
    title: 'Zigbee tips for beginners',
    url: 'https://blog.example.org/zigbee-tips',
    domain: 'blog.example.org',
    tags: ['domotique', 'zigbee', 'later'],
    readingTime: 9,
    archived: false,
    starred: true,
    createdAt: Date.parse('2026-10-22T00:41:45Z'),
    archivedAt: null,
  });
  assert.equal(summarizeEntry(weather).archivedAt, Date.parse('2026-10-22T00:41:45Z'));
  assert.equal(summarizeEntry(bread).readingTime, 4);
  // What a POST of "not a url" leaves in Wallabag: no domain, no link.
  const odd = summarizeEntry({ id: 5, title: 'not a url', url: 'not a url', domain_name: null });
  assert.deepEqual([odd.url, odd.domain, odd.readingTime], ['', '', 0]);
});

test('dates, references, tags, durations', () => {
  assert.equal(timeOf('2026-10-22T00:41:45+0000'), Date.parse('2026-10-22T00:41:45Z'));
  assert.equal(timeOf('2026-10-22T02:41:45+0200'), Date.parse('2026-10-22T00:41:45Z'));
  assert.equal(timeOf(null), null);
  assert.deepEqual(parseEntryRef(' 12 '), { id: 12 });
  assert.deepEqual(parseEntryRef(12), { id: 12 });
  assert.deepEqual(parseEntryRef('https://example.org/a'), { url: 'https://example.org/a' });
  assert.equal(parseEntryRef('0'), null);
  assert.equal(parseEntryRef('twelve'), null);
  assert.equal(parseUrl('javascript:alert(1)'), null);
  assert.equal(parseUrl('not a url'), null);
  assert.equal(parseTags(' cuisine; week-end,Cuisine,, '), 'cuisine,week-end');
  assert.equal(parseTags(undefined), '');
  assert.equal(formatMinutes(0), '0 min');
  assert.equal(formatMinutes(59), '59 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(135), '2 h 15');
  assert.ok(formatMinutes(9_999_999).length <= 12);
});
