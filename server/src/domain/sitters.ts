// Sitter profiles: the house remembers each person who looks after the children, so the second
// evening is better than the first. Priya, back for her seventh evening, hears "welcome back" and
// is only checked on what changed; someone new gets the whole handover; Dadi gets it in Hindi, in
// large text. Built from the evenings themselves plus what the parents set; the parents can change
// or clear any of it.
import { type DB, nowIso } from '../db.js';
import type { TeachbackState } from './teachback.js';

export class SitterError extends Error {}

export interface SitterProfile {
  name: string;
  /** Evenings this sitter has finished here. */
  evenings: number;
  last_visit: string | null;
  /** BCP-47 code the handover is given in, e.g. hi-IN. */
  language: string | null;
  rate_cents: number | null;
  /** Bigger text on every card while this sitter is here. */
  large_text: boolean;
  /** The parents' own note, e.g. "Rahul's mother". */
  note: string | null;
  /** The handover check on their last evening, if one was done. */
  last_check: { right: number; total: number } | null;
  /** Questions they've asked the parents across all their evenings. */
  asked: number;
}

export const LANGUAGES: Record<string, string> = { en: 'English', 'hi-IN': 'Hindi', 'es-US': 'Spanish', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'bn-IN': 'Bengali' };
const key = (name: string) => name.trim().toLowerCase();

interface Row {
  name: string;
  language: string | null;
  rate_cents: number | null;
  large_text: number;
  note: string | null;
}

const row = (db: DB, name: string) => db.prepare('SELECT * FROM sitters WHERE key = ?').get(key(name)) as unknown as Row | undefined;

/** The last evening this sitter finished, with its handover check (excluding tonight's). */
function lastEvening(db: DB, name: string, except = 0) {
  return db
    .prepare("SELECT id, ended_at, teachback FROM handoffs WHERE lower(carer_name) = ? AND status = 'ended' AND id <> ? ORDER BY ended_at DESC LIMIT 1")
    .get(key(name), except) as { id: number; ended_at: string; teachback: string | null } | undefined;
}

/** This sitter's finished handover checks, most recent first (excluding tonight's). */
export function pastChecks(db: DB, name: string, except = 0): TeachbackState[] {
  const rows = db
    .prepare("SELECT teachback FROM handoffs WHERE lower(carer_name) = ? AND status = 'ended' AND id <> ? AND teachback IS NOT NULL ORDER BY ended_at DESC LIMIT 10")
    .all(key(name), except) as Array<{ teachback: string }>;
  return rows.flatMap((r) => {
    try {
      const s = JSON.parse(r.teachback) as TeachbackState;
      return s?.done ? [s] : [];
    } catch {
      return [];
    }
  });
}

/** The handover check from this sitter's last evening, if they finished one. */
export function lastCheck(db: DB, name: string, except = 0): TeachbackState | null {
  try {
    const s = JSON.parse(lastEvening(db, name, except)?.teachback ?? 'null') as TeachbackState | null;
    return s?.done ? s : null;
  } catch {
    return null;
  }
}

export function sitterProfile(db: DB, name: string, except = 0): SitterProfile {
  const r = row(db, name);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM handoffs WHERE lower(carer_name) = ? AND status = 'ended' AND id <> ?").get(key(name), except) as { n: number };
  const { q } = db
    .prepare("SELECT COUNT(*) AS q FROM questions WHERE handoff_id IN (SELECT id FROM handoffs WHERE lower(carer_name) = ? AND id <> ?) AND shopping_item IS NULL")
    .get(key(name), except) as { q: number };
  const check = lastCheck(db, name, except);
  return {
    name: r?.name ?? name.trim(),
    evenings: n,
    last_visit: lastEvening(db, name, except)?.ended_at ?? null,
    language: r?.language ?? null,
    rate_cents: r?.rate_cents ?? null,
    large_text: Boolean(r?.large_text),
    note: r?.note ?? null,
    last_check: check ? { right: check.results.filter((x) => x.correct).length, total: check.questions.length } : null,
    asked: q,
  };
}

/** Everyone who has looked after the children here, most recent first. */
export function sitters(db: DB): SitterProfile[] {
  const names = db
    .prepare(
      `SELECT name FROM (
         SELECT carer_name AS name, MAX(COALESCE(ended_at, started_at)) AS at FROM handoffs GROUP BY lower(carer_name)
         UNION ALL SELECT name, updated_at AS at FROM sitters WHERE key NOT IN (SELECT lower(carer_name) FROM handoffs)
       ) ORDER BY at DESC LIMIT 12`,
    )
    .all() as Array<{ name: string }>;
  return names.map((x) => sitterProfile(db, x.name));
}

/** Remembers what the parent said when handing over: next time it needn't be said again. */
export function rememberSitter(db: DB, name: string, said: { language?: string | null; rate_cents?: number | null }) {
  const r = row(db, name);
  db.prepare(
    `INSERT INTO sitters (key, name, language, rate_cents, large_text, note, updated_at) VALUES (?, ?, ?, ?, 0, NULL, ?)
     ON CONFLICT(key) DO UPDATE SET name = excluded.name, language = COALESCE(?, sitters.language), rate_cents = COALESCE(?, sitters.rate_cents), updated_at = excluded.updated_at`,
  ).run(key(name), r?.name ?? name.trim(), said.language ?? null, said.rate_cents ?? null, nowIso(), said.language ?? null, said.rate_cents ?? null);
}

/** A parent's changes from their phone. Throws SitterError with a message the page can show. */
export function updateSitter(db: DB, name: unknown, patch: { language?: unknown; rate?: unknown; large_text?: unknown; note?: unknown; forget?: unknown }) {
  const who = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  if (!who) throw new SitterError('Which sitter?');
  if (patch.forget === true) {
    db.prepare('DELETE FROM sitters WHERE key = ?').run(key(who));
    return sitterProfile(db, who);
  }
  const p = sitterProfile(db, who);
  let language = p.language;
  if (patch.language !== undefined) {
    if (patch.language !== null && !(typeof patch.language === 'string' && patch.language in LANGUAGES)) throw new SitterError('Choose one of the languages listed.');
    language = patch.language as string | null;
  }
  let rate = p.rate_cents;
  if (patch.rate !== undefined) {
    const n = patch.rate === null || patch.rate === '' ? null : Number(patch.rate);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 500)) throw new SitterError('The hourly rate is $0 to $500.');
    rate = n === null ? null : Math.round(n * 100);
  }
  const large = patch.large_text === undefined ? p.large_text : patch.large_text === true;
  const note = patch.note === undefined ? p.note : typeof patch.note === 'string' && patch.note.trim() ? patch.note.trim().replace(/\s+/g, ' ').slice(0, 120) : null;
  db.prepare(
    `INSERT INTO sitters (key, name, language, rate_cents, large_text, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET language = excluded.language, rate_cents = excluded.rate_cents, large_text = excluded.large_text, note = excluded.note, updated_at = excluded.updated_at`,
  ).run(key(who), p.name, language, rate, large ? 1 : 0, note, nowIso());
  return sitterProfile(db, who);
}

/** True while tonight's sitter reads better with large text. */
export function largeTextTonight(db: DB) {
  const r = db.prepare("SELECT s.large_text FROM handoffs h JOIN sitters s ON s.key = lower(h.carer_name) WHERE h.status = 'active' LIMIT 1").get() as { large_text: number } | undefined;
  return Boolean(r?.large_text);
}

/** "7th evening here", "First evening here". */
export function eveningsLabel(p: SitterProfile) {
  if (!p.evenings) return 'First evening here';
  const n = p.evenings + 1;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix} evening here`;
}
