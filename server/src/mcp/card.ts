// One MCP App (ui:// resource) that renders every While You're Out card.
// The card's CSS and JavaScript live in ./card/ as real files; they are inlined into one HTML
// document here, because an MCP App is served as a single self-contained resource.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CARD_URI = 'ui://while-youre-out/card.html';
export const CARD_MIME = 'text/html;profile=mcp-app';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`./card/${name}`, import.meta.url)), 'utf8');

const build = () => [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  "<title>While You're Out</title>",
  `<style>${read('card.css')}</style>`,
  '</head>',
  '<body>',
  '<div id="root"><div class="panel"><p class="sub">Loading…</p></div></div>',
  `<script>${read('card.js')}</script>`,
  '</body>',
  '</html>',
].join('\n');

export const CARD_HTML = build();
/** The card, re-read from disk on every request when WYO_CARD_RELOAD=1 (for working on its design). */
export const cardHtml = () => (process.env.WYO_CARD_RELOAD === '1' ? build() : CARD_HTML);
