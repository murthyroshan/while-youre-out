// Sitter profiles: the second evening is better than the first. A sitter back again is welcomed
// back and only checked on what they missed or what changed; someone new gets everything; Dadi
// gets her handover in Hindi, in large text, without anyone saying so. The parents can change it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { endHandoff, startHandoff } from '../src/domain/house.js';
import { teachback } from '../src/domain/teachback.js';
import { eveningsLabel, SitterError, sitterProfile, sitters, updateSitter } from '../src/domain/sitters.js';

const KEY = 'sitters-test-key';
const TZ = 'America/Los_Angeles';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const said = (r: any) => r.content.find((c: any) => c.type === 'text')?.text ?? '';
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });
const state = async () => (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();

const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};
/** One evening with a full handover check, answered with these words. */
const evening = (db: ReturnType<typeof fresh>, who: string, answers: string[]) => {
  startHandoff(db, who);
  let step = teachback(db, {});
  const asked = [step.kind === 'question' ? step.question : ''];
  for (const a of answers) {
    step = teachback(db, { answer: a });
    if (step.kind === 'question') asked.push(step.question);
  }
  endHandoff(db);
  return { asked, last: step };
};

before(async () => {
  const created = createApp({ parentKey: KEY, demo: true, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'sitters-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  resetClock();
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('the second evening: only the allergy again, plus whatever was missed or has changed', () => {
  const db = fresh();
  const first = evening(db, 'Sam', ['Peanuts', 'In the drawer by the stove', 'Mom']);
  assert.equal(first.asked.length, 3, 'someone new is asked everything');
  assert.equal(first.last.kind === 'done' && first.last.summary.right, 3);

  // Sam knew it all: the allergy is always asked, the rest is known.
  startHandoff(db, 'Sam');
  const again = teachback(db, {});
  assert.equal(again.kind === 'question' && again.total, 1);
  assert.equal(again.kind === 'question' && again.known, 2);
  assert.equal(again.kind === 'question' && again.question, 'What is Maya allergic to?');
  teachback(db, { answer: 'peanuts' });
  endHandoff(db);

  // The EpiPen moved: that question comes back. A question missed last time comes back too.
  db.prepare("UPDATE locations SET description = 'In the hallway cupboard, top shelf' WHERE item = 'EpiPen'").run();
  const moved = evening(db, 'Sam', ['peanuts', 'hallway cupboard']);
  assert.deepEqual(moved.asked, ['What is Maya allergic to?', 'Where is the EpiPen kept?']);
  const missed = evening(db, 'Ana', ['peanuts', 'hallway cupboard', 'the neighbour']);
  assert.equal(missed.asked.length, 3);
  startHandoff(db, 'Ana');
  const back = teachback(db, {});
  assert.equal(back.kind === 'question' && back.total, 2, 'the allergy and the one Ana got wrong');
  teachback(db, { answer: 'peanuts' });
  const second = teachback(db, {});
  assert.equal(second.kind === 'question' && second.question, 'Who do you call first if anything comes up?');
  // Asking for the whole check again gives the whole check.
  assert.equal((teachback(db, { restart: true }) as any).total, 3);
});

test('profiles come from the evenings themselves; the parents can change them, and have them forgotten', () => {
  const db = fresh();
  const priya = sitterProfile(db, 'priya');
  assert.equal(priya.name, 'Priya');
  assert.equal(priya.evenings, 6);
  assert.equal(priya.rate_cents, 1600);
  assert.ok(priya.asked >= 8, 'questions across her evenings');
  assert.equal(eveningsLabel(priya), '7th evening here');
  assert.equal(eveningsLabel(sitterProfile(db, 'Sam')), 'First evening here');
  assert.deepEqual(sitters(db).map((s) => s.name).sort(), ['Dadi', 'Priya']);
  const dadi = sitters(db).find((s) => s.name === 'Dadi')!;
  assert.deepEqual([dadi.language, dadi.large_text, dadi.note], ['hi-IN', true, "Rahul's mother"]);

  assert.throws(() => updateSitter(db, 'Priya', { language: 'klingon' }), SitterError);
  assert.throws(() => updateSitter(db, 'Priya', { rate: 900 }), SitterError);
  assert.throws(() => updateSitter(db, '  ', {}), SitterError);
  const changed = updateSitter(db, 'Priya', { rate: 18.5, large_text: true, note: '  Maya’s   favourite ' });
  assert.deepEqual([changed.rate_cents, changed.large_text, changed.note, changed.language], [1850, true, 'Maya’s favourite', 'en']);
  const gone = updateSitter(db, 'Priya', { forget: true });
  assert.deepEqual([gone.rate_cents, gone.large_text, gone.note, gone.evenings], [null, false, null, 6], 'settings go; the evenings happened');
});

test('on the Echo Show: Dadi gets Hindi and large text without anyone saying so; Priya is welcomed back at her rate', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  const dadi = await call('start_handoff', { carer_name: 'Dadi' });
  assert.equal(dadi.structuredContent.view, 'briefing');
  assert.equal(dadi.structuredContent.text_size, 'large');
  assert.equal(dadi.structuredContent.sitter.label, '3rd evening here');
  assert.equal(dadi.structuredContent.sitter.note, "Rahul's mother");
  // No AI in this test, so the Hindi falls back to English words, but the evening is in Hindi.
  assert.equal(dadi.structuredContent.language, 'hi');
  assert.equal((await call('tonight_plan')).structuredContent.text_size, 'large', 'every card, not just the briefing');
  await call('end_handoff');

  const sam = await call('start_handoff', { carer_name: 'Sam' });
  assert.match(said(sam), /^Handoff started for Sam\./);
  assert.equal(sam.structuredContent.sitter.label, 'First evening here');
  assert.equal(sam.structuredContent.text_size, undefined);
  await call('end_handoff');

  const priya = await call('start_handoff', { carer_name: 'Priya' });
  assert.match(said(priya), /^Welcome back, Priya\./);
  assert.equal(priya.structuredContent.sitter.label, '7th evening here');
  setDemoTime('22:00', TZ, 'Sat');
  await call('end_handoff');
  const pay = await call('pay_sitter');
  assert.match(said(pay), /\$16(\.00)? an hour/, 'the rate the house remembered');

  // What the parent says this time is remembered for next time.
  setDemoTime('18:00', TZ, 'Sun');
  await call('start_handoff', { carer_name: 'Sam', language: 'es-US', hourly_rate: 20 });
  assert.equal(activeHandoffLanguage(await state()), 'es-US');
  await call('end_handoff');
  const s = await state();
  const samProfile = s.sitters.find((x: any) => x.name === 'Sam');
  assert.deepEqual([samProfile.language, samProfile.rate_cents, samProfile.evenings], ['es-US', 2000, 2]);
});

const activeHandoffLanguage = (s: any) => s.handoff?.language;

test('the parent page: sitters listed, changed with the parent key only, bad input explained', async () => {
  const s = await state();
  assert.ok(s.sitters.some((x: any) => x.name === 'Priya' && x.evenings >= 7));
  assert.equal((await post('/parent/api/sitter', { k: 'wrong', name: 'Priya', large_text: true })).status, 401);
  const bad = await post('/parent/api/sitter', { name: 'Priya', language: 'xx' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /languages/);
  const ok = await (await post('/parent/api/sitter', { name: 'Priya', large_text: true })).json();
  assert.equal(ok.large_text, true);
  const r = await call('start_handoff', { carer_name: 'priya' });
  assert.equal(r.structuredContent.text_size, 'large');
  assert.ok(activeHandoffLanguage(await state()) === 'en');
  await call('end_handoff');
});
