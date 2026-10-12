// The card and parent page carry inline JavaScript inside template strings; make sure it parses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { CARD_HTML } from '../src/mcp/card.js';
import { PARENT_HTML } from '../src/parent/page.js';

function scripts(html: string) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

test('card script parses', () => {
  const s = scripts(CARD_HTML);
  assert.equal(s.length, 1);
  assert.doesNotThrow(() => new Script(s[0]));
});

test('parent page script parses', () => {
  const s = scripts(PARENT_HTML);
  assert.equal(s.length, 1);
  assert.doesNotThrow(() => new Script(s[0]));
});

test('card speaks the MCP Apps handshake', () => {
  assert.match(CARD_HTML, /ui\/initialize/);
  assert.match(CARD_HTML, /ui\/notifications\/initialized/);
  assert.match(CARD_HTML, /ui\/notifications\/tool-result/);
});
