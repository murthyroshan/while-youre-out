// Every Echo Show screen on one page, in dark and light: plays a scripted evening against a running
// server (a fresh demo house), keeps each card's real tool result, and writes a gallery that renders
// them with the add-on's own card, the way an Alexa+ host does (MCP Apps hostContext: theme and
// deviceClass). Usage: node scripts/screens.mjs [server URL] [output file]
// e.g. node scripts/screens.mjs http://127.0.0.1:8787 site/public/screens.html
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const sdk = (p) => import(pathToFileURL(require.resolve(`@modelcontextprotocol/sdk/${p}`)).href);
const { Client } = await sdk('client/index.js');
const { StreamableHTTPClientTransport } = await sdk('client/streamableHttp.js');
const { ElicitRequestSchema } = await sdk('types.js');

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const out = process.argv[3] ?? 'tmp/screens.html';
const house = `${base}/h/${randomBytes(16).toString('hex')}`;

const client = new Client({ name: 'screens', version: '1.0' }, { capabilities: { elicitation: { form: {}, url: {} } } });
// The parent approves in the form (who's babysitting) and opens the payment link.
client.setRequestHandler(ElicitRequestSchema, async (req) =>
  req.params.mode === 'url' ? { action: 'accept' } : { action: 'accept', content: { carer_name: 'Priya' } },
);
await client.connect(new StreamableHTTPClientTransport(new URL(`${house}/mcp`)));

const post = (path, body) => fetch(`${house}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const config = await (await fetch(`${house}/demo/config`)).json();
const key = new URL(config.parent_url, base).searchParams.get('k');
const clock = (time) => post('/demo/clock', { time, day: 'Sat' });

const shots = [];
const shot = async (label, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) console.warn(`  ${label}: ${r.content?.[0]?.text}`);
  else shots.push({ label, tool: name, result: { content: r.content, structuredContent: r.structuredContent } });
  console.log(`${r.isError ? 'skip' : 'ok  '} ${label}`);
  return r;
};

await clock('17:40');
await shot('Tonight · nobody babysitting', 'home_screen');
await clock('18:00');
await shot('Handover · the briefing', 'start_handoff', { carer_name: 'Priya' });
await shot('Handover check · a question', 'teachback', {});
await shot('Handover check · right', 'teachback', { answer: 'Peanuts' });
await client.callTool({ name: 'teachback', arguments: { answer: 'In the kitchen drawer by the stove' } });
await shot('Handover check · done', 'teachback', { answer: 'Anita' });
await clock('18:05');
await shot('Tonight · up next', 'home_screen');
await shot("Tonight's plan", 'tonight_plan');
await shot('Food · with the allergy first', 'ask_house', { question: 'Can Maya have the cookies on the counter?' });
await shot("What's for dinner", 'ask_house', { question: 'What should the kids eat for dinner?' });
await shot('Where it’s kept', 'where_is', { item: 'EpiPen' });
await shot('What can you do?', 'ask_house', { question: 'What can you do?' });
await clock('18:20');
await shot('Ordering dinner · only what’s safe', 'order_dinner', {});
const ordered = await shot('Ordering dinner · waiting for Mom', 'request_order', { item: 'the mac and cheese' });
await post('/parent/api/order', { k: key, id: ordered.structuredContent?.id, action: 'approve', by: 'Anita' });
await shot('Ordering dinner · on its way', 'order_status', { id: ordered.structuredContent?.id });
const asked = await shot('Asking a parent · waiting', 'ask_parent', { question: 'Can she stay up until 9 to finish her movie?' });
await post('/parent/api/answer', { k: key, id: asked.structuredContent?.id, answer: 'Yes, just tonight.', by: 'Anita' });
await shot('A parent answered', 'check_parent_answer', { question_id: asked.structuredContent?.id });
await shot('Noted for the parents', 'log_event', { text: 'Maya ate all her dinner' });
await clock('20:10');
await post('/demo/ring', { who: 'stranger' });
await shot('Front door · not expected', 'door_check', { question: 'Someone is knocking, should I open the door?' });
await shot('Emergency · step 1', 'emergency', { description: 'Maya ate a cookie and her lips are swelling' });
await shot('Emergency · the timer runs', 'emergency_step', { action: 'done' });
await shot('Emergency · over', 'emergency_step', { action: 'resolved' });
await clock('20:40');
await client.callTool({ name: 'log_event', arguments: { text: 'Maya is asleep' } });
await shot('Tonight · after lights out', 'home_screen');
await shot('Goodnight message', 'play_message', {});
await clock('23:00');
await shot('The evening · summary', 'end_handoff');
await shot('Pay the sitter', 'pay_sitter');
// Another evening: Dadi, whom the house remembers as reading better in large text (and in Hindi).
await clock('18:00');
await shot('Handover · Dadi, remembered: large text', 'start_handoff', { carer_name: 'Dadi', language: 'en' });
console.log(`PARENT ${house}/parent?k=${key}`);

// The card itself, fetched the way a host does: the ui:// resource the tools point to.
const { tools } = await client.listTools();
const uri = tools.find((t) => t._meta?.ui?.resourceUri)?._meta.ui.resourceUri;
const html = (await client.readResource({ uri })).contents?.[0]?.text;
await client.close();
if (!html) throw new Error('Could not load the card HTML');
const FULL = new Set(['home_screen', 'emergency', 'emergency_step', 'emergency_status', 'play_message']);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Every screen · While You're Out</title>
<style>
  body { margin: 0; background: #E9E7EC; color: #14181E; font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  header { padding: 28px 32px 8px; } h1 { margin: 0; font-size: 26px; } header p { margin: 4px 0 0; color: #4A5361; max-width: 70ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 28px 24px; padding: 24px 32px 48px; }
  figure { margin: 0; } figcaption { font-weight: 650; margin-bottom: 8px; } figcaption small { font-weight: 500; color: #5B6371; margin-left: 6px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dev { position: relative; width: 100%; border-radius: 14px; overflow: hidden; background: #000; box-shadow: 0 0 0 6px #1B1D22; }
  .dev iframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; } nav a { padding: 8px 14px; border-radius: 999px; background: #fff; color: #14181E; text-decoration: none; font-weight: 600; } nav a.on { background: #14181E; color: #fff; }
</style></head><body>
<header><h1>Every screen, in dark and light</h1><p id="lede"></p><nav id="devices"></nav></header>
<div class="grid" id="grid"></div>
<script>
const CARD = ${JSON.stringify(html).replace(/</g, '\\u003c')};
const SHOTS = ${JSON.stringify(shots).replace(/</g, '\\u003c')};
const FULL = ${JSON.stringify([...FULL])};
// Each Echo device as an Alexa+ host describes it: the screen in pixels and its device class.
const DEVICES = {
  'echo-show-5': { name: 'Echo Show 5', w: 960, h: 480 },
  'echo-show-8': { name: 'Echo Show 8', w: 1280, h: 800 },
  'echo-hub': { name: 'Echo Hub', w: 1280, h: 800 },
  'echo-show-15': { name: 'Echo Show 15', w: 1920, h: 1080 },
  'echo-show-21': { name: 'Echo Show 21', w: 1920, h: 1080 },
  'phone': { name: 'Phone', w: 390, h: 844, mobile: true },
};
const DEVICE = DEVICES[location.hash.slice(1)] ? location.hash.slice(1) : 'echo-show-8';
const D = DEVICES[DEVICE];
document.getElementById('devices').innerHTML = Object.entries(DEVICES).map(([k, d]) => '<a href="#' + k + '"' + (k === DEVICE ? ' class="on"' : '') + '>' + d.name + '</a>').join('');
addEventListener('hashchange', () => location.reload());
document.getElementById('lede').textContent = 'Real tool results from one scripted evening, rendered by the add-on’s own card the way an Alexa+ host does, on an ' + D.name + ' (' + D.w + ' × ' + D.h + '): dark on the left, light on the right.';
if (D.mobile) document.getElementById('grid').style.gridTemplateColumns = 'repeat(auto-fill, minmax(380px, 1fr))';
const grid = document.getElementById('grid');
const frames = new Map();
SHOTS.forEach((s, i) => {
  const fig = document.createElement('figure');
  fig.innerHTML = '<figcaption>' + s.label + '<small>' + s.tool + '</small></figcaption><div class="pair"></div>';
  ['dark', 'light'].forEach((theme) => {
    const dev = document.createElement('div');
    dev.className = 'dev';
    dev.style.aspectRatio = D.w + ' / ' + D.h;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.title = s.label + ' (' + theme + ')';
    f.srcdoc = CARD;
    dev.appendChild(f);
    fig.querySelector('.pair').appendChild(dev);
    frames.set(f, { shot: s, theme });
    f.style.width = D.w + 'px';
    f.style.height = D.h + 'px';
    new ResizeObserver(() => { f.style.transform = 'scale(' + dev.clientWidth / D.w + ')'; }).observe(dev);
  });
  grid.appendChild(fig);
});
// A minimal MCP Apps host: hostContext in, the tool result out, tool calls answered from the shot.
addEventListener('message', (e) => {
  const f = [...frames.keys()].find((x) => x.contentWindow === e.source);
  if (!f || !e.data || e.data.jsonrpc !== '2.0') return;
  const { shot, theme } = frames.get(f);
  const m = e.data;
  const reply = (result) => f.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result }, '*');
  if (m.method === 'ui/initialize') {
    reply({ protocolVersion: '2026-01-26', hostInfo: { name: 'screens', version: '1' }, hostCapabilities: {},
      hostContext: { theme, deviceClass: D.mobile ? 'mobile' : DEVICE, isMobile: Boolean(D.mobile), displayMode: FULL.includes(shot.tool) ? 'fullscreen' : 'inline', maxWidth: D.w, maxHeight: D.h } });
  } else if (m.method === 'ui/notifications/initialized') {
    f.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: shot.result }, '*');
  } else if (m.method === 'tools/call') {
    reply(shot.result);
  } else if (m.id != null) {
    reply({});
  }
});
</script></body></html>`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`\n${shots.length} screens -> ${out}`);
process.exit(0);
