// Sitter first: Alexa+ add-ons can't speak on their own, so what the carer hasn't heard yet (a
// parent's answer, a reminder that came due) is told at the start of their next reply.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { resetClock, setDemoTime } from '../src/clock.js';

const KEY = 'notices-key';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const answer = (id: number, text: string) =>
  fetch(`${base}/parent/api/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, id, answer: text, by: 'Anita', scope: 'tonight' }) });

before(async () => {
  // A quiet hour: no plan reminder comes due unless a test moves the clock.
  setDemoTime('10:00', 'America/Los_Angeles');
  const created = createApp({ parentKey: KEY, escalateAfterMs: 60_000, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'notices-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  await call('start_handoff', { carer_name: 'Priya' });
});

after(async () => {
  resetClock();
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test("a parent's answer the carer hasn't heard comes first in their next reply, once", async () => {
  const asked = await call('ask_parent', { question: 'Can she have a bath with bubbles?' });
  await answer(asked.structuredContent.id, "Yes, that's fine.");
  const next = await call('where_is', { item: 'EpiPen' });
  assert.match(next.content[0].text, /^Anita answered "Can she have a bath with bubbles\?": "Yes, that's fine\." EpiPen:/);
  assert.equal(next.structuredContent.notices.length, 1);
  const again = await call('where_is', { item: 'EpiPen' });
  assert.equal(again.structuredContent.notices, undefined, 'not repeated');
});

test('an answer the device already announced (it fetched it) is not repeated', async () => {
  const asked = await call('ask_parent', { question: 'Can she stay up for the movie?' });
  await answer(asked.structuredContent.id, "No, please don't.");
  const checked = await call('check_parent_answer', { question_id: asked.structuredContent.id });
  assert.match(checked.content[0].text, /Anita said/);
  const next = await call('where_is', { item: 'EpiPen' });
  assert.equal(next.structuredContent.notices, undefined);
});

test('a reminder that came due is told when the carer next talks; the device\'s own check never swallows answers', async () => {
  setDemoTime('19:16', 'America/Los_Angeles');
  const asked = await call('ask_parent', { question: 'Can Bruno sleep inside?' });
  await answer(asked.structuredContent.id, "Yes, that's fine.");
  // The device's reminder check takes the reminder, but leaves the answer for the carer.
  const check = await call('tonight_plan', { announce: true });
  assert.ok(check.structuredContent.due.includes('bath'));
  assert.equal(check.structuredContent.notices, undefined);
  const next = await call('ask_house', { question: 'What time is bedtime?' });
  assert.match(next.content[0].text, /^Anita answered "Can Bruno sleep inside\?"/);
  assert.doesNotMatch(next.content[0].text, /It's 7:15/, 'the reminder was already said');
  setDemoTime('10:00', 'America/Los_Angeles');
});

test('nothing is put in front of an emergency', async () => {
  const asked = await call('ask_parent', { question: 'Can she have juice?' });
  await answer(asked.structuredContent.id, "Yes, that's fine.");
  const r = await call('log_event', { text: "She can't breathe" });
  assert.equal(r.structuredContent.emergency, true);
  assert.equal(r.structuredContent.notices, undefined);
});

test("an answer the device was waiting for (its task) is not repeated in the next reply", async () => {
  await call('where_is', { item: 'EpiPen' }); // hears anything left from earlier tests
  await client.listTools();
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question: 'Can she paint in the kitchen?' } });
  const result = (async () => {
    for await (const m of stream) if (m.type === 'result') return m.result as any;
  })();
  let id: number | undefined;
  for (let i = 0; i < 40 && !id; i++) {
    const s = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
    id = s.questions.find((q: any) => /paint/.test(q.text))?.id;
    if (!id) await new Promise((r) => setTimeout(r, 50));
  }
  await answer(id!, "Yes, that's fine.");
  assert.match((await result).content[0].text, /Anita said/);
  const next = await call('where_is', { item: 'EpiPen' });
  assert.equal(next.structuredContent.notices, undefined, 'already heard through the task');
});
