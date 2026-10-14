// House Brain with a fake AI: validation, secrets, conflicts, review flow and the HTTP API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { decideProposal, pendingProposals, saveProposals, timeConflict, type Extracted } from '../src/domain/houseBrain.js';
import { visibleFacts } from '../src/domain/house.js';
import { createApp } from '../src/index.js';
import type { AiClient, JsonRequest } from '../src/ai/gemini.js';

const freshDb = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};
const factId = (db: ReturnType<typeof freshDb>, re: RegExp) => visibleFacts(db, 'parent').find((f) => re.test(f.text))!.id;
const empty: Extracted = { facts: [], locations: [], action_plan_steps: [], contacts: [] };
const label = { kind: 'text' as const, label: 'Test note', author: 'Anita' };

// ---------- pure logic ----------

test('time conflicts: real clock times only', () => {
  assert.ok(timeConflict('Bedtime 8:30 on Fridays', 'Bath at 7:15, pyjamas, brush teeth, two stories, lights out at 8.'));
  assert.equal(timeConflict('Bruno: 1 scoop food + walk after dinner', 'Dinner is the dal and rice in the fridge. Heat it for 2 minutes.'), null);
  assert.equal(timeConflict('Bedtime at 8', 'lights out at 8'), null);
  assert.equal(timeConflict('2 books at bedtime', 'lights out at 8'), null);
});

test('secrets are dropped and counted, never stored', () => {
  const db = freshDb();
  const out = saveProposals(db, label, {
    ...empty,
    facts: [
      { category: 'house', text: 'Garage code 4471', confidence: 1 },
      { category: 'house', text: 'Wifi password is maple2024', confidence: 1 },
      { category: 'routine', text: 'Bath at 7:15, bubbles are fine', confidence: 1 },
    ],
    locations: [{ item: 'Spare key', description: 'Under the mat' }],
  }, 'fake');
  assert.equal(out.dropped_secrets, 3);
  assert.deepEqual(out.proposals.map((p) => p.text), ['Bath at 7:15, bubbles are fine']);
});

test('risk follows the category; unknown categories become "other"', () => {
  const db = freshDb();
  const out = saveProposals(db, label, {
    ...empty,
    facts: [
      { category: 'allergy', text: 'No sesame either', confidence: 1 },
      { category: 'medicine', text: 'Inhaler only if wheezing', confidence: 1 },
      { category: 'nonsense', text: 'Water the plants', confidence: 1 },
    ],
  }, 'fake');
  assert.deepEqual(out.proposals.map((p) => [p.category, p.risk]), [['allergy', 'safety'], ['medicine', 'food_medicine'], ['other', 'normal']]);
});

test('a time clash is flagged even if the model misses it; agreement is not a conflict', () => {
  const db = freshDb();
  const sweets = factId(db, /No sweets after 6/);
  const out = saveProposals(db, label, {
    ...empty,
    facts: [
      { category: 'routine', text: 'Bedtime 8:30 on Fridays', confidence: 1 },
      { category: 'food', text: 'No chocolate after 6', confidence: 1, conflicts_with: sweets, conflict_reason: 'Matching the existing sweets rule.' },
      { category: 'food', text: 'Dinner is pizza', confidence: 1, conflicts_with: 99999, conflict_reason: 'Different dinner' },
    ],
  }, 'fake');
  const [bed, choc, pizza] = out.proposals;
  assert.equal(bed.conflict_fact_id, factId(db, /lights out at 8/));
  assert.equal(choc.conflict_fact_id, null, 'agreement is not a conflict');
  assert.equal(pizza.conflict_fact_id, null, 'a conflict must point at a real rule');
});

test('duplicates of existing rules and contacts are skipped', () => {
  const db = freshDb();
  const out = saveProposals(db, label, {
    ...empty,
    facts: [{ category: 'food', text: 'No sweets after 6 pm.', confidence: 1 }],
    contacts: [
      { name: 'Anita', relation: 'Mom', phone: '206-555-0142' },
      { name: 'Grandma Lakshmi', relation: 'Grandmother', phone: '+91 98450 12345' },
    ],
  }, 'fake');
  assert.deepEqual(out.proposals.map((p) => p.item ?? p.text), ['Grandma Lakshmi']);
});

test('accepting a conflicting rule needs a choice; "replace" retires the old one', () => {
  const db = freshDb();
  const out = saveProposals(db, label, { ...empty, facts: [{ category: 'routine', text: 'Bedtime 8:30 on Fridays', confidence: 1 }] }, 'fake');
  const p = out.proposals[0];
  assert.throws(() => decideProposal(db, p.id, { action: 'accept', by: 'Anita' }), /choose replace/);
  decideProposal(db, p.id, { action: 'accept', resolution: 'replace', by: 'Anita' });
  const texts = visibleFacts(db, 'carer').map((f) => f.text);
  assert.ok(texts.includes('Bedtime 8:30 on Fridays'));
  assert.ok(!texts.some((t) => /lights out at 8/.test(t)), 'old rule retired');
  assert.throws(() => decideProposal(db, p.id, { action: 'accept', by: 'Anita' }), /already accepted/);
});

test('"keep both" keeps both; "keep old" discards the new one', () => {
  const db = freshDb();
  const out = saveProposals(db, label, {
    ...empty,
    facts: [
      { category: 'routine', text: 'Bedtime 8:30 on Fridays', confidence: 1 },
      { category: 'routine', text: 'Bedtime 9 on holidays', confidence: 1 },
    ],
  }, 'fake');
  decideProposal(db, out.proposals[0].id, { action: 'accept', resolution: 'keep_both', by: 'Anita' });
  decideProposal(db, out.proposals[1].id, { action: 'accept', resolution: 'keep_old', by: 'Anita' });
  const texts = visibleFacts(db, 'carer').map((f) => f.text);
  assert.ok(texts.includes('Bedtime 8:30 on Fridays'));
  assert.ok(texts.some((t) => /lights out at 8/.test(t)));
  assert.ok(!texts.includes('Bedtime 9 on holidays'));
});

test('a parent can edit the text before accepting, but not sneak in a code', () => {
  const db = freshDb();
  const out = saveProposals(db, label, { ...empty, facts: [{ category: 'rules', text: 'No frends over', confidence: 0.4 }] }, 'fake');
  assert.throws(() => decideProposal(db, out.proposals[0].id, { action: 'accept', text: 'Door code is 1234', by: 'Anita' }), /Codes and passwords/);
  decideProposal(db, out.proposals[0].id, { action: 'accept', text: 'No friends over', by: 'Anita' });
  assert.ok(visibleFacts(db, 'carer').some((f) => f.text === 'No friends over'));
});

test('a new emergency plan replaces the old one only when the parent says so', () => {
  const db = freshDb();
  const out = saveProposals(db, { kind: 'pdf', label: 'Allergy action plan', author: 'Anita' }, {
    ...empty,
    action_plan_steps: [{ text: 'Give the EpiPen.' }, { text: 'Call 911.', timer_minutes: null }, { text: 'Second dose after 5 minutes', timer_minutes: 5 }],
  }, 'fake');
  const [s1, s2, s3] = out.proposals;
  assert.match(s1.conflict_reason ?? '', /Replaces the emergency plan/);
  assert.throws(() => decideProposal(db, s1.id, { action: 'accept', by: 'Anita' }), /replaces the emergency plan/);
  decideProposal(db, s1.id, { action: 'accept', resolution: 'replace', by: 'Anita' });
  decideProposal(db, s2.id, { action: 'accept', by: 'Anita' });
  decideProposal(db, s3.id, { action: 'accept', by: 'Anita' });
  const steps = db.prepare('SELECT step_no, text, timer_seconds FROM action_plan_steps ORDER BY step_no').all() as any[];
  assert.deepEqual(steps.map((s) => s.text), ['Give the EpiPen.', 'Call 911.', 'Second dose after 5 minutes']);
  assert.equal(steps[2].timer_seconds, 300);
});

test('accepted locations update existing ones instead of duplicating', () => {
  const db = freshDb();
  const out = saveProposals(db, label, { ...empty, locations: [{ item: 'EpiPen', description: 'Red pouch by the stove' }] }, 'fake');
  decideProposal(db, out.proposals[0].id, { action: 'accept', by: 'Anita' });
  const rows = db.prepare("SELECT description FROM locations WHERE lower(item) = 'epipen'").all() as any[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'Red pouch by the stove');
});

test('model output is clipped and capped', () => {
  const db = freshDb();
  const out = saveProposals(db, label, {
    ...empty,
    facts: Array.from({ length: 100 }, (_, i) => ({ category: 'rules', text: `Rule ${i} ${'x'.repeat(800)}`, confidence: 2 })),
  }, 'fake');
  assert.equal(out.proposals.length, 60);
  assert.ok(out.proposals.every((p) => p.text.length <= 500 && p.confidence <= 1));
});

// ---------- HTTP API and MCP tool, with a fake AI ----------

let http: Server;
let base: string;
let close: () => void;
let client: Client;
const KEY = 'brain-key';
const seen: JsonRequest[] = [];
const fakeAi: AiClient = {
  available: true,
  async generateJson<T>(req: JsonRequest) {
    seen.push(req);
    const data: Extracted = {
      facts: [
        { category: 'routine', text: 'Bedtime 8:30 on Fridays, 2 books', confidence: 0.9 },
        { category: 'screen', text: 'Only 1 show, no YouTube', confidence: 0.95 },
        { category: 'house', text: 'Garage code 4471', confidence: 1 },
      ],
      locations: [{ item: 'EpiPen', description: 'Red pouch by the stove' }],
      action_plan_steps: [],
      contacts: [],
    };
    return { data: data as T, model: 'fake-model' };
  },
};

before(async () => {
  const created = createApp({ parentKey: KEY, ai: fakeAi });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'brain-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('importing pasted text returns proposals, drops the code, and shows the conflict', async () => {
  const res = await post('/parent/api/import/text', { k: KEY, text: 'Bedtime 8:30 on Fridays...', label: 'WhatsApp from Anita', by: 'Anita' });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.dropped_secrets, 1);
  assert.equal(out.model, 'fake-model');
  const bed = out.proposals.find((p: any) => /8:30/.test(p.text));
  assert.match(bed.conflict_text, /lights out at 8/);
  // The model was given the existing rules so it can spot conflicts.
  assert.match(JSON.stringify(seen.at(-1)!.parts), /lights out at 8/);
});

test('importing a photo sends the image to the model', async () => {
  const png = readFileSync(new URL('../samples/fridge-note.png', import.meta.url));
  const res = await fetch(`${base}/parent/api/import/file?k=${KEY}&label=Fridge%20note&by=Anita`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: png,
  });
  assert.equal(res.status, 200);
  const part = seen.at(-1)!.parts.find((p) => 'inlineData' in p) as any;
  assert.equal(part.inlineData.mimeType, 'image/png');
  assert.equal(Buffer.from(part.inlineData.data, 'base64').length, png.length);
});

test('file import rejects wrong keys, wrong types and huge files', async () => {
  assert.equal((await fetch(`${base}/parent/api/import/file?k=nope`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: Buffer.from('x') })).status, 401);
  assert.equal((await fetch(`${base}/parent/api/import/file?k=${KEY}`, { method: 'POST', headers: { 'content-type': 'text/html' }, body: '<b>x</b>' })).status, 400);
  const big = await fetch(`${base}/parent/api/import/file?k=${KEY}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(7 * 1024 * 1024) });
  assert.equal(big.status, 413);
  assert.match((await big.json()).error, /6 MB/);
});

test('proposals are reviewed through the API and then answer the sitter', async () => {
  const list = await (await fetch(`${base}/parent/api/proposals?k=${KEY}`)).json();
  const show = list.proposals.find((p: any) => /Only 1 show/.test(p.text));
  const res = await post(`/parent/api/proposals/${show.id}`, { k: KEY, action: 'accept', resolution: show.conflict_fact_id ? 'replace' : undefined, by: 'Anita' });
  assert.equal(res.status, 200);
  const r = (await client.callTool({ name: 'ask_house', arguments: { question: 'Can she watch YouTube?' } })) as any;
  assert.match(r.content[0].text, /no YouTube/);
  const again = await post(`/parent/api/proposals/${show.id}`, { k: KEY, action: 'accept', by: 'Anita' });
  assert.equal(again.status, 409);
});

test('pending proposals are never used before a parent confirms them', async () => {
  const r = (await client.callTool({ name: 'ask_house', arguments: { question: 'What time is bedtime?' } })) as any;
  assert.doesNotMatch(r.content[0].text, /8:30/);
});

test('the import_note tool reads dictated notes and asks for confirmation on the phone', async () => {
  const r = (await client.callTool({ name: 'import_note', arguments: { text: 'Bedtime 8:30 on Fridays, garage code 4471' } })) as any;
  assert.match(r.content[0].text, /confirm them on your phone/);
  assert.match(r.content[0].text, /left out codes/);
});

test('during a handoff, import_note refuses: the carer cannot propose house rules by voice', async () => {
  await client.callTool({ name: 'start_handoff', arguments: { carer_name: 'Priya' } });
  const r = (await client.callTool({ name: 'import_note', arguments: { text: 'Maya can stay up till 11' } })) as any;
  assert.ok(r.isError);
  assert.equal(r.structuredContent.handoff_active, true);
  assert.match(r.content[0].text, /parents' phone/);
  await client.callTool({ name: 'end_handoff', arguments: {} });
});

test('without an AI key, imports fail clearly instead of crashing', async () => {
  const noAi = createApp({ parentKey: KEY, ai: { available: false, generateJson: async () => { throw new (await import('../src/ai/gemini.js')).AiUnavailableError('no key'); } } });
  const s = noAi.app.listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/parent/api/import/text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ k: KEY, text: 'Bath at 7' }),
  });
  assert.equal(res.status, 503);
  noAi.close();
  s.closeAllConnections();
  s.close();
});

test('pending proposals are also listed for the parent page', () => {
  // smoke check that the helper used by the page works on a fresh database
  assert.deepEqual(pendingProposals(freshDb()), []);
});

test('a slow AI never keeps the device quiet: it answers at once and the cards arrive later', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slowAi: AiClient = {
    available: true,
    generateJson: async <T>() => {
      await gate;
      return { data: { ...empty, facts: [{ category: 'food', text: 'No juice after 7', confidence: 0.9 }] } as T, model: 'slow' };
    },
  };
  const app = createApp({ parentKey: KEY, ai: slowAi, voiceWaitMs: 50 });
  const s = app.app.listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const c = new Client({ name: 'slow-test', version: '0.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
  const r = (await c.callTool({ name: 'import_note', arguments: { text: 'No juice after 7' } })) as any;
  assert.ok(!r.isError);
  assert.equal(r.structuredContent.pending, true);
  assert.match(r.content[0].text, /on your phone/);
  release();
  await new Promise((res) => setTimeout(res, 50));
  const list = await (await fetch(`${url}/parent/api/proposals?k=${KEY}`)).json();
  assert.ok(list.proposals.some((p: any) => /No juice after 7/.test(p.text)));
  await c.close();
  app.close();
  s.closeAllConnections();
  s.close();
});
