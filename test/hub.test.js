// The hub against the SDK's fake Gladys and a fake Wallabag built on real
// Wallabag 2.6.14 answers: device and states, the two triggers, the scene
// actions, the widget, the tokens and the connection status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MemoryStore } from '../src/store.js';
import { CONFIG, HOST, NOW, createWallabag } from './helpers/fakeWallabag.js';
import { USER, createAll, createWorld, mainDevice, mainFeature } from './helpers/world.js';

const events = (fake, key = 'new_entry') => fake.sceneEvents.filter((e) => e.key === key);
const unreadIds = (server) =>
  server.state.entries
    .filter((e) => e.is_archived === 0)
    .map((e) => e.id)
    .sort();

test('one Wallabag device, its four counters once added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.external_id, d.name]),
    [[mainDevice, 'Wallabag']],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    ['Articles non lus', 'Articles favoris', "Lus aujourd'hui", 'Temps de lecture (non lus)'],
  );
  assert.equal(world.fake.lastState(mainFeature('unread')), undefined, 'nothing before adding');
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('unread')), 3);
  assert.equal(world.fake.lastState(mainFeature('starred')), 1);
  assert.equal(world.fake.lastState(mainFeature('read_today')), 1);
  assert.equal(world.fake.lastState(mainFeature('reading_time')), 26, '4 + 13 + 9 minutes');
  assert.equal((await world.fake.poll(devices[0])).success, true);
});

test('the counters follow Wallabag at each read; yesterday is not today', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.addEntry({ readingTime: 30 });
  world.server.archive(9);
  world.server.archive(7, Date.parse('2026-10-21T12:00:00.000Z'));
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('unread')), 2);
  assert.equal(world.fake.lastState(mainFeature('read_today')), 2);
  assert.equal(world.fake.lastState(mainFeature('reading_time')), 34);
  assert.equal(world.fake.lastState(mainFeature('starred')), 1, 'starred, even archived');
  // The next day, nothing is read yet.
  world.clock.now = NOW + 24 * 3_600_000;
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('read_today')), 0);
});

test('many unread articles: every page is read, past the cap the time is estimated', async (t) => {
  const server = createWallabag();
  for (let i = 0; i < 2100; i += 1) {
    server.addEntry({ readingTime: 2 });
  }
  const world = await createWorld({ server });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('unread')), 2103);
  // 2000 read: the 3 of the fixtures are among the 100 not read, at 2 min each.
  assert.equal(world.fake.lastState(mainFeature('reading_time')), 4206);
});

test('new articles: nothing at the first read, then one event each', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read is a baseline');
  world.server.addEntry({
    url: 'https://www.lemonde.fr/article',
    title: 'Un article',
    tags: ['actu', 'à lire'],
    readingTime: 7,
  });
  world.server.addEntry({ title: 'Saved and read at once', archived: true });
  await world.hub.refresh();
  const fired = events(world.fake);
  assert.equal(fired.length, 2);
  assert.deepEqual(fired[0].data, {
    domain: 'www.lemonde.fr',
    title: 'Un article',
    url: 'https://www.lemonde.fr/article',
    tags: 'actu, à lire',
    reading_time: 7,
    starred: false,
    entry_id: 11,
  });
  assert.equal(events(world.fake, 'entry_archived').length, 1, 'and archived');
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 2, 'never twice');
});

test('articles archived: once each, in order, and again after being restored', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(events(world.fake, 'entry_archived').length, 0, 'the baseline');
  world.server.archive(9);
  world.server.archive(7);
  await world.hub.refresh();
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake, 'entry_archived').map((e) => [e.data.entry_id, e.data.title]),
    [
      [9, 'Gladys 5.2 is out'],
      [7, 'Zigbee tips for beginners'],
    ],
  );
  assert.equal(events(world.fake, 'entry_archived')[1].data.starred, true);
  // Two archived in the same second as the last one seen.
  const at = world.server.state.clock;
  world.server.archive(10, at);
  await world.hub.refresh();
  assert.equal(events(world.fake, 'entry_archived').length, 3);
  // Restored to unread, then read again.
  const zigbee = world.server.state.entries.find((e) => e.id === 7);
  zigbee.is_archived = 0;
  zigbee.archived_at = null;
  await world.hub.refresh();
  world.server.archive(7);
  await world.hub.refresh();
  assert.equal(events(world.fake, 'entry_archived').length, 4);
});

test('a burst (an import) announces the ten newest, the rest is recorded as seen', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 15; i += 1) {
    world.server.addEntry({ title: `Article ${i}` });
  }
  await world.hub.refresh();
  const fired = events(world.fake);
  assert.equal(fired.length, 10);
  assert.equal(fired[0].data.title, 'Article 5');
  assert.equal(fired[9].data.title, 'Article 14');
  for (const entry of world.server.state.entries.filter((e) => e.is_archived === 0)) {
    world.server.archive(entry.id);
  }
  await world.hub.refresh();
  assert.equal(events(world.fake, 'entry_archived').length, 10);
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 20);
});

test('an event Gladys did not take is fired again at the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let down = true;
  world.gladys.publishSceneEvent = async (...args) => {
    if (down) {
      throw Object.assign(new Error('Gladys restarting'), { status: 503 });
    }
    return publish(...args);
  };
  world.server.addEntry({ title: 'First' });
  world.server.addEntry({ title: 'Second' });
  world.server.archive(9);
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0);
  down = false;
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['First', 'Second'],
  );
  assert.equal(events(world.fake, 'entry_archived').length, 1);
});

test('what was seen survives a restart; another server is a new baseline', async (t) => {
  const store = new MemoryStore();
  const server = createWallabag();
  const first = await createWorld({ server, store });
  await first.app.stop();
  assert.equal(store.data.user, USER);
  assert.equal(store.data.lastId, 10);
  assert.equal(store.data.server, HOST);
  assert.deepEqual(store.data.archivedIds, [8]);
  server.addEntry({ title: 'While stopped' });
  server.archive(10);
  const second = await createWorld({ server, store });
  assert.deepEqual(
    events(second.fake).map((e) => e.data.title),
    ['While stopped'],
  );
  assert.deepEqual(
    events(second.fake, 'entry_archived').map((e) => e.data.entry_id),
    [10],
  );
  await second.app.stop();
  server.addEntry({ title: 'On the other server' });
  const third = await createWorld({
    server,
    store,
    config: { ...CONFIG, url: 'http://192.0.2.41' },
  });
  t.after(() => third.app.stop());
  assert.equal(third.fake.sceneEvents.length, 0);
});

test('save a link: tags, already saved, a bad address', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.state.pages = {
    'https://cooking.example.net/pie': { title: 'An apple pie', readingTime: 6 },
  };
  let ack = await world.fake.sceneAction('save_url', {
    url: ' https://cooking.example.net/pie ',
    tags: 'cuisine; week-end, Cuisine',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    entry_id: 11,
    title: 'An apple pie',
    domain: 'cooking.example.net',
    reading_time: 6,
    already_saved: false,
  });
  const saved = world.server.state.entries.at(-1);
  assert.deepEqual(
    saved.tags.map((tag) => tag.label),
    ['cuisine', 'week-end'],
  );
  assert.equal(world.fake.lastState(mainFeature('unread')), 4, 'read again at once');
  ack = await world.fake.sceneAction('save_url', {
    url: 'https://blog.example.org/zigbee-tips',
    tags: 'gladys',
  });
  assert.equal(ack.data.outputs.already_saved, true);
  assert.equal(ack.data.outputs.entry_id, 7);
  ack = await world.fake.sceneAction('save_url', { url: 'not a url' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /adresse web/);
});

test('archive an article: by id, by address, a missing one', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('archive_entry', { entry: '9' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { entry_id: 9, title: 'Gladys 5.2 is out' });
  ack = await world.fake.sceneAction('archive_entry', {
    entry: 'https://cooking.example.net/bread',
  });
  assert.deepEqual(ack.data.outputs, { entry_id: 10, title: 'A simple bread recipe' });
  assert.deepEqual(unreadIds(world.server), [7]);
  ack = await world.fake.sceneAction('archive_entry', { entry: '99999' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /n'est pas dans Wallabag/);
  ack = await world.fake.sceneAction('archive_entry', { entry: 'https://nothing.example.org/' });
  assert.match(ack.error, /n'est pas dans Wallabag/);
  ack = await world.fake.sceneAction('archive_entry', { entry: 'twelve' });
  assert.match(ack.error, /identifiant/);
});

test('read the unread titles, of all or one tag', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('read_unread', { count: '3' });
  assert.deepEqual(ack.data.outputs, {
    count: 3,
    unread: 3,
    titles: [
      'A simple bread recipe — cooking.example.net',
      'Gladys 5.2 is out — www.example.com',
      'Zigbee tips for beginners — blog.example.org',
    ].join('\n'),
    reading_time: 26,
    latest_title: 'A simple bread recipe',
    latest_url: 'https://cooking.example.net/bread',
    latest_id: 10,
  });
  ack = await world.fake.sceneAction('read_unread', { tag: 'zigbee' });
  assert.equal(ack.data.outputs.count, 1);
  assert.equal(ack.data.outputs.latest_id, 7);
  ack = await world.fake.sceneAction('read_unread', { tag: 'nothing' });
  assert.equal(ack.data.outputs.count, 0);
  assert.equal(ack.data.outputs.titles, '');
});

test('the widget: counts, the newest unread articles, a tag, a refresh button', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, url: 'https://wallabag.example.org' } });
  t.after(() => world.app.stop());
  let content = (await world.fake.widgetGet('unread', { language: 'fr', settings: {} })).data
    .content;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  const [unread, reading, today, list, refresh] = content.components;
  assert.deepEqual([unread.label, unread.value], ['Non lus', 3]);
  assert.deepEqual([reading.label, reading.value], ['À lire', '26 min']);
  assert.deepEqual([today.label, today.value], ["Lus aujourd'hui", 1]);
  assert.equal(list.items.length, 3);
  assert.deepEqual(list.items[2], {
    title: 'Zigbee tips for beginners',
    subtitle: 'blog.example.org · 9 min',
    badge: { text: 'Favori', color: 'warning' },
    description: '#domotique #zigbee #later',
    links: [
      { url: 'https://blog.example.org/zigbee-tips', label: "Lire l'article" },
      { url: 'https://wallabag.example.org/view/7', label: 'Ouvrir dans Wallabag' },
    ],
  });
  assert.equal(refresh.action.key, 'refresh');

  content = (await world.fake.widgetGet('unread', { language: 'en', settings: { tag: 'cuisine' } }))
    .data.content;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  assert.deepEqual([content.components[0].label, content.components[0].value], ['#cuisine', 1]);
  assert.equal(content.components[1].items[0].title, 'A simple bread recipe');

  world.server.archive(10);
  const ack = await world.fake.widgetAction('unread', 'refresh', {}, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  content = (await world.fake.widgetGet('unread', { language: 'en', settings: { tag: 'cuisine' } }))
    .data.content;
  assert.equal(content.components[1].text, 'Nothing left to read.');
});

test('tokens: refreshed when they expire, a new login when the refresh token is gone', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.server.state.passwordGrants, 1);
  // An hour later: the token is renewed with the refresh token, no password.
  world.clock.now += 3_600_000;
  await world.hub.refresh();
  assert.equal(world.server.state.passwordGrants, 1);
  assert.equal(world.server.state.issued, 2);
  // Revoked early: the 401 renews it once.
  world.server.expireTokens();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.server.state.issued, 3);
  // The refresh token is gone too (14 days): log in again.
  world.server.expireTokens();
  world.server.state.refreshTokens.clear();
  await world.hub.refresh();
  assert.equal(world.server.state.passwordGrants, 2);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('connection status: missing settings, refused login or client, down and back', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /Enter the address/);
  await world.fake.configUpdated({ ...CONFIG, url: 'ftp://nope' });
  assert.match(world.fake.connectionStatus.message.en, /not valid/);
  await world.fake.configUpdated({ ...CONFIG, client_secret: '' });
  assert.match(world.fake.connectionStatus.message.en, /client ID and secret/);
  await world.fake.configUpdated({ ...CONFIG, password: '' });
  assert.match(world.fake.connectionStatus.message.en, /username and password/);
  await world.fake.configUpdated({ ...CONFIG, password: 'wrong' });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /refusé le nom d'utilisateur/);
  await world.fake.configUpdated({ ...CONFIG, client_secret: 'wrong' });
  assert.match(world.fake.connectionStatus.message.en, /refused the API client/);
  await world.fake.configUpdated(CONFIG);
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.goDown();
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  const widget = (await world.fake.widgetGet('unread', { settings: {} })).data.content;
  assert.ok(widget.components.some((c) => /does not answer/.test(c.text ?? '')));
  const ack = await world.fake.widgetAction('unread', 'refresh', {}, { settings: {} });
  assert.equal(ack.success, false);
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.state.html = true;
  await world.fake.configUpdated({ ...CONFIG, url: 'http://192.0.2.99' });
  assert.match(world.fake.connectionStatus.message.en, /does not answer like Wallabag/);
});

test('test_connection: who and how much', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(
    ack.data.message.fr,
    'Connecté à Wallabag en tant que wallabag : 3 article(s) non lu(s) (26 min de lecture), 1 favori(s).',
  );
});

test('a new language renames the features at the next discovery', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ ...CONFIG, language: 'de' });
  assert.deepEqual(
    world.fake.discoveredDevices[0].features.map((f) => f.name),
    ['Ungelesene Artikel', 'Favorisierte Artikel', 'Heute gelesen', 'Lesezeit (ungelesen)'],
  );
});
