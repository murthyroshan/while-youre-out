// Account linking, step by step as Alexa does it: discovery, a bare 401, the authorization request
// with PKCE S256, consent, the code exchange, the linked MCP endpoint, refresh with rotation and
// revocation; and what it must refuse (unregistered redirects, no PKCE, a wrong verifier, a code
// used twice, an old refresh token, remote self-registration).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { createHouses } from '../src/houses.js';

const REDIRECT = 'https://alexa.amazon.com/api/skill/link/M3IHEJ1OZMSGZ3';
const CLIENT = { id: 'alexa-test', secret: 's3cret-for-tests', name: 'Alexa', redirects: [REDIRECT] };
const houses = createHouses((url) => createApp({ parentKey: 'oauth-key', publicUrl: url, demo: true, ai: { available: false } as any }), {
  publicUrl: 'http://127.0.0.1:0',
  oauthClients: [CLIENT],
});
const http = houses.app.listen(0, '127.0.0.1');
await new Promise((r) => http.once('listening', r));
const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
const clients: Client[] = [];
after(async () => {
  for (const c of clients) await c.close();
  houses.close();
  http.closeAllConnections();
  http.close();
});

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const authorizeUrl = (extra: Record<string, string> = {}) =>
  `${base}/oauth/authorize?${form({ client_id: CLIENT.id, redirect_uri: REDIRECT, response_type: 'code', scope: 'household', state: 'abc123', code_challenge: challenge, code_challenge_method: 'S256', ...extra })}`;
const token = (body: Record<string, string>) =>
  fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: CLIENT.id, client_secret: CLIENT.secret, ...body }) });
/** The consent page, then "Link": returns the code from the redirect back to Alexa. */
async function link() {
  const consent = await fetch(authorizeUrl());
  assert.equal(consent.status, 200);
  const tx = /name="tx" value="([\w-]+)"/.exec(await consent.text())![1];
  const r = await fetch(`${base}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ tx, decision: 'allow' }) });
  assert.equal(r.status, 302);
  const back = new URL(r.headers.get('location')!);
  assert.equal(`${back.origin}${back.pathname}`, REDIRECT);
  assert.equal(back.searchParams.get('state'), 'abc123');
  return back.searchParams.get('code')!;
}
const mcp = async (accessToken: string) => {
  const c = new Client({ name: 'alexa', version: '0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/linked/mcp`), { requestInit: { headers: { authorization: `Bearer ${accessToken}` } } }));
  clients.push(c);
  return async (name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as any;
};

test('discovery: the protected resource names its authorization server, which requires PKCE S256', async () => {
  const pr = await (await fetch(`${base}/.well-known/oauth-protected-resource/linked/mcp`)).json();
  assert.equal(pr.resource, 'http://127.0.0.1:0/linked/mcp');
  assert.deepEqual(pr.authorization_servers, ['http://127.0.0.1:0']);
  const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(as.grant_types_supported, ['authorization_code', 'refresh_token']);
});

test('without a token the linked endpoint answers a bare 401 that points at the metadata', async () => {
  const r = await fetch(`${base}/linked/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate')!, /^Bearer resource_metadata=".*\/\.well-known\/oauth-protected-resource\/linked\/mcp"$/);
  // The open demo endpoint stays open: judges never need a token.
  assert.notEqual((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' })).status, 401);
});

test('it refuses what it must: an unregistered redirect, no PKCE, a wrong verifier, a code used twice', async () => {
  assert.equal((await fetch(authorizeUrl({ redirect_uri: 'https://evil.example/cb' }), { redirect: 'manual' })).status, 400, 'never redirects to an unknown address');
  const noPkce = await fetch(authorizeUrl({ code_challenge_method: 'plain' }), { redirect: 'manual' });
  assert.equal(new URL(noPkce.headers.get('location')!).searchParams.get('error'), 'invalid_request');
  const code = await link();
  assert.equal((await (await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: randomBytes(32).toString('base64url') })).json()).error, 'invalid_grant');
  assert.equal((await (await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier })).json()).error, 'invalid_grant', 'a code works once, even after a failed try');
  const r = await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: CLIENT.id, client_secret: 'wrong', grant_type: 'authorization_code', code: 'x', redirect_uri: REDIRECT, code_verifier: verifier }) });
  assert.equal(r.status, 401);
});

test('linked: the household gets its own house, the same one on every request with its token', async () => {
  const code = await link();
  const t = await (await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier, resource: 'http://127.0.0.1:0/linked/mcp' })).json();
  assert.equal(t.token_type, 'Bearer');
  assert.ok(t.access_token && t.refresh_token, 'a refresh token with every access token');
  assert.equal(t.expires_in, 3600);
  const device = await mcp(t.access_token);
  await device('start_handoff', { carer_name: 'Priya' });
  const again = await mcp(t.access_token);
  assert.equal((await again('home_screen')).structuredContent.carer, 'Priya', 'the token picks the household');

  // Another household that links has its own evening.
  const other = await (await token({ grant_type: 'authorization_code', code: await link(), redirect_uri: REDIRECT, code_verifier: verifier })).json();
  assert.equal((await (await mcp(other.access_token))('home_screen')).structuredContent.mode, 'parent');

  // Refresh rotates: the new pair works, the old refresh token doesn't.
  const fresh = await (await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).json();
  assert.ok(fresh.access_token && fresh.refresh_token);
  assert.equal((await (await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).json()).error, 'invalid_grant');
  assert.equal((await (await mcp(fresh.access_token))('home_screen')).structuredContent.carer, 'Priya', 'still the same household');

  // Revoked: the next request starts linking again.
  await fetch(`${base}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token: fresh.access_token }) });
  const r = await fetch(`${base}/linked/mcp`, { method: 'POST', headers: { authorization: `Bearer ${fresh.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  assert.equal(r.status, 401);
});

test('local tools (the MCP Inspector) may register for localhost; nobody else can self-register', async () => {
  const ok = await fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'MCP Inspector', redirect_uris: ['http://localhost:6274/oauth/callback'] }) });
  assert.equal(ok.status, 201);
  assert.match((await ok.json()).client_id, /^local-/);
  const no = await fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }) });
  assert.equal(no.status, 400);
});
