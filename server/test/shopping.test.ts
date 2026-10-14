// The shopping list agent: "we used the last diaper" asks the parents on their lock screen, and
// a yes puts diapers on the shopping list (never a house rule).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { suppliesMentioned } from '../src/domain/shopping.js';
import type { PushSender } from '../src/domain/push.js';

test('what counts as running out of something', () => {
  assert.deepEqual(suppliesMentioned('We used the last diaper'), ['diaper']);
  assert.deepEqual(suppliesMentioned("We're out of milk and running low on wipes."), ['milk', 'wipes']);
  assert.deepEqual(suppliesMentioned('No more bread tonight'), ['bread']);
  assert.deepEqual(suppliesMentioned('That was the last time she cried'), [], '"the last time" is not a supply');
  assert.deepEqual(suppliesMentioned('She is out of the bath'), []);
  assert.deepEqual(suppliesMentioned('She fell asleep at 8:10'), []);
});

const KEY = 'shop-test-key';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const sent: Array<{ endpoint: string; msg: any }> = [];
const sender: PushSender = async (sub, payload) => (sent.push({ endpoint: sub.endpoint, msg: JSON.parse(payload) }), { statusCode: 201 });
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const state = async () => (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();

before(async () => {
  const created = createApp({ parentKey: KEY, escalateAfterMs: 60_000, pushSender: sender, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'shop-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

async function ask(question: string, item: string) {
  await client.listTools();
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question, shopping_item: item } });
  const result = (async () => {
    for await (const m of stream) if (m.type === 'result') return m.result as any;
  })();
  const deadline = Date.now() + 3000;
  while (!sent.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return { result, notification: sent[0].msg };
}

test('"we used the last diaper" → Mom taps "Add to list" on her lock screen → it is on the list, and the device says so', async () => {
  await post('/parent/api/push/subscribe', { subscription: { endpoint: 'https://push.example.com/anita', keys: { p256dh: 'x'.repeat(87), auth: 'auth-secret-16b' } }, member: 'Anita' });
  await call('start_handoff', { carer_name: 'Priya' });
  const logged = await call('log_event', { text: 'We used the last diaper', kind: 'note' });
  const shop = logged.structuredContent.shopping_ask;
  assert.equal(shop.shopping_item, 'diaper');
  assert.match(logged.content[0].text, /asking Anita to add diaper to the shopping list/);
  assert.ok(logged.content[0].text.split(/\s+/).length <= 30);

  sent.splice(0);
  const { result, notification: n } = await ask(shop.question, shop.shopping_item);
  assert.deepEqual(n.actions.map((a: any) => a.title), ['Add to list', 'Not now']);
  const s = await state();
  assert.equal(s.questions[0].shopping_item, 'diaper');
  assert.equal(s.questions[0].category, 'general', 'not treated as a food question');

  const factsBefore = (await (await fetch(`${base}/parent/api/family?k=${KEY}`)).json()) as unknown;
  await post('/parent/api/answer', { id: n.question_id, answer: n.actions[0].answer, by: 'Anita', scope: 'always' });
  const final = await result;
  assert.equal(final.content[0].text, 'Anita added diaper to the shopping list.');
  assert.ok((await state()).shopping.includes('diaper'));
  // Never a house rule ("Yes, add it to the list" is not an answer to future questions).
  const later = await call('ask_house', { question: 'Can she have more diapers?' });
  assert.doesNotMatch(JSON.stringify(later), /add it to the list/);
  assert.ok(factsBefore);

  // Once it is on the list, running out again doesn't ask twice.
  const again = await call('log_event', { text: 'We used the last diaper', kind: 'note' });
  assert.equal(again.structuredContent.shopping_ask, undefined);
});

test('"Not now" leaves the list alone', async () => {
  const logged = await call('log_event', { text: "We're out of milk", kind: 'food' });
  const shop = logged.structuredContent.shopping_ask;
  assert.equal(shop.shopping_item, 'milk');
  sent.splice(0);
  const { result, notification: n } = await ask(shop.question, shop.shopping_item);
  await post('/parent/api/answer', { id: n.question_id, answer: n.actions[1].answer, by: 'Anita', scope: 'tonight' });
  assert.equal((await result).content[0].text, 'Anita said not now to milk.');
  assert.ok(!(await state()).shopping.includes('milk'));
});
