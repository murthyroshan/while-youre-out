// Edge cases and misuse: logging safety, rule expiry, validation, and the parent API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';

let http: Server;
let close: () => void;
let base: string;
let client: Client;
const KEY = 'edge-key';

type ToolOut = { content: Array<{ type: string; text?: string }>; structuredContent?: any; isError?: boolean };
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolOut;
const text = (r: ToolOut) => r.content.map((c) => c.text ?? '').join(' ');
const state = async () => (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
const answer = (body: Record<string, unknown>) =>
  fetch(`${base}/parent/api/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });

before(async () => {
  const created = createApp({ parentKey: KEY, escalateAfterMs: 60_000 });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'edge-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('logging before any handoff is a clear error, not a crash', async () => {
  const r = await call('log_event', { text: 'Asleep at 8' });
  assert.equal(r.isError, true);
  assert.match(text(r), /no handoff/i);
});

test('an empty carer name is rejected', async () => {
  const r = await call('start_handoff', { carer_name: '   ' });
  assert.equal(r.isError, true);
});

test('logging that she ate an allergen raises an alert and tells the parents', async () => {
  await call('start_handoff', { carer_name: 'Priya' });
  const r = await call('log_event', { text: 'She ate a peanut butter cookie from the counter', kind: 'food' });
  assert.ok(r.structuredContent.allergy_alert, 'expected an allergy alert');
  assert.deepEqual(r.structuredContent.allergens, ['peanut']);
  assert.match(text(r), /emergency/);
  const s = await state();
  const urgent = s.questions.find((q: any) => /peanut butter cookie/.test(q.text));
  assert.ok(urgent, 'parents should see an urgent card');
  assert.equal(urgent.urgency, 'urgent');
});

test('logging something that sounds like an emergency is flagged', async () => {
  const r = await call('log_event', { text: "Her lips look swollen and she's coughing" });
  assert.equal(r.structuredContent.emergency, true);
});

test('harmless logs stay harmless', async () => {
  const r = await call('log_event', { text: 'Played with her fire truck, then bath' });
  assert.ok(!r.structuredContent.emergency);
  assert.ok(!r.structuredContent.allergy_alert);
});

test('a "just tonight" answer applies tonight and ends with the handoff', async () => {
  const asked = await call('ask_parent', { question: 'Can she stay up until 9 to finish the movie?' });
  const id = asked.structuredContent.id;
  const res = await answer({ id, answer: 'Yes, just this once.', scope: 'tonight', by: 'Anita' });
  assert.equal(res.status, 200);
  const during = await call('ask_house', { question: 'Can she stay up to finish the movie?' });
  assert.match(text(during), /just this once/);
  await call('end_handoff');
  await call('start_handoff', { carer_name: 'Dadi' });
  const next = await call('ask_house', { question: 'Can she stay up to finish the movie?' });
  assert.doesNotMatch(text(next), /just this once/);
});

test('an "always" answer survives into the next handoff', async () => {
  const asked = await call('ask_parent', { question: 'Can she have a bath with bubbles?' });
  await answer({ id: asked.structuredContent.id, answer: 'Yes, bubbles are fine.', scope: 'always', by: 'Rahul' });
  await call('end_handoff');
  await call('start_handoff', { carer_name: 'Priya' });
  const r = await call('ask_house', { question: 'Can she have bubbles in the bath?' });
  assert.match(text(r), /bubbles are fine/);
});

test('"What\'s for dinner?" is answered with the dinner note, after the allergy in one sentence', async () => {
  const r = await call('ask_house', { question: 'What should the kids eat for dinner?' });
  assert.match(text(r), /^Maya is allergic to peanuts\. Anita said: "Dinner is the dal and rice in the fridge\." /);
});

test('"Call me" is not saved as a house rule', async () => {
  const asked = await call('ask_parent', { question: 'Can she go to the neighbours house?' });
  await answer({ id: asked.structuredContent.id, answer: 'Please call me.', scope: 'always', by: 'Anita' });
  // The carer is told once (the answer comes first in their next reply)...
  const told = await call('ask_house', { question: 'Can she go to the neighbours house?' });
  assert.match(told.structuredContent.notices[0], /Please call me/);
  // ...but it is not a house rule.
  const r = await call('ask_house', { question: 'Can she go to the neighbours house?' });
  assert.doesNotMatch(text(r), /call me/i);
});

test('ending a handoff closes its unanswered questions', async () => {
  await call('ask_parent', { question: 'Is the back door supposed to be locked?' });
  assert.ok((await state()).questions.some((q: any) => /back door/.test(q.text)));
  await call('end_handoff');
  assert.ok(!(await state()).questions.some((q: any) => /back door/.test(q.text)));
});

test('the parent API validates its input', async () => {
  assert.equal((await answer({ id: 999999, answer: 'Yes' })).status, 404);
  assert.equal((await answer({ id: 'abc', answer: 'Yes' })).status, 400);
  assert.equal((await answer({ id: 1, answer: '   ' })).status, 400);
  assert.equal((await answer({ id: 1, answer: 'x'.repeat(1001) })).status, 400);
  const wrongKey = await fetch(`${base}/parent/api/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ k: 'edge-kez', id: 1, answer: 'Yes' }),
  });
  assert.equal(wrongKey.status, 401);
});

test('the parent page escapes what the carer typed', async () => {
  await call('start_handoff', { carer_name: 'Priya' });
  await call('ask_parent', { question: '<img src=x onerror=alert(1)> can she?' });
  const page = await (await fetch(`${base}/parent`)).text();
  assert.match(page, /function esc\(/); // questions are rendered through esc(), never raw innerHTML
  const s = await state();
  assert.ok(s.questions.some((q: any) => q.text.includes('<img')), 'raw text is stored; escaping happens at render');
});

test('emergency works even with no handoff in progress, and fire gets the fire script', async () => {
  await call('end_handoff');
  const r = await call('emergency', { description: 'The smoke alarm is going off' });
  const s = r.structuredContent;
  assert.equal(s.kind, 'fire');
  assert.match(s.say_first, /Get everyone out/);
  assert.ok(!s.action_plan.steps.some((x: any) => /EpiPen/.test(x.text)), 'fire must not read the allergy plan');
  assert.equal(s.epipen_location, null);
});

test('poisoning sends the carer to Poison Control', async () => {
  const r = await call('emergency', { description: 'She drank some bleach' });
  assert.equal(r.structuredContent.kind, 'poison');
  assert.match(r.structuredContent.say_first, /Poison Control/);
});

// ---------- fixes from the independent review ----------

test('private facts never reach the voice, even with no handoff running', async () => {
  // No handoff is active here.
  const r = await call('ask_house', { question: 'When will they be back?' });
  assert.doesNotMatch(text(r), /11/);
  const manual = await client.readResource({ uri: 'house://manual' });
  assert.doesNotMatch((manual.contents[0] as any).text, /back around 11/);
});

test('starting a second handoff does not silently end the first', async () => {
  await call('start_handoff', { carer_name: 'Priya' });
  const r = await call('start_handoff', { carer_name: 'Rahul' });
  assert.equal(r.isError, true);
  assert.match(text(r), /Priya is already looking after things/);
  const replaced = await call('start_handoff', { carer_name: 'Dadi', replace: true });
  assert.equal(replaced.structuredContent.carer, 'Dadi');
});

test('asking about an allergen she already ate raises an alert', async () => {
  const r = await call('ask_house', { question: 'She already ate a peanut butter cookie, is she going to be ok?' });
  assert.ok(r.structuredContent.allergy_alert);
  assert.match(text(r), /alerted/);
});

test('brand names and "-free" labels are handled', async () => {
  const snickers = await call('log_event', { text: 'She ate half a Snickers bar' });
  assert.ok(snickers.structuredContent.allergy_alert, 'Snickers contains peanuts');
  const free = await call('log_event', { text: 'Checked the label, these cookies are peanut-free', kind: 'food' });
  assert.ok(!free.structuredContent.allergy_alert, 'peanut-free is not an exposure');
});

test('logging medicine alerts the parents', async () => {
  const r = await call('log_event', { text: 'Gave her some Tylenol at 9' });
  assert.ok(r.structuredContent.medicine_alert);
  const s = await state();
  assert.ok(s.questions.some((q: any) => /Tylenol/.test(q.text) && q.urgency === 'urgent'));
});

test('emergencies inside other requests are flagged', async () => {
  const where = await call('where_is', { item: "EpiPen, she can't breathe" });
  assert.equal(where.structuredContent.emergency, true);
  const ask = await call('ask_parent', { question: 'Ask mom what to do, she is choking' });
  assert.equal(ask.structuredContent.emergency, true);
  assert.equal(ask.structuredContent.urgency, 'urgent');
});

test('"what do I do if" questions read the plan without alerting anyone', async () => {
  const before = (await state()).emergency;
  const r = await call('ask_house', { question: 'What do I do if she has an allergic reaction?' });
  assert.equal(r.structuredContent.category, 'safety_info');
  assert.match(text(r), /allergic to peanuts/);
  assert.deepEqual((await state()).emergency, before, 'no new emergency alert');
});

test('codes given by a parent are passed on once but never stored', async () => {
  const asked = await call('ask_parent', { question: 'How do I get in if I lock myself out?' });
  await answer({ id: asked.structuredContent.id, answer: 'It is 4321, the alarm code is the same', scope: 'always', by: 'Anita' });
  // Passed on once: the parent's answer comes first in the carer's next reply...
  const once = await call('where_is', { item: 'EpiPen' });
  assert.match(once.structuredContent.notices[0], /4321/);
  // ...and never again: it was not stored.
  const r = await call('ask_house', { question: 'How do I get in if I lock myself out?' });
  assert.doesNotMatch(text(r), /4321/);
});

test('a yes to one food is never reused as an "always" rule', async () => {
  const asked = await call('ask_parent', { question: 'Can Maya have the cookies on the counter?' });
  await answer({ id: asked.structuredContent.id, answer: "Yes, that's fine.", scope: 'always', by: 'Anita' });
  await call('end_handoff');
  await call('start_handoff', { carer_name: 'Priya' });
  const r = await call('ask_house', { question: 'Can Maya have a cookie?' });
  assert.doesNotMatch(text(r), /that's fine/);
});

test('where_is matches whole names only', async () => {
  const food = await call('where_is', { item: 'her food' });
  assert.notEqual(food.structuredContent.item, 'Dog food');
  const pen = await call('where_is', { item: 'a pen' });
  assert.notEqual(pen.structuredContent.item, 'EpiPen');
  const epi = await call('where_is', { item: "Maya's EpiPen" });
  assert.equal(epi.structuredContent.item, 'EpiPen');
});

test('answering a closed question returns 409', async () => {
  const asked = await call('ask_parent', { question: 'Can she paint in the kitchen?' });
  await answer({ id: asked.structuredContent.id, answer: 'Yes', by: 'Anita' });
  const again = await answer({ id: asked.structuredContent.id, answer: 'No', by: 'Rahul' });
  assert.equal(again.status, 409);
});

test('check_parent_answer only sees the current handoff', async () => {
  const asked = await call('ask_parent', { question: 'Can she have a friend over?' });
  await call('end_handoff');
  await call('start_handoff', { carer_name: 'Someone else' });
  const r = await call('check_parent_answer', { question_id: asked.structuredContent.id });
  assert.equal(r.isError, true);
});

test('a waiting ask-a-parent task finishes when the handoff ends', async () => {
  await client.listTools();
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question: 'Can she stay up late?' } });
  let ended = false;
  let final: ToolOut | undefined;
  for await (const msg of stream) {
    if (msg.type === 'taskCreated' && !ended) {
      ended = true;
      await call('end_handoff');
    }
    if (msg.type === 'result') final = msg.result as ToolOut;
    if (msg.type === 'error') throw msg.error;
  }
  assert.match(text(final!), /handoff ended/);
});

test('teach-back over MCP, with the result on the parent page', async () => {
  await call('end_handoff');
  await call('start_handoff', { carer_name: 'Priya' });
  const q1 = await call('teachback', {});
  assert.match(text(q1), /What is Maya allergic to\?/);
  await call('teachback', { answer: 'peanuts' });
  await call('teachback', { answer: 'drawer by the stove' });
  const done = await call('teachback', { answer: 'her mom' });
  assert.match(text(done), /All 3 right/);
  const s = await state();
  assert.deepEqual([s.teachback.done, s.teachback.right, s.teachback.total], [true, 3, 3]);
});

test('an emergency said during teach-back is still an emergency', async () => {
  await call('end_handoff');
  await call('start_handoff', { carer_name: 'Priya' });
  await call('teachback', {});
  const r = await call('teachback', { answer: "Wait, she's choking!" });
  assert.equal(r.structuredContent.emergency, true);
});

test('security headers: no sniffing, no referrer, and only the simulator may frame the parent page', async () => {
  const parent = await fetch(`${base}/parent?k=${KEY}`);
  assert.equal(parent.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(parent.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(parent.headers.get('x-powered-by'), null);
  assert.match(parent.headers.get('content-security-policy') ?? '', /^frame-ancestors 'self' http:\/\/127\.0\.0\.1:\*/);
  const health = await fetch(`${base}/health`);
  assert.equal(health.headers.get('content-security-policy'), null, 'other pages (the simulator) may be embedded');
});

test('notifications only go to the browsers\' own push services, never to any URL a caller names', async () => {
  const sub = (endpoint: string) =>
    fetch(`${base}/parent/api/push/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ k: KEY, subscription: { endpoint, keys: { p256dh: 'x'.repeat(87), auth: 'auth-secret-16b' } } }),
    });
  assert.equal((await sub('https://fcm.googleapis.com/fcm/send/abc')).status, 200, 'Chrome and Android');
  assert.equal((await sub('https://web.push.apple.com/abc')).status, 200, 'Safari and iPhone');
  for (const bad of ['https://evil.example.org/hook', 'https://fcm.googleapis.com.evil.org/x', 'https://fcm.googleapis.com:8443/x', 'http://fcm.googleapis.com/x', 'https://169.254.169.254/latest']) {
    assert.equal((await sub(bad)).status, 400, bad);
  }
});

test('browsers from other websites are refused', async () => {
  const evil = await fetch(`${base}/parent/api/state?k=${KEY}`, { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const local = await fetch(`${base}/parent/api/state?k=${KEY}`, { headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(local.status, 200);
});
