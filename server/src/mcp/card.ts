// One MCP App (ui:// resource) that renders every While You're Out card.
// The card's CSS and JavaScript live in ./card/ as real files; they are inlined into one HTML
// document here, because an MCP App is served as a single self-contained resource.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
/**
 * The card's address carries a hash of its contents (as the Alexa+ design guide asks), so a host
 * can cache it and fetch it again only when it changes. While working on the design
 * (WYO_CARD_RELOAD=1) the address stays put and the card is re-read on every request.
 */
export const CARD_URI =
  process.env.WYO_CARD_RELOAD === '1'
    ? 'ui://while-youre-out/card.html'
    : `ui://while-youre-out/card-${createHash('sha256').update(CARD_HTML).digest('hex').slice(0, 10)}.html`;
/** The card, re-read from disk on every request when WYO_CARD_RELOAD=1 (for working on its design). */
export const cardHtml = () => (process.env.WYO_CARD_RELOAD === '1' ? build() : CARD_HTML);
