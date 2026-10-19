// "Use it from any MCP host": /connect gives a visitor a house of their own, with its MCP address,
// how to add it to Claude, Claude Code, VS Code or the Inspector, and the same house's parent page.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { createHouses } from '../src/houses.js';

const houses = createHouses((url) => createApp({ parentKey: 'connect-key', publicUrl: url, demo: true, ai: { available: false } as any }), { publicUrl: 'http://127.0.0.1:0' });
const http = houses.app.listen(0, '127.0.0.1');
after(() => {
  houses.close();
  http.closeAllConnections();
  http.close();
});

test('/connect: a house of your own, its MCP address, and how to add it to a host', async () => {
  await new Promise((r) => (http.listening ? r(null) : http.once('listening', r)));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const first = await fetch(`${base}/connect`, { redirect: 'manual' });
  assert.equal(first.status, 302);
  const where = new URL(first.headers.get('location')!, `${base}/connect`);
  assert.match(where.pathname, /^\/h\/[0-9a-f]{32}\/connect$/);

  const page = await (await fetch(where)).text();
  const house = where.pathname.replace(/\/connect$/, '');
  assert.match(page, new RegExp(`${house}/mcp<`), "the house's MCP address");
  assert.match(page, new RegExp(`${house}/parent\\?k=connect-key`), "the same house's parent page");
  assert.match(page, /claude mcp add --transport http while-youre-out/);
  assert.match(page, /&quot;type&quot;: &quot;http&quot;/, 'the VS Code mcp.json');
  assert.match(page, /agent-skill\/SKILL\.md/);

  // And the address on the page really is an MCP server for that house.
  const mcp = new URL(`${base}${house}/mcp`);
  const client = new Client({ name: 'connect-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(mcp));
  const r = (await client.callTool({ name: 'where_is', arguments: { item: 'EpiPen' } })) as any;
  assert.match(r.content[0].text, /stove/);
  await client.close();
});
