// Speed and robustness on every push (the full numbers come from scripts/bench.mjs): the everyday
// tools stay well inside the MCP Toolkit's 500 ms per call over real HTTP, and malformed or hostile
// requests never crash the server or come back as a 5xx.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';

let http: Server;
let base: string;
let close: () => void;
let client: Client;

before(async () => {
  const created = createApp({ parentKey: 'speed-test-key', demo: true, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'speed-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  resetClock();
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('the everyday tools answer within 500 ms at p95, over HTTP', async () => {
  setDemoTime('19:00', 'America/Los_Angeles', 'Sat');
  await client.callTool({ name: 'start_handoff', arguments: { carer_name: 'Priya', language: 'en' } });
  const calls: Array<[string, Record<string, unknown>]> = [
    ['ask_house', { question: 'Can Maya have a cookie?' }],
    ['ask_house', { question: 'What time is bedtime?' }],
    ['home_screen', {}],
    ['where_is', { item: 'EpiPen' }],
    ['tonight_plan', {}],
    ['door_check', { question: 'Should I open the door?' }],
    ['order_dinner', {}],
  ];
  const times: number[] = [];
  for (let round = 0; round < 15; round++) {
    for (const [name, args] of calls) {
      const t = performance.now();
      const r = (await client.callTool({ name, arguments: args })) as any;
      times.push(performance.now() - t);
      assert.ok(!r.isError, `${name} failed`);
    }
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(p95 < 500, `p95 ${Math.round(p95)} ms`);
  await client.callTool({ name: 'end_handoff', arguments: {} });
});

test('malformed and hostile requests get 4xx or a tool error, never a 5xx', async () => {
  let session = '';
  const raw = async (body: string, contentType = 'application/json') => {
    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': contentType, accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-11-25' } : {}) },
      body,
    });
    session ||= r.headers.get('mcp-session-id') ?? '';
    await r.text();
    return r.status;
  };
  await raw(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fuzz', version: '1' } } }));
  await raw(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  const call = (name: unknown, args: unknown) => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const bodies = [
    '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {',
    '',
    'null',
    '[]',
    call('ask_house', { question: 'x'.repeat(200_000) }),
    call('ask_house', { question: null }),
    call('ask_house', { question: ['a'] }),
    call('ask_house', { __proto__: { admin: true }, question: 'hi' }),
    call('nonexistent_tool', {}),
    call('__proto__', {}),
    call('emergency_step', { action: "'; DROP TABLE facts; --" }),
    call('request_order', { item: '\u0000‮evil' }),
    call('order_status', { id: -1 }),
    call('check_parent_answer', { question_id: 1e308 }),
    call('start_handoff', { carer_name: '<script>alert(1)</script>', hourly_rate: -5 }),
    JSON.stringify({ jsonrpc: '1.0', id: {}, method: 'tools/call' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'ui://../../etc/passwd' } }),
    JSON.stringify([{ jsonrpc: '2.0', id: 3, method: 'tools/list' }, { jsonrpc: '2.0', id: 4, method: 'nope' }]),
  ];
  for (const b of bodies) {
    const status = await raw(b);
    assert.ok(status < 500, `${status} for ${b.slice(0, 60)}`);
  }
  assert.ok((await raw('{}', 'text/plain')) < 500);
  // And it still answers properly afterwards.
  const r = (await client.callTool({ name: 'where_is', arguments: { item: 'EpiPen' } })) as any;
  assert.match(r.content[0].text, /stove/);
});
