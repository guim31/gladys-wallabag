// What reaches `docker logs` at the default level (info): the lifecycle only.
// A normal cycle (reads, published states, events, polls) writes nothing at
// info, an outage logs one line, and its recovery one more.
//
// The SDK logger writes through console.log (debug, info) and console.error
// (warn, error), re-reading LOG_LEVEL on every call: the tests capture both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createWallabag } from './helpers/fakeWallabag.js';
import { createAll, createWorld } from './helpers/world.js';

function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const captured = [];
  const record = (...args) => captured.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    all: () => [...captured],
    lines: () =>
      captured.filter((line) => !line.includes('[DEBUG]') && line.includes('[wallabag-')),
    reset: () => captured.splice(0),
  };
}

test('a normal cycle writes nothing at info: reads, states, events, polls', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const start = logs.lines();
  assert.deepEqual(start.length, 1, start.join('\n'));
  assert.match(start[0], /Connected to Wallabag \(3 unread\)/);
  logs.reset();
  for (let i = 0; i < 5; i += 1) {
    world.server.addEntry({ title: `Article ${i}` });
    await world.hub.refresh();
  }
  world.server.archive(9);
  world.clock.now += 3_600_000; // a token renewed on the way
  await world.hub.refresh();
  await world.fake.poll(world.fake.discoveredDevices[0]);
  await world.fake.widgetGet('unread', { settings: {} });
  await world.fake.sceneAction('read_unread', {});
  assert.equal(world.fake.sceneEvents.length, 6, 'events were fired');
  assert.deepEqual(logs.lines(), [], 'nothing at info or above');
});

test('one line per change asked by the user, without titles nor addresses', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  await world.fake.sceneAction('save_url', { url: 'https://private.example.org/secret?k=1' });
  await world.fake.sceneAction('archive_entry', { entry: '9' });
  const lines = logs.lines();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /\[INFO\].*Article saved in Wallabag/);
  assert.match(lines[1], /\[INFO\].*Article archived in Wallabag/);
  assert.ok(!lines.join('\n').includes('private.example.org'), 'no address is logged');
  assert.ok(!lines.join('\n').includes('Gladys 5.2'), 'no title is logged');
});

test('Wallabag down: one warning, nothing per attempt, one line when it is back', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  world.server.goDown();
  for (let i = 0; i < 4; i += 1) {
    await world.hub.refresh();
  }
  const down = logs.lines();
  assert.equal(down.length, 1, down.join('\n'));
  assert.match(down[0], /\[WARN\].*Wallabag unreachable \(ECONNREFUSED\)/);
  logs.reset();
  world.server.goUp();
  await world.hub.refresh();
  const back = logs.lines();
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*Wallabag answers again \(3 unread\)/);
});

test('the secrets and the tokens never reach the logs', async (t) => {
  const logs = captureLogs(t);
  for (const password of ['s3cr3t-wrong-password', CONFIG.password]) {
    const world = await createWorld({ server: createWallabag(), config: { ...CONFIG, password } });
    world.clock.now += 3_600_000;
    await world.hub.refresh();
    await world.app.stop();
  }
  const all = logs.all().join('\n');
  for (const secret of ['s3cr3t-wrong-password', CONFIG.password, CONFIG.client_secret]) {
    assert.ok(!all.includes(secret), secret);
  }
  assert.doesNotMatch(all, /access-\d|refresh-\d/);
});
