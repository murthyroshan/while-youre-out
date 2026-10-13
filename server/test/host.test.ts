// The simulator's LLM proxy: validation, origin check, rate limit, and the key never leaving the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/index.js';

test('the LLM proxy validates, limits and passes calls through', async () => {
  const seen: any[] = [];
  const created = createApp({ parentKey: 'k', chat: async (req) => (seen.push(req), { parts: [{ text: 'hi' }], model: 'fake' }) });
  const http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/host/llm`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  const ok = await post({ system: 'be nice', contents: [{ role: 'user', parts: [{ text: 'hello' }] }], functions: [] });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { parts: [{ text: 'hi' }], model: 'fake' });
  assert.equal(seen[0].system, 'be nice');

  assert.equal((await post({ contents: [] })).status, 400);
  assert.equal((await post({ system: 'x', contents: [], functions: [] }, { origin: 'https://evil.example' })).status, 403);

  let limited = false;
  for (let i = 0; i < 40 && !limited; i++) limited = (await post({ system: 'x', contents: [], functions: [] })).status === 429;
  assert.ok(limited, 'rate limited after 30 calls a minute');

  const body = await (await fetch(url.replace('/host/llm', '/mcp'), { method: 'GET' })).text();
  assert.doesNotMatch(body, /AIza|GEMINI_API_KEY/);

  created.close();
  http.closeAllConnections();
  http.close();
});

test('the proxy can be switched off', async () => {
  const created = createApp({ parentKey: 'k', hostLlm: false });
  const http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/host/llm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 404);
  created.close();
  http.closeAllConnections();
  http.close();
});

test('hosted demo: pages served by this server may call it; other sites may not', async () => {
  const created = createApp({ parentKey: 'k', demo: true, allowedOrigins: ['https://simulator.example'] });
  const http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const state = (origin: string) => fetch(`${base}/parent/api/state?k=k`, { headers: { origin } });
  assert.equal((await state(base)).status, 200, 'same origin');
  assert.equal((await state('https://simulator.example')).status, 200, 'listed origin');
  assert.equal((await state('https://evil.example')).status, 403);
  assert.deepEqual(await (await fetch(`${base}/demo/config`)).json(), { parent_url: '/parent?k=k' });
  created.close();
  http.closeAllConnections();
  http.close();
});

test('the parent link is only published by the demo deployment', async () => {
  const created = createApp({ parentKey: 'secret-key-1234567890', demo: false });
  const http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  assert.equal((await fetch(`${base}/demo/config`)).status, 404);
  created.close();
  http.closeAllConnections();
  http.close();
});
