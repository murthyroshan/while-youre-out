// Morning debrief and "since your last visit".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { answerQuestionFromParent, createQuestion, endHandoff, logEvent, startHandoff, visibleFacts } from '../src/domain/house.js';
import { buildDebrief, saveAnswerAsRule, sinceLastVisit } from '../src/domain/debrief.js';
import { createApp } from '../src/index.js';
import type { Handoff } from '../src/db.js';

const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};
const handoffRow = (db: ReturnType<typeof fresh>, id: number) => db.prepare('SELECT * FROM handoffs WHERE id = ?').get(id) as unknown as Handoff;

test('night wakes are noticed across evenings, without diagnosing', () => {
  const db = fresh();
  const h = startHandoff(db, 'Priya');
  logEvent(db, 'Asleep at 8:10', 'sleep');
  logEvent(db, 'Woke up crying at 9, back asleep by 9:20', 'sleep');
  endHandoff(db);
  const d = buildDebrief(db, handoffRow(db, h.id));
  const wake = d.insights.find((i) => /woke up at night/.test(i));
  assert.ok(wake, d.insights.join(' | '));
  assert.match(wake!, /of the last 4 evenings/);
  assert.doesNotMatch(d.insights.join(' '), /\b(sick|ill|disorder|diagnos)/i);
});

test('the asleep time the carer said beats when they logged it', () => {
  const db = fresh();
  const h = startHandoff(db, 'Priya');
  logEvent(db, 'Fell asleep at 8:40', 'sleep');
  endHandoff(db);
  const insight = buildDebrief(db, handoffRow(db, h.id)).insights.find((i) => /^Asleep at/.test(i));
  assert.match(insight ?? '', /Asleep at 8:40 pm, 40 minutes after the plan's 8:00 pm/);
});

test('things that ran out are picked up from the log', () => {
  const db = fresh();
  const h = startHandoff(db, 'Priya');
  logEvent(db, 'Used the last diaper');
  logEvent(db, "We're out of milk.");
  endHandoff(db);
  assert.deepEqual(buildDebrief(db, handoffRow(db, h.id)).supplies, ['diaper', 'milk']);
});

test('tonight-only answers can become house rules, but never food or medicine', () => {
  const db = fresh();
  const h = startHandoff(db, 'Priya');
  const play = createQuestion(db, 'Can she play in the garden?');
  answerQuestionFromParent(db, play.id, "Yes, that's fine.", 'Anita', 'tonight');
  const food = createQuestion(db, 'Can she have a popsicle?');
  answerQuestionFromParent(db, food.id, "Yes, that's fine.", 'Anita', 'tonight');
  endHandoff(db);
  const d = buildDebrief(db, handoffRow(db, h.id));
  assert.deepEqual(
    d.rule_suggestions.map((r) => r.text),
    ['Can she play in the garden?'],
  );
  assert.ok(saveAnswerAsRule(db, play.id));
  assert.ok(visibleFacts(db, 'carer').some((f) => /play in the garden/.test(f.text) && !f.expires_at), 'now permanent');
  assert.equal(saveAnswerAsRule(db, food.id), false);
});

test('a returning carer hears what changed since their last visit', () => {
  const db = fresh();
  // Priya's most recent seeded evening was about two weeks ago; two rules were added since.
  const h = startHandoff(db, 'Priya');
  const since = sinceLastVisit(db, 'Priya', h.id)!;
  const added = since.added.map((a) => a.text);
  assert.ok(added.includes('No sweets after 6 pm.'));
  assert.ok(added.some((t) => /nap ends after 4 pm/.test(t)));
  assert.ok(!added.some((t) => /allergic to peanuts/.test(t)), 'old rules are not repeated');
});

test('a first-time carer gets no "since your last visit"', () => {
  const db = fresh();
  const h = startHandoff(db, 'Grandma Lakshmi');
  assert.equal(sinceLastVisit(db, 'Grandma Lakshmi', h.id), null);
});

// ---------- through MCP and the parent page ----------

let http: Server;
let base: string;
let close: () => void;
let client: Client;
const KEY = 'debrief-key';
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  const created = createApp({ parentKey: KEY });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'debrief-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('the briefing welcomes a returning carer with what changed', async () => {
  const r = await call('start_handoff', { carer_name: 'Priya' });
  assert.match(r.content[0].text, /^Welcome back, Priya\./); // what changed is on the card
  assert.ok(r.structuredContent.since_last_visit.added.length >= 2);
});

test('end_handoff gives the debrief, and the parent page shows it with actions', async () => {
  await call('log_event', { text: 'Woke up crying at 9', kind: 'sleep' });
  await call('log_event', { text: 'Used the last diaper' });
  const asked = await call('ask_parent', { question: 'Can she play with the bubbles?' });
  await post('/parent/api/answer', { k: KEY, id: asked.structuredContent.id, answer: "Yes, that's fine.", by: 'Anita', scope: 'tonight' });
  const end = await call('end_handoff');
  assert.ok(end.structuredContent.insights.length >= 1);
  assert.equal(end.structuredContent.rule_suggestions.length, 1);

  const state = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  assert.equal(state.debrief.carer, 'Priya');
  assert.deepEqual(state.debrief.supplies, ['diaper']);
  const save = await post('/parent/api/save-rule', { k: KEY, question_id: asked.structuredContent.id });
  assert.equal(save.status, 200);
  const shop = await post('/parent/api/shopping', { k: KEY, item: 'diaper' });
  assert.deepEqual((await shop.json()).shopping, ['diaper']);
  assert.equal((await post('/parent/api/save-rule', { k: 'wrong', question_id: 1 })).status, 401);
});
