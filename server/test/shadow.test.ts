// Shadow Parent and busy mode.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { busyUntil, polarity, setBusy, setShadowTopic, shadowSuggestion, shadowTopic } from '../src/domain/shadow.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';

const TZ = 'America/Los_Angeles';
const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};

after(() => resetClock());

test('reads what an answer meant', () => {
  assert.equal(polarity("Yes, that's fine."), 'yes');
  assert.equal(polarity('Sure, one more'), 'yes');
  assert.equal(polarity("No, please don't."), 'no');
  assert.equal(polarity('Not tonight'), 'no');
  assert.equal(polarity('Please call me.'), null);
  assert.equal(polarity('Ask her what she wants'), null);
});

test('only low-risk topics are ever suggested', () => {
  assert.equal(shadowTopic('Can she watch another episode?'), 'screen');
  assert.equal(shadowTopic('Can she stay up a bit later?'), 'bedtime');
  assert.equal(shadowTopic('Can she play outside?'), 'play');
  assert.equal(shadowTopic('Can she have a cookie?'), null, 'food');
  assert.equal(shadowTopic('Can I give her Tylenol?'), null, 'medicine');
  assert.equal(shadowTopic("What's the alarm code?"), null, 'secret');
  assert.equal(shadowTopic('Can she watch TV while I call 911?'), null, 'emergency');
});

test('on a Saturday: "The parents said yes 4 out of 5 times on weekends"', () => {
  const db = fresh();
  setDemoTime('19:30', TZ, 'Sat');
  const s = shadowSuggestion(db, 'Can she watch another episode?')!;
  assert.deepEqual([s.likely, s.agree, s.total, s.days], ['yes', 4, 5, 'weekends']);
  assert.match(s.message, /it's Saturday/);
  assert.match(s.message, /your call/);
  resetClock();
});

test('on a weekday the mixed history is not consistent enough to suggest anything', () => {
  const db = fresh();
  setDemoTime('19:30', TZ, 'Tue');
  assert.equal(shadowSuggestion(db, 'Can she watch another episode?'), null);
  resetClock();
});

test('a clear "no" history is suggested as a likely no', () => {
  const db = fresh();
  const s = shadowSuggestion(db, 'Can she stay up a bit later?')!;
  assert.deepEqual([s.likely, s.agree, s.total], ['no', 3, 3]);
  assert.equal(s.by, 'The parents', 'both parents answered, so neither is named alone');
});

test('too little history: no suggestion', () => {
  assert.equal(shadowSuggestion(fresh(), 'Can she paint in the kitchen?'), null);
});

test('a parent can switch a topic off', () => {
  const db = fresh();
  setShadowTopic(db, 'bedtime', false);
  assert.equal(shadowSuggestion(db, 'Can she stay up a bit later?'), null);
  setShadowTopic(db, 'bedtime', true);
  assert.ok(shadowSuggestion(db, 'Can she stay up a bit later?'));
});

test('busy mode turns itself off when the time is up', () => {
  const db = fresh();
  assert.ok(setBusy(db, 60));
  assert.ok(busyUntil(db));
  setBusy(db, 0);
  assert.equal(busyUntil(db), null);
});

// ---------- over MCP and the parent API ----------

let http: Server;
let base: string;
let close: () => void;
let client: Client;
const KEY = 'shadow-key';
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  const created = createApp({ parentKey: KEY, escalateAfterMs: 200 });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'shadow-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  await call('start_handoff', { carer_name: 'Priya' });
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('natural rephrasings still get the suggestion (filler words like "one more" are not a match)', async () => {
  setDemoTime('19:30', TZ, 'Sat');
  for (const q of ["She's begging me for one more episode of Bluey, is that ok?", 'Is it ok if she watches one more Bluey episode?']) {
    const r = await call('ask_house', { question: q });
    assert.equal(r.structuredContent.shadow?.likely, 'yes', q);
  }
  resetClock();
});

test('ask_house adds the suggestion and never claims to decide', async () => {
  setDemoTime('19:30', TZ, 'Sat');
  const r = await call('ask_house', { question: 'Can she watch another episode?' });
  assert.equal(r.structuredContent.shadow.likely, 'yes');
  assert.match(r.content[0].text, /would likely say yes, but it's your call/);
  const food = await call('ask_house', { question: 'Can she have another cookie?' });
  assert.equal(food.structuredContent.shadow, null);
  resetClock();
});

test('busy mode: small questions wait instead of moving down the contact chain', async () => {
  const set = await post('/parent/api/busy', { k: KEY, minutes: 60 });
  assert.ok((await set.json()).busy_until);
  await client.listTools();
  const statuses: string[] = [];
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question: 'Can she play with the play-doh?' } });
  const watcher = (async () => {
    for await (const m of stream) {
      if (m.type === 'taskCreated' || m.type === 'taskStatus') statuses.push(m.task.statusMessage ?? '');
      if (m.type === 'result') return m.result as any;
    }
  })();
  await new Promise((r) => setTimeout(r, 2500));
  assert.ok(statuses.some((s) => /urgent questions only/.test(s)), statuses.join(' | '));
  assert.ok(!statuses.some((s) => /Also asked/.test(s)), 'no escalation while busy');
  // The parent answers anyway from the "waiting" list.
  const st = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  const q = st.questions.find((x: any) => /play-doh/.test(x.text));
  await post('/parent/api/answer', { k: KEY, id: q.id, answer: "Yes, that's fine.", by: 'Anita' });
  const final = await watcher;
  assert.match(final.content[0].text, /Anita said/);
  await post('/parent/api/busy', { k: KEY, minutes: 0 });
});

test('busy mode never holds back urgent questions', async () => {
  await post('/parent/api/busy', { k: KEY, minutes: 60 });
  const r = await call('ask_parent', { question: 'Can I give her some Calpol?' });
  assert.equal(r.structuredContent.urgency, 'urgent');
  assert.doesNotMatch(r.content[0].text, /will wait/);
  await post('/parent/api/busy', { k: KEY, minutes: 0 });
});

test('parents can switch suggestions off per topic through the API', async () => {
  const res = await post('/parent/api/shadow', { k: KEY, topic: 'screen', on: false });
  assert.equal((await res.json()).shadow.screen, false);
  assert.equal((await post('/parent/api/shadow', { k: KEY, topic: 'food', on: true })).status, 400);
  await post('/parent/api/shadow', { k: KEY, topic: 'screen', on: true });
});
