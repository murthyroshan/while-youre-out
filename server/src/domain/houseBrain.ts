// House Brain: turns the notes parents already have (a fridge-note photo, a WhatsApp message,
// the doctor's PDF) into proposed house-manual cards. Nothing goes live until a parent confirms it.
import { type DB, type Fact, nowIso } from '../db.js';
import type { AiClient, Part } from '../ai/gemini.js';
import { containsSecret, normalise } from './safety.js';
import { events, visibleFacts } from './house.js';

export const CATEGORIES = ['allergy', 'food', 'medicine', 'routine', 'screen', 'rules', 'pet', 'house', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

export type ImportKind = 'photo' | 'pdf' | 'text';
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_IMPORT_BYTES = 6 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;

export interface Extracted {
  facts: Array<{ category: string; subject?: string | null; text: string; english?: string | null; confidence?: number; conflicts_with?: number | null; conflict_reason?: string | null }>;
  locations: Array<{ item: string; description: string }>;
  action_plan_steps: Array<{ text: string; timer_minutes?: number | null }>;
  contacts: Array<{ name: string; relation: string; phone: string }>;
  /** Codes, passwords and similar the model saw and deliberately left out. */
  omitted_sensitive?: number;
}

export interface Proposal {
  id: number;
  import_id: number;
  kind: 'fact' | 'location' | 'plan_step' | 'contact';
  category: string | null;
  subject: string | null;
  text: string;
  english: string | null;
  item: string | null;
  extra: string | null;
  risk: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'discarded';
  conflict_fact_id: number | null;
  conflict_reason: string | null;
  created_at: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      description: 'One entry per rule or fact about the children, pets or house.',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...CATEGORIES] },
          subject: { type: ['string', 'null'], description: 'Name of the child or pet it is about, if any' },
          text: { type: 'string', description: "The note's own words for this one rule, lightly cleaned up, in the note's language" },
          english: { type: ['string', 'null'], description: 'English translation if the note is not in English, else null' },
          confidence: { type: 'number', description: '0 to 1: how sure you are you read it correctly (handwriting)' },
          conflicts_with: { type: ['integer', 'null'], description: 'id of an existing rule this one contradicts, else null' },
          conflict_reason: { type: ['string', 'null'] },
        },
        required: ['category', 'text', 'confidence'],
      },
    },
    locations: {
      type: 'array',
      items: { type: 'object', properties: { item: { type: 'string' }, description: { type: 'string' } }, required: ['item', 'description'] },
    },
    action_plan_steps: {
      type: 'array',
      description: "Numbered emergency steps from a doctor's action plan, in order, word for word",
      items: { type: 'object', properties: { text: { type: 'string' }, timer_minutes: { type: ['number', 'null'] } }, required: ['text'] },
    },
    contacts: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, relation: { type: 'string' }, phone: { type: 'string' } }, required: ['name', 'relation', 'phone'] },
    },
  },
  required: ['facts', 'locations', 'action_plan_steps', 'contacts', 'omitted_sensitive'],
};
(SCHEMA.properties as Record<string, unknown>).omitted_sensitive = {
  type: 'integer',
  description: 'How many codes, PINs, passwords, key locations or bank details you saw and left out',
};

const SYSTEM = [
  "You read notes that parents leave for a babysitter or grandparent: fridge notes, WhatsApp messages, doctors' allergy action plans.",
  'Extract only what is actually written. Never add advice, guesses or rules that are not in the note.',
  "Keep the parent's own wording for each rule. Split a list into one rule per item.",
  'Categories: allergy (allergies and what to avoid), food, medicine, routine (bedtime, bath, naps, meals times), screen (TV, tablets), rules (other permissions), pet, house (thermostat, appliances), other.',
  'Locations: where things are kept ("EpiPen in the drawer by the stove").',
  "Action plan steps: only from an emergency or allergy action plan, numbered steps, word for word.",
  'NEVER include door codes, alarm codes, PINs, passwords, Wi-Fi passwords, key locations or bank details. Leave them out entirely, and count how many you left out in omitted_sensitive.',
  'Each rule must make sense on its own when read later: replace words like "it" or "her" with what they refer to (write "the inhaler", not "it").',
  'Skip greetings, thanks and sign-offs. Phone numbers go in contacts, not facts.',
  'If handwriting is hard to read, give your best reading with a low confidence instead of skipping it.',
  'You are also given the existing house rules with ids. Set conflicts_with ONLY when the new rule and the existing rule cannot both be followed (for example bedtime 8:30 versus lights out at 8). If the new rule repeats or agrees with an existing rule, leave it out entirely. If it only adds detail, keep it with conflicts_with null.',
].join(' ');

// The model sometimes reports agreement as a "conflict"; those are not conflicts.
const AGREEMENT = /\b(match(es|ing)?|consistent|same as|agrees?|in line with|compatible|repeats?|duplicate|similar to|already)\b/i;

const riskFor = (c: Category) => (c === 'allergy' ? 'safety' : c === 'food' || c === 'medicine' ? 'food_medicine' : c === 'screen' || c === 'house' ? 'low' : 'normal');
const clip = (s: unknown, n: number) => (typeof s === 'string' ? normalise(s).slice(0, n) : '');

// ---------- deterministic conflict check (backs up the model) ----------

// Only things that are clearly clock times: "8:30", "8pm", "at 8", "by 8", "after 6", "8 o'clock".
// Plain numbers ("1 scoop", "2 min", "2 books") are not times.
const TIME =
  /\b(\d{1,2}):(\d{2})\b|\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)|\b(?:at|by|after|before|until|till|around)\s+(\d{1,2})(?!\s*(?:min|mins|minutes|hours?|hrs?|books?|shows?|scoops?|cups?|times|episodes?)\b)\b|\b(\d{1,2})\s*o'?clock\b/gi;
const TOPICS: Array<[string, RegExp]> = [
  ['bedtime', /\b(bed ?time|lights out|bed at|sleep at|go to bed|in bed by)\b/i],
  ['dinner', /\b(dinner|supper)\b/i],
  ['bath', /\bbath\b/i],
  ['screen', /\b(tv|screen|tablet|ipad)\b/i],
  ['nap', /\bnap\b/i],
];
function times(text: string) {
  return [...normalise(text).matchAll(TIME)]
    .map((m) => {
      const hour = Number(m[1] ?? m[3] ?? m[5] ?? m[6]);
      const minute = m[2] ?? '00';
      return `${hour}:${minute}`;
    })
    .filter((t) => Number(t.split(':')[0]) >= 1 && Number(t.split(':')[0]) <= 12);
}
function topicOf(text: string) {
  return TOPICS.find(([, re]) => re.test(text))?.[0];
}
export function timeConflict(a: string, b: string): string | null {
  const ta = topicOf(a);
  if (!ta || ta !== topicOf(b)) return null;
  const xa = times(a);
  const xb = times(b);
  if (!xa.length || !xb.length) return null;
  return xa.some((t) => xb.includes(t)) ? null : `Different ${ta} times: "${a}" vs "${b}"`;
}

const sameText = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- import ----------

export interface ImportInput {
  kind: ImportKind;
  label: string;
  author: string;
  text?: string;
  data?: string; // base64
  mimeType?: string;
}

export class ImportError extends Error {}

export async function importNote(db: DB, ai: AiClient, input: ImportInput) {
  const parts: Part[] = [];
  if (input.kind === 'text') {
    const text = (input.text ?? '').trim();
    if (!text) throw new ImportError('The note is empty.');
    if (text.length > MAX_TEXT_CHARS) throw new ImportError('The note is too long.');
    parts.push({ text: `The note:\n"""\n${text}\n"""` });
  } else {
    const mime = input.kind === 'pdf' ? 'application/pdf' : input.mimeType ?? '';
    if (input.kind === 'photo' && !IMAGE_TYPES.includes(mime)) throw new ImportError('Use a PNG, JPEG, WebP or HEIC photo.');
    if (!input.data || !/^[A-Za-z0-9+/=\s]+$/.test(input.data)) throw new ImportError('The file is missing or not valid base64.');
    if (Math.floor((input.data.length * 3) / 4) > MAX_IMPORT_BYTES) throw new ImportError('The file is larger than 6 MB.');
    parts.push({ inlineData: { mimeType: mime, data: input.data.replace(/\s/g, '') } });
    parts.push({ text: `This is a ${input.kind === 'pdf' ? 'PDF document' : 'photo of a note'} called "${input.label}".` });
  }

  const existing = visibleFacts(db, 'parent');
  parts.push({
    text: `Existing house rules (id: text):\n${existing.map((f) => `${f.id}: [${f.category}] ${f.text}`).join('\n') || '(none)'}`,
  });

  const { data, model } = await ai.generateJson<Extracted>({ system: SYSTEM, parts, schema: SCHEMA });
  return saveProposals(db, input, data, model, existing);
}

/** Validates the model's output and stores it as pending proposals. Exported for tests. */
export function saveProposals(db: DB, input: Pick<ImportInput, 'kind' | 'label' | 'author'>, raw: Extracted, model: string | null, existing: Fact[] = visibleFacts(db, 'parent')) {
  const t = nowIso();
  let dropped = 0;
  const imp = db
    .prepare('INSERT INTO imports (kind, label, author, created_at, model) VALUES (?, ?, ?, ?, ?)')
    .run(input.kind, input.label.slice(0, 80), input.author.slice(0, 40), t, model);
  const importId = Number(imp.lastInsertRowid);
  const insert = db.prepare(
    `INSERT INTO proposals (import_id, kind, category, subject, text, english, item, extra, risk, confidence, conflict_fact_id, conflict_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const existingById = new Map(existing.map((f) => [f.id, f]));
  const secret = (...s: string[]) => {
    if (s.some((x) => containsSecret(x))) {
      dropped++;
      return true;
    }
    return false;
  };

  for (const f of (raw.facts ?? []).slice(0, 60)) {
    const text = clip(f.text, 500);
    const english = clip(f.english, 500) || null;
    if (!text || secret(text, english ?? '')) continue;
    const category: Category = (CATEGORIES as readonly string[]).includes(f.category) ? (f.category as Category) : 'other';
    if (existing.some((e) => sameText(e.text, text))) continue; // already in the manual
    // A conflict the model reports must point at a real rule; a time clash we can see ourselves always counts.
    let conflictId: number | null = typeof f.conflicts_with === 'number' && existingById.has(f.conflicts_with) ? f.conflicts_with : null;
    let reason: string | null = conflictId ? clip(f.conflict_reason, 200) || 'The new note says something different.' : null;
    if (reason && AGREEMENT.test(reason) && !/\b(but|however|whereas|instead|differ|contradict)\b/i.test(reason)) {
      conflictId = null;
      reason = null;
    }
    if (!conflictId) {
      for (const e of existing) {
        const clash = timeConflict(english ?? text, e.text);
        if (clash) {
          conflictId = e.id;
          reason = clash;
          break;
        }
      }
    }
    const confidence = typeof f.confidence === 'number' ? Math.min(Math.max(f.confidence, 0), 1) : 1;
    insert.run(importId, 'fact', category, clip(f.subject, 40) || null, text, english, null, null, riskFor(category), confidence, conflictId, reason, t);
  }
  for (const l of (raw.locations ?? []).slice(0, 30)) {
    const item = clip(l.item, 60);
    const description = clip(l.description, 300);
    if (!item || !description || secret(item, description)) continue;
    insert.run(importId, 'location', null, null, description, null, item, null, 'normal', 1, null, null, t);
  }
  const hasPlan = (db.prepare('SELECT COUNT(*) AS n FROM action_plan_steps').get() as { n: number }).n > 0;
  (raw.action_plan_steps ?? []).slice(0, 15).forEach((s, i) => {
    const text = clip(s.text, 500);
    if (!text || secret(text)) return;
    const timer = typeof s.timer_minutes === 'number' && s.timer_minutes > 0 ? Math.round(s.timer_minutes * 60) : null;
    const reason = hasPlan ? 'Replaces the emergency plan already saved.' : null;
    insert.run(importId, 'plan_step', 'allergy', null, text, null, null, timer === null ? String(i + 1) : `${i + 1}|${timer}`, 'safety', 1, null, reason, t);
  });
  const knownContacts = (db.prepare('SELECT name, phone FROM contacts').all() as Array<{ name: string; phone: string }>).map((c) => ({
    name: c.name.toLowerCase(),
    digits: c.phone.replace(/\D/g, '').slice(-10),
  }));
  for (const c of (raw.contacts ?? []).slice(0, 10)) {
    const name = clip(c.name, 40);
    const phone = clip(c.phone, 30);
    if (!name || !/\d{3}/.test(phone)) continue;
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (knownContacts.some((k) => k.name === name.toLowerCase() || (digits.length >= 7 && k.digits === digits))) continue; // already saved
    insert.run(importId, 'contact', null, null, clip(c.relation, 40) || 'Contact', null, name, phone, 'normal', 1, null, null, t);
  }

  // Ours plus the ones the model already left out, so parents see that codes were not kept.
  const omitted = typeof raw.omitted_sensitive === 'number' && raw.omitted_sensitive > 0 ? Math.min(Math.round(raw.omitted_sensitive), 20) : 0;
  dropped += omitted;
  db.prepare('UPDATE imports SET dropped_secrets = ? WHERE id = ?').run(dropped, importId);
  const proposals = pendingProposals(db).filter((p) => p.import_id === importId);
  events.emit('proposals', { importId, count: proposals.length });
  return { import_id: importId, model, proposals, dropped_secrets: dropped };
}

export function pendingProposals(db: DB): Proposal[] {
  return db.prepare("SELECT * FROM proposals WHERE status = 'pending' ORDER BY import_id, id").all() as unknown as Proposal[];
}

export function importInfo(db: DB, id: number) {
  return db.prepare('SELECT * FROM imports WHERE id = ?').get(id) as
    | { id: number; kind: string; label: string; author: string; created_at: string; model: string | null; dropped_secrets: number }
    | undefined;
}

export class ProposalError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Accepts or discards a proposal. For a conflict the parent chooses: "replace" retires the old
 * rule, "keep_both" keeps both, "keep_old" discards the new one.
 */
export function decideProposal(
  db: DB,
  id: number,
  decision: { action: 'accept' | 'discard'; resolution?: 'replace' | 'keep_both' | 'keep_old'; text?: string; by: string },
) {
  const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as unknown as Proposal | undefined;
  if (!p) throw new ProposalError('Proposal not found', 404);
  if (p.status !== 'pending') throw new ProposalError(`Proposal already ${p.status}`, 409);
  const t = nowIso();
  const discard = () => db.prepare("UPDATE proposals SET status = 'discarded' WHERE id = ?").run(id);
  if (decision.action === 'discard' || decision.resolution === 'keep_old') {
    discard();
    return { status: 'discarded' as const };
  }
  if (p.conflict_fact_id && !decision.resolution) throw new ProposalError('This conflicts with an existing rule: choose replace, keep_both or keep_old.');

  const text = decision.text !== undefined ? clip(decision.text, 500) : p.text;
  if (!text) throw new ProposalError('The text is empty.');
  if (containsSecret(text)) throw new ProposalError("Codes and passwords can't be stored in the house manual.");
  const imp = importInfo(db, p.import_id);
  const source = imp?.kind ?? 'import';

  if (p.kind === 'fact') {
    db.prepare(
      `INSERT INTO facts (category, subject, text, source, author, created_at, visibility, risk) VALUES (?, ?, ?, ?, ?, ?, 'carer', ?)`,
    ).run(p.category ?? 'other', p.subject, p.english && decision.text === undefined ? `${text} (${p.english})` : text, source, decision.by, t, p.risk);
    if (p.conflict_fact_id && decision.resolution === 'replace') {
      db.prepare('UPDATE facts SET expires_at = ? WHERE id = ?').run(t, p.conflict_fact_id);
    }
  } else if (p.kind === 'location') {
    const item = p.item ?? 'Item';
    const existing = db.prepare('SELECT id FROM locations WHERE lower(item) = lower(?)').get(item) as { id: number } | undefined;
    if (existing) db.prepare('UPDATE locations SET description = ? WHERE id = ?').run(text, existing.id);
    else db.prepare('INSERT INTO locations (item, description, photo_url) VALUES (?, ?, NULL)').run(item, text);
  } else if (p.kind === 'plan_step') {
    const [stepNo, timer] = (p.extra ?? '').split('|').map(Number);
    const plan = `${imp?.label ?? 'Action plan'} #${p.import_id}`;
    // Two emergency plans must never be mixed: the new one replaces the old one, explicitly.
    const otherPlan = db.prepare('SELECT COUNT(*) AS n FROM action_plan_steps WHERE plan <> ?').get(plan) as { n: number };
    if (otherPlan.n > 0) {
      if (decision.resolution !== 'replace') throw new ProposalError('This replaces the emergency plan already saved: choose replace or keep_old.');
      db.prepare('DELETE FROM action_plan_steps WHERE plan <> ?').run(plan);
    }
    db.prepare('INSERT INTO action_plan_steps (plan, step_no, text, timer_seconds) VALUES (?, ?, ?, ?)').run(plan, stepNo || 99, text, Number.isFinite(timer) ? timer : null);
  } else if (p.kind === 'contact') {
    const max = (db.prepare('SELECT COALESCE(MAX(priority), 0) AS m FROM contacts WHERE priority < 9').get() as { m: number }).m;
    const isDoctor = /doctor|pediatric|paediatric|gp\b|clinic/i.test(p.text);
    db.prepare('INSERT INTO contacts (name, relation, phone, priority) VALUES (?, ?, ?, ?)').run(p.item, p.text, p.extra, isDoctor ? 9 : max + 1);
  }
  db.prepare("UPDATE proposals SET status = 'accepted' WHERE id = ?").run(id);
  return { status: 'accepted' as const };
}
