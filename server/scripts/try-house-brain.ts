// Live check: reads the sample fridge note and WhatsApp text with Gemini and prints the proposals.
// Usage: npx tsx scripts/try-house-brain.ts
import { readFileSync } from 'node:fs';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { geminiFromEnv } from '../src/ai/gemini.js';
import { importNote } from '../src/domain/houseBrain.js';

const db = openDb(':memory:');
seedDemoHousehold(db);
const ai = geminiFromEnv();
if (!ai.available) throw new Error('Set GEMINI_API_KEY in server/.env');

const show = (title: string, out: Awaited<ReturnType<typeof importNote>>, ms: number) => {
  console.log(`\n=== ${title} (${out.model}, ${ms} ms, dropped secrets: ${out.dropped_secrets}) ===`);
  for (const p of out.proposals) {
    const what = p.kind === 'location' ? `${p.item}: ${p.text}` : p.kind === 'contact' ? `${p.item} (${p.text}) ${p.extra}` : p.text;
    console.log(`- [${p.kind}/${p.category ?? '-'}/${p.risk}] ${what}${p.english ? ` -> ${p.english}` : ''}${p.confidence < 0.8 ? ` (confidence ${p.confidence})` : ''}`);
    if (p.conflict_fact_id || p.conflict_reason) console.log(`    CONFLICT with #${p.conflict_fact_id}: ${p.conflict_reason}`);
  }
};

let t = Date.now();
const photo = await importNote(db, ai, {
  kind: 'photo',
  mimeType: 'image/png',
  data: readFileSync(new URL('../samples/fridge-note.png', import.meta.url)).toString('base64'),
  label: 'Fridge note photo',
  author: 'Anita',
});
show('Fridge note photo', photo, Date.now() - t);

t = Date.now();
const chat = await importNote(db, ai, {
  kind: 'text',
  text: readFileSync(new URL('../samples/whatsapp.txt', import.meta.url), 'utf8'),
  label: 'WhatsApp from Anita',
  author: 'Anita',
});
show('WhatsApp chat', chat, Date.now() - t);
