// Guest Pass: tonight's sitter gets a pass with a time window, issued when the parents hand over.
// The kitchen Echo Show shows it as a QR code; the sitter scans it and gets tonight on her own
// phone (what matters most, who to call, ask the parents). The pass ends with the evening, or when
// a parent ends it; at its end time the parents are asked whether to extend it, and half an hour
// later it closes by itself. Everything done under the pass is in an audit log the parents can read.
import { createHash, randomBytes } from 'node:crypto';
import { type DB, nowIso } from '../db.js';
import { now } from '../clock.js';
import { events } from './house.js';

export interface Pass {
  id: number;
  handoff_id: number;
  carer: string;
  starts_at: string;
  ends_at: string;
  status: 'active' | 'ended' | 'revoked';
  reminded: number;
  ended_at: string | null;
  last_seen_at: string | null;
}

/** How long a pass lasts unless the parents say otherwise. */
export const PASS_HOURS = 5;
/** After the end time, the pass stays open this long so a late parent isn't a locked-out sitter. */
export const GRACE_MINUTES = 30;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** A new pass for tonight's sitter (any earlier one ends). Returns the token for the sitter's link. */
export function issuePass(db: DB, handoffId: number, carer: string, hours = PASS_HOURS): { pass: Pass; token: string } {
  endPass(db, 'ended');
  const token = randomBytes(24).toString('base64url');
  const start = now();
  const end = new Date(start.getTime() + hours * 60 * 60_000);
  const info = db
    .prepare("INSERT INTO passes (handoff_id, carer, token_hash, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'active')")
    .run(handoffId, carer, hash(token), start.toISOString(), end.toISOString());
  const pass = getPass(db, Number(info.lastInsertRowid))!;
  events.emit('pass', { pass, change: 'issued' });
  return { pass, token };
}

export const getPass = (db: DB, id: number) => db.prepare('SELECT * FROM passes WHERE id = ?').get(id) as unknown as Pass | undefined;
export const activePass = (db: DB) => db.prepare("SELECT * FROM passes WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as unknown as Pass | undefined;
export const latestPass = (db: DB) => db.prepare('SELECT * FROM passes ORDER BY id DESC LIMIT 1').get() as unknown as Pass | undefined;

/** The pass a sitter's link carries, whatever its state (the page says when it has ended). */
export function passByToken(db: DB, token: string): Pass | undefined {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return undefined;
  return db.prepare('SELECT * FROM passes WHERE token_hash = ?').get(hash(token)) as unknown as Pass | undefined;
}

/** Whether the pass still lets the sitter in: active, and not past its end time plus the grace. */
export const passOpen = (p: Pass | undefined) => Boolean(p && p.status === 'active' && now().getTime() < Date.parse(p.ends_at) + GRACE_MINUTES * 60_000);

/** A parent gives more time (from their phone). */
export function extendPass(db: DB, minutes: number): Pass | undefined {
  const p = activePass(db);
  if (!p) return undefined;
  const base = Math.max(Date.parse(p.ends_at), now().getTime());
  db.prepare('UPDATE passes SET ends_at = ?, reminded = 0 WHERE id = ?').run(new Date(base + minutes * 60_000).toISOString(), p.id);
  const pass = getPass(db, p.id)!;
  events.emit('pass', { pass, change: 'extended' });
  return pass;
}

/** The evening ended ("ended"), or a parent took the pass back ("revoked"). */
export function endPass(db: DB, status: 'ended' | 'revoked'): Pass | undefined {
  const p = activePass(db);
  if (!p) return undefined;
  db.prepare('UPDATE passes SET status = ?, ended_at = ? WHERE id = ?').run(status, nowIso(), p.id);
  const pass = getPass(db, p.id)!;
  events.emit('pass', { pass, change: status });
  return pass;
}

/** Called every minute: asks the parents at the end time, and closes the pass after the grace. */
export function passTick(db: DB) {
  const p = activePass(db);
  if (!p) return;
  const t = now().getTime();
  const end = Date.parse(p.ends_at);
  if (t >= end + GRACE_MINUTES * 60_000) {
    db.prepare("UPDATE passes SET status = 'ended', ended_at = ? WHERE id = ?").run(nowIso(), p.id);
    audit(db, { actor: 'While You’re Out', via: 'the pass', action: `${p.carer}'s pass closed`, detail: 'Nobody extended it.' });
    events.emit('pass', { pass: getPass(db, p.id), change: 'expired' });
  } else if (t >= end && !p.reminded) {
    db.prepare('UPDATE passes SET reminded = 1 WHERE id = ?').run(p.id);
    events.emit('pass_reminder', getPass(db, p.id));
  }
}

/** The sitter opened the pass on her phone (the first time is in the log). */
export function seen(db: DB, p: Pass) {
  if (!p.last_seen_at) audit(db, { pass_id: p.id, actor: p.carer, via: `${p.carer}'s phone`, action: 'Opened tonight’s pass' });
  db.prepare('UPDATE passes SET last_seen_at = ? WHERE id = ?').run(nowIso(), p.id);
}

// ---------- the audit log ----------

export interface AuditEntry {
  id: number;
  at: string;
  pass_id: number | null;
  actor: string;
  via: string;
  action: string;
  detail: string | null;
}

export function audit(db: DB, e: { actor: string; via: string; action: string; detail?: string | null; pass_id?: number | null }) {
  const passId = e.pass_id ?? activePass(db)?.id ?? null;
  db.prepare('INSERT INTO audit (at, pass_id, actor, via, action, detail) VALUES (?, ?, ?, ?, ?, ?)').run(
    nowIso(),
    passId,
    e.actor.slice(0, 60),
    e.via.slice(0, 60),
    e.action.slice(0, 200),
    e.detail ? e.detail.slice(0, 300) : null,
  );
  events.emit('audit', null);
}

export const auditLog = (db: DB, limit = 60) => db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit) as unknown as AuditEntry[];
