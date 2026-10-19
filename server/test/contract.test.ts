// The MCP contract a host (and a judge's Inspector) relies on: every tool says what it returns,
// how it behaves (annotations) and what the device shows while it runs; results carry that status
// and match their schema; and voice replies stay speakable (no links, ids or JSON read out).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import { OUTPUTS } from '../src/mcp/outputs.js';

let http: Server;
let close: () => void;
let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;

before(async () => {
  const created = createApp({ parentKey: 'contract-key', ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  client = new Client({ name: 'contract-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('"What can you do?" is answered in under 30 words, and "help me with" is not an emergency', async () => {
  await call('start_handoff', { carer_name: 'Sam', replace: true });
  for (const q of ['What can you do?', 'What can you help me with?', 'help']) {
    const r = await call('ask_house', { question: q });
    const said = r.content[0].text;
    assert.match(said, /^I know the parents' notes for tonight\. Ask where things are, what Maya can eat/);
    assert.ok(said.split(/\s+/).length <= 30, said);
    assert.equal(r.structuredContent.emergency, false);
  }
  await call('end_handoff');
});

test('every tool declares an outputSchema, annotations and its invoking/invoked status text', async () => {
  const { tools } = await client.listTools();
  assert.ok(tools.length >= 20);
  for (const t of tools) {
    assert.ok(t.outputSchema, `${t.name} has an outputSchema`);
    assert.equal(t.outputSchema.type, 'object');
    assert.ok((t.outputSchema.required ?? []).includes('view'), `${t.name} always names its card`);
    assert.ok(t.annotations && Object.keys(t.annotations).some((k) => k.endsWith('Hint')), `${t.name} has annotations`);
    const ui = (t._meta as any)?.ui;
    assert.ok(ui?.invoking && ui?.invoked, `${t.name} has invoking/invoked text`);
    assert.ok(OUTPUTS[t.name], `${t.name} is in OUTPUTS`);
    for (const [k, v] of Object.entries((t.inputSchema.properties ?? {}) as Record<string, any>)) assert.ok(v.description, `${t.name}.${k} is described`);
  }
});

test('results carry the status text, match their schema, and what is said has no links, ids or JSON', async () => {
  setDemoTime('18:40', 'America/Los_Angeles', 'Sat');
  const run: Array<[string, Record<string, unknown>]> = [
    ['home_screen', {}],
    ['start_handoff', { carer_name: 'Priya' }],
    ['home_screen', {}],
    ['tonight_plan', {}],
    ['ask_house', { question: 'Can she have a cookie?' }],
    ['ask_house', { question: 'What should the kids eat for dinner?' }],
    ['ask_house', { question: 'What can you do?' }],
    ['where_is', { item: 'EpiPen' }],
    ['door_check', { question: 'Someone is knocking, should I open?' }],
    ['ask_parent', { question: 'Can she stay up till 9?' }],
    ['log_event', { text: 'Maya had dinner' }],
    ['emergency', { description: "She can't breathe" }],
    ['emergency_step', { action: 'done' }],
    ['emergency_status', {}],
    ['emergency_step', { action: 'resolved' }],
    ['end_handoff', {}],
  ];
  for (const [name, args] of run) {
    const r = await call(name, args);
    assert.notEqual(r.isError, true, `${name} succeeds`);
    assert.ok(r._meta?.ui?.invoked, `${name} result has invoked text`);
    assert.ok(OUTPUTS[name].safeParse(r.structuredContent).success, `${name} matches its outputSchema`);
    const said = r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ');
    assert.doesNotMatch(said, /https?:\/\/|\{"|\b[a-z]+_[a-z_]+\b/, `${name} says no link, JSON or tool name: ${said}`);
  }
});

test('the privacy notice and terms an Alexa+ listing links to are served, and say it does not call 911', async () => {
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const privacy = await fetch(`${base}/privacy`);
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /not made for children/);
  const terms = await (await fetch(`${base}/terms`)).text();
  assert.match(terms, /This device can't call 911/);
  assert.match(terms, /not a substitute for professional medical advice/);
});
