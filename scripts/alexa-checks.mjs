// The Alexa+ and MCP 2025-11-25 transport rules that matter for an add-on, checked against a running
// server over plain HTTP (no SDK, so the server gets exactly what is sent):
//   node scripts/alexa-checks.mjs http://127.0.0.1:8787
// Sources: Amazon's Alexa+ MCP Authentication, Account Linking and client lifecycle pages, and the MCP
// transport and tools specs. Each line says what was sent and what came back.
const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const ACCEPT = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'checks', version: '0' } } };
let failed = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
};
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { ...ACCEPT, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const json = async (r) => {
  const t = await r.text();
  const data = t.startsWith('event:') || t.includes('\ndata:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).pop() : t;
  try { return JSON.parse(data); } catch { return null; }
};
async function session(path = '/mcp', headers = {}) {
  const r = await post(path, INIT, headers);
  const sid = r.headers.get('mcp-session-id');
  const init = await json(r);
  await post(path, { jsonrpc: '2.0', method: 'notifications/initialized' }, { ...headers, 'mcp-session-id': sid, 'mcp-protocol-version': '2025-11-25' });
  return { sid, init, h: { ...headers, 'mcp-session-id': sid, 'mcp-protocol-version': '2025-11-25' } };
}

// Alexa+ authentication (the linked endpoint)
{
  const r = await post('/linked/mcp', INIT);
  check(r.status === 401 && !r.headers.get('www-authenticate'), '1. unauthenticated request: 401 without WWW-Authenticate', `${r.status}, header ${r.headers.get('www-authenticate') ? 'present' : 'absent'}`);
  const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
  check(Boolean(prm.resource && prm.authorization_servers?.length), '2a. protected resource metadata at the root well-known address', prm.resource);
  const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
  check(as.code_challenge_methods_supported?.includes('S256'), '2b. authorization server lists S256');
  check(as.grant_types_supported?.includes('client_credentials'), '2c. authorization server lists client_credentials (the service tier)');
  const q = await post('/linked/mcp?access_token=abcdefghijklmnopqrstuvwxyz', INIT);
  check(q.status >= 400 && q.status < 500, '3. a token in the query string is refused', String(q.status));
}

// MCP transport, on the open demo endpoint
const s = await session();
check(s.init?.result?.protocolVersion === '2025-11-25' && Boolean(s.sid), '4. initialize negotiates 2025-11-25 and issues Mcp-Session-Id', `${s.init?.result?.protocolVersion}, session ${s.sid ? 'yes' : 'no'}`);
{
  const tools = (await json(await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, s.h)))?.result?.tools ?? [];
  const withView = tools.filter((t) => t._meta?.ui?.resourceUri);
  const uri = withView[0]?._meta.ui.resourceUri;
  const res = await json(await post('/mcp', { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri } }, s.h));
  check(Boolean(uri) && res?.result?.contents?.[0]?.mimeType === 'text/html;profile=mcp-app', '5a. tools name a ui:// view served as text/html;profile=mcp-app', `${withView.length} tools with a view`);
  const call = await json(await post('/mcp', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'home_screen', arguments: {} } }, s.h));
  check(Boolean(call?.result?._meta?.ui?.resourceUri), '5b. a tool result also names its view (_meta.ui.resourceUri on the result)', call?.result?._meta?.ui?.resourceUri ?? 'missing');
  const t0 = performance.now();
  for (let i = 0; i < 9; i++) await post('/mcp', { jsonrpc: '2.0', id: 10 + i, method: 'tools/list' }, s.h);
  const ms = (performance.now() - t0) / 9;
  check(ms < 500, '6. warm round trip under 500 ms', `${ms.toFixed(0)} ms average`);
}
{
  const r = await post('/mcp', INIT, { origin: 'https://evil.example' });
  check(r.status === 403, '7. a foreign Origin gets 403', String(r.status));
  const v = await post('/mcp', { jsonrpc: '2.0', id: 5, method: 'tools/list' }, { ...s.h, 'mcp-protocol-version': '1999-01-01' });
  check(v.status === 400, '8. an unsupported MCP-Protocol-Version gets 400', String(v.status));
  const n = await post('/mcp', { jsonrpc: '2.0', id: 6, method: 'tools/list' }, { 'mcp-protocol-version': '2025-11-25' });
  check(n.status === 400 || n.status === 404, '9. a request without Mcp-Session-Id after initialize gets 400', String(n.status));
  const b = await post('/mcp', [{ jsonrpc: '2.0', id: 7, method: 'ping' }, { jsonrpc: '2.0', id: 8, method: 'ping' }], s.h);
  const bj = await json(b);
  check(b.status >= 400 || bj?.error?.code === -32600, '10. a JSON-RPC batch is refused', `${b.status}${bj?.error ? ` ${bj.error.code}` : ''}`);
  const bad = await json(await post('/mcp', { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'ask_house', arguments: { nonsense: 1 } } }, s.h));
  const text = JSON.stringify(bad?.result?.content ?? bad?.error ?? '');
  check(bad?.result?.isError === true && !/\bat \w+ \(|Error: |\.ts:\d/.test(text), '11. bad arguments come back as isError, without internals', bad?.error ? `protocol error ${bad.error.code}` : text.slice(0, 90));
}
console.log(failed ? `\n${failed} to fix` : '\nall pass');
process.exit(failed ? 1 : 0);
