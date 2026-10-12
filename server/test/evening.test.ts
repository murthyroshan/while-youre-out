// A full scripted evening against the real HTTP server, driven by the official MCP client.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { FORBIDDEN_REASSURANCE } from '../src/domain/safety.js';

let http: Server;
let stopTasks: () => void;
let base: string;
let client: Client;
const KEY = 'test-key';

type ToolOut = { content: Array<{ type: string; text?: string }>; structuredContent?: any; isError?: boolean };
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolOut;
const text = (r: ToolOut) => r.content.map((c) => c.text ?? '').join(' ');

before(async () => {
  const created = createApp({ parentKey: KEY, escalateAfterMs: 300 });
  const { app } = created;
  stopTasks = created.close;
  http = app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'evening-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  stopTasks(); // the task store keeps expiry timers alive
  http.closeAllConnections();
  http.close();
});

test('negotiates the 2025-11-25 protocol and lists the tools', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['start_handoff', 'ask_house', 'where_is', 'log_event', 'ask_parent', 'ask_parent_and_wait', 'emergency', 'end_handoff']) {
    assert.ok(names.includes(n), `missing tool ${n}`);
  }
  const ask = tools.find((t) => t.name === 'ask_house')!;
  assert.equal((ask._meta as any)?.ui?.resourceUri, 'ui://while-youre-out/card.html');
  const card = await client.readResource({ uri: 'ui://while-youre-out/card.html' });
  assert.equal(card.contents[0].mimeType, 'text/html;profile=mcp-app');
});

test('handoff briefing leads with the allergy and the EpiPen', async () => {
  const r = await call('start_handoff', { carer_name: 'Priya' });
  assert.equal(r.structuredContent.view, 'briefing');
  assert.match(r.structuredContent.must_know[0], /peanut/i);
  assert.match(text(r), /EpiPen/);
});

test('food questions return the allergy in the parent\'s words, a guard, and never say "safe"', async () => {
  const r = await call('ask_house', { question: 'Can Maya have the cookies on the counter?' });
  const s = r.structuredContent;
  assert.equal(s.category, 'food');
  assert.match(s.facts[0].text, /allergic to peanuts/);
  assert.ok(s.guard);
  assert.equal(s.suggest_ask_parent, true);
  assert.doesNotMatch(text(r), FORBIDDEN_REASSURANCE);
});

test('medicine questions are always guarded', async () => {
  const r = await call('ask_house', { question: 'She feels warm, can I give her some Tylenol?' });
  assert.equal(r.structuredContent.category, 'medicine');
  assert.match(r.structuredContent.guard, /never decide on medicine/);
});

test('private information stays private from the carer', async () => {
  const back = await call('ask_house', { question: 'When will her parents be back?' });
  assert.equal(back.structuredContent.category, 'return_time');
  assert.doesNotMatch(text(back), /11/);
  const code = await call('ask_house', { question: "What's the alarm code?" });
  assert.equal(code.structuredContent.category, 'secret');
});

test('routine questions answer from the manual', async () => {
  const r = await call('ask_house', { question: 'What time is bedtime?' });
  assert.match(text(r), /lights out at 8/);
});

test('permission questions the manual only touches on offer to ask a parent', async () => {
  const r = await call('ask_house', { question: 'Can she sleep in your bed?' });
  assert.equal(r.structuredContent.exact, false);
  assert.equal(r.structuredContent.suggest_ask_parent, true);
  assert.match(text(r), /haven't said exactly/);
});

test('where_is returns the EpiPen location', async () => {
  const r = await call('where_is', { item: 'epipen' });
  assert.equal(r.structuredContent.view, 'location');
  assert.match(r.structuredContent.description, /left of the stove/);
});

test('ask_parent_and_wait runs as a task, escalates, and completes when a parent answers', async () => {
  await client.listTools(); // lets the client learn which tools are tasks
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question: 'Can she sleep in your bed tonight?' } });
  const statuses: string[] = [];
  let answered = false;
  let final: ToolOut | undefined;
  for await (const msg of stream) {
    if (msg.type === 'taskStatus') {
      statuses.push(msg.task.statusMessage ?? msg.task.status);
      // The client polls every couple of seconds, so it may skip intermediate messages.
      if (!answered && statuses.some((s) => /Also asked/.test(s))) {
        answered = true;
        const state = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
        const q = state.questions.find((x: any) => /sleep in your bed/.test(x.text));
        const res = await fetch(`${base}/parent/api/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ k: KEY, id: q.id, answer: 'Yes, on weekends only.', scope: 'always', by: 'Rahul' }),
        });
        assert.equal(res.status, 200);
      }
    }
    if (msg.type === 'result') final = msg.result as ToolOut;
    if (msg.type === 'error') throw msg.error;
  }
  assert.ok(statuses.some((s) => /Asked Anita/.test(s)), `statuses: ${statuses.join(' | ')}`);
  assert.ok(final);
  assert.match(text(final!), /Rahul said: "Yes, on weekends only."/);
  // "always" answers become rules the carer can be told next time.
  const again = await call('ask_house', { question: 'Is she allowed to sleep in the parents bed?' });
  assert.match(text(again), /weekends only/);
});

test('emergency returns the fixed script, address and action plan', async () => {
  const r = await call('ask_house', { question: "Her lips are swelling and she can't breathe properly" });
  assert.equal(r.structuredContent.emergency, true);
  const e = await call('emergency', { description: 'Lips swelling, trouble breathing' });
  const s = e.structuredContent;
  assert.equal(s.view, 'emergency');
  assert.match(s.say_first, /Call 911 now/);
  assert.match(s.address, /Maple Street/);
  assert.ok(s.action_plan.steps.length >= 3);
  assert.deepEqual(s.parents_alerted.slice(0, 2), ['Anita (Mom)', 'Rahul (Dad)']);
  const state = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  assert.match(state.emergency.description, /Lips swelling/);
});

test('the evening log and summary reach the parents', async () => {
  await call('log_event', { text: 'Asleep at 8:10', kind: 'sleep' });
  await call('log_event', { text: 'Woke up crying at 9, back asleep by 9:20', kind: 'sleep' });
  const r = await call('end_handoff');
  const s = r.structuredContent;
  assert.equal(s.view, 'summary');
  assert.equal(s.timeline.length, 2);
  assert.ok(s.questions.some((q: string) => /weekends only/.test(q)));
});

test('the parent API rejects a wrong key', async () => {
  const res = await fetch(`${base}/parent/api/state?k=wrong`);
  assert.equal(res.status, 401);
});
