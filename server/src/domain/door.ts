// Front Door Guard: "Someone's knocking, should I open?" answered from the doorbell camera's latest
// event (Ring), who the parents said to expect tonight (Grandma with soup, a pizza), today's
// delivery windows, and the parents' own door rule. Unknown visitors: don't open, and the photo
// goes to the parents, who can answer "let them in" right from their lock screen.
// Deterministic: no AI decides whether a door is opened.
import { type DB, nowIso } from '../db.js';
import { formatTime, localTime, now } from '../clock.js';
import { activeHandoff, events, getQuestion, householdTz, visibleFacts } from './house.js';

export interface DoorEvent {
  id: number;
  handoff_id: number | null;
  at: string;
  kind: 'person' | 'package';
  label: string;
  snapshot_url: string | null;
  source: string;
}

export interface Visitor {
  id: number;
  name: string;
  kind: 'person' | 'delivery';
  window: string | null;
  from_minutes: number | null;
  to_minutes: number | null;
  note: string | null;
  added_by: string;
}

export class VisitorError extends Error {}

/** How recent a doorbell event must be to count as "the person at the door now". */
const RECENT_MS = 15 * 60_000;
/** Slack around an expected time ("around 7" covers 6:30 to 7:30). */
const SLACK = 30;

const evening = (h: number, m: number, ap?: string) => ((h % 12) + (ap && /a/i.test(ap) ? 0 : 12)) * 60 + m;

/** "7-8 pm", "6:30–7", "around 7", "after 8" → minutes since midnight (evening unless it says am). */
export function parseWindow(text: string | null | undefined): { from: number | null; to: number | null } {
  if (!text) return { from: null, to: null };
  const range = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (range) {
    const ap = range[6] ?? range[3];
    return { from: evening(Number(range[1]), Number(range[2] ?? 0), range[3] ?? ap), to: evening(Number(range[4]), Number(range[5] ?? 0), ap) };
  }
  const after = /\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (after) return { from: evening(Number(after[1]), Number(after[2] ?? 0), after[3]), to: null };
  const one = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (one) {
    const t = evening(Number(one[1]), Number(one[2] ?? 0), one[3]);
    return { from: t - SLACK, to: t + SLACK };
  }
  return { from: null, to: null };
}

export function visitors(db: DB): Visitor[] {
  return db.prepare('SELECT id, name, kind, window, from_minutes, to_minutes, note, added_by FROM visitors ORDER BY COALESCE(from_minutes, 9999), id').all() as unknown as Visitor[];
}

export function addVisitor(db: DB, input: { name?: unknown; kind?: unknown; window?: unknown; note?: unknown }, by = 'Parent'): Visitor {
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 60) : '';
  if (!name) throw new VisitorError('Who are you expecting?');
  const kind = input.kind === 'delivery' ? 'delivery' : 'person';
  const window = typeof input.window === 'string' && input.window.trim() ? input.window.trim().slice(0, 40) : null;
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 120) : null;
  if (visitors(db).length >= 12) throw new VisitorError('That is a lot of visitors for one evening.');
  const w = parseWindow(window);
  const info = db
    .prepare('INSERT INTO visitors (name, kind, window, from_minutes, to_minutes, note, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, kind, window, w.from, w.to, note, by.slice(0, 40), nowIso());
  return visitors(db).find((v) => v.id === Number(info.lastInsertRowid))!;
}

export const removeVisitor = (db: DB, id: number) => db.prepare('DELETE FROM visitors WHERE id = ?').run(id).changes > 0;

/** Tonight's list is for tonight: it ends with the handoff. */
export const clearVisitors = (db: DB) => void db.prepare('DELETE FROM visitors').run();

export function recordDoorEvent(db: DB, input: { kind: 'person' | 'package'; label?: string; snapshot_url?: string | null; source?: string }): DoorEvent {
  const label = input.label ?? (input.kind === 'package' ? 'Package delivery at the front door' : 'Person at the front door');
  const info = db
    .prepare('INSERT INTO door_events (handoff_id, at, kind, label, snapshot_url, source) VALUES (?, ?, ?, ?, ?, ?)')
    .run(activeHandoff(db)?.id ?? null, nowIso(), input.kind, label, input.snapshot_url ?? null, input.source ?? 'ring');
  const ev = getDoorEvent(db, Number(info.lastInsertRowid))!;
  events.emit('door', ev);
  return ev;
}

export function getDoorEvent(db: DB, id: number | null | undefined): DoorEvent | undefined {
  if (!id) return undefined;
  return db.prepare('SELECT * FROM door_events WHERE id = ?').get(id) as unknown as DoorEvent | undefined;
}

export function latestDoorEvent(db: DB, withinMs = RECENT_MS): DoorEvent | undefined {
  const since = new Date(now().getTime() - withinMs).toISOString();
  return db.prepare('SELECT * FROM door_events WHERE at >= ? ORDER BY id DESC LIMIT 1').get(since) as unknown as DoorEvent | undefined;
}

const fits = (v: Visitor, minutes: number) => (v.from_minutes === null || minutes >= v.from_minutes - SLACK) && (v.to_minutes === null || minutes <= v.to_minutes + SLACK);

export type DoorVerdict = 'parent_decided' | 'delivery' | 'expected' | 'unknown' | 'no_event';

export interface DoorCheck {
  verdict: DoorVerdict;
  event: DoorEvent | null;
  /** The parents' own door rule, in their words. */
  rule: { text: string; said_by: string } | null;
  expected: Visitor[];
  deliveries: Visitor[];
  /** When a parent should see the photo: ask with ask_parent_and_wait and pass door_event_id. */
  ask_parent: { question: string; door_event_id: number; urgent: boolean } | null;
  decision: { by: string; answer: string } | null;
  say: string;
}

function list(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '';
}
const describe = (v: Visitor) => `${v.name}${v.window ? ` (${v.window})` : ''}${v.note ? `: ${v.note}` : ''}`;

export function doorCheck(db: DB): DoorCheck {
  const tz = householdTz(db);
  const minutes = localTime(tz).minutes;
  const event = latestDoorEvent(db) ?? null;
  const ruleFact = visibleFacts(db, 'carer').find((f) => /\bdoor\b/i.test(f.text) && /\b(open|answer|stranger|anyone|know)\b/i.test(f.text));
  const rule = ruleFact ? { text: ruleFact.text, said_by: ruleFact.author } : null;
  const all = visitors(db);
  const expected = all.filter((v) => v.kind === 'person' && fits(v, minutes));
  const deliveries = all.filter((v) => v.kind === 'delivery' && fits(v, minutes));
  const ruleLine = rule ? ` ${rule.said_by}'s rule: "${rule.text}"` : '';
  const base = { event, rule, expected, deliveries, ask_parent: null, decision: null };

  // A parent already answered about this visitor.
  const answered = event
    ? (db.prepare("SELECT answer, answered_by FROM questions WHERE door_event_id = ? AND status = 'answered' ORDER BY id DESC LIMIT 1").get(event.id) as
        | { answer: string; answered_by: string }
        | undefined)
    : undefined;
  if (answered) {
    return { ...base, verdict: 'parent_decided', decision: { by: answered.answered_by, answer: answered.answer }, say: `${answered.answered_by} said: "${answered.answer}"` };
  }

  if (!event) {
    const who = [...expected, ...deliveries].map(describe);
    return {
      ...base,
      verdict: 'no_event',
      say: `I don't see anyone on the doorbell camera right now.${who.length ? ` The parents are expecting ${list(who)}.` : ' The parents are not expecting anyone.'}${ruleLine}`,
    };
  }

  const at = formatTime(localTime(tz, new Date(event.at)).minutes);
  if (event.kind === 'package') {
    const d = deliveries[0] ?? all.find((v) => v.kind === 'delivery');
    return {
      ...base,
      verdict: 'delivery',
      say: `It's a delivery at ${at}${d ? `: ${d.name}${d.window ? `, due ${d.window}` : ''}` : ''}. You don't need to open the door; the driver leaves it outside. Bring it in once they've gone.`,
    };
  }

  const question = expected.length
    ? `Is this ${list(expected.map((v) => v.name))} at the front door? (doorbell photo, ${at})`
    : `Someone you didn't list is at the front door (${at}). Should ${activeHandoff(db)?.carer_name ?? 'the sitter'} open it?`;
  const ask = { question, door_event_id: event.id, urgent: !expected.length };
  if (expected.length) {
    return {
      ...base,
      verdict: 'expected',
      ask_parent: ask,
      say: `The parents said to expect ${list(expected.map(describe))}. Check through the window that it's them before you open. I'm sending the photo to the parents to confirm.`,
    };
  }
  return {
    ...base,
    verdict: 'unknown',
    ask_parent: ask,
    say: `Don't open the door. The parents aren't expecting anyone else right now.${ruleLine} You can talk through the door. I'm sending the doorbell photo to the parents.`,
  };
}

/** The door event a question is about, with what the camera saw (for cards and notifications). */
export function doorFor(db: DB, questionId: number) {
  const q = getQuestion(db, questionId);
  return q?.door_event_id ? getDoorEvent(db, q.door_event_id) : undefined;
}

/** Answers a parent can give with one tap, from the page or the lock screen. */
export const DOOR_ANSWERS = { yes: "It's fine, you can let them in.", no: "Don't open the door. I'll call you." };
