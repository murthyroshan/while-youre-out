// The morning after: what happened, what's worth noticing across evenings, which of last night's
// answers could become house rules, and what ran out. Plus "since your last visit" for a carer
// who has been here before. All deterministic; it notices patterns but never diagnoses.
import type { DB, Fact, Handoff, LogEvent } from '../db.js';
import { formatTime, localTime, now, nowIso } from '../clock.js';
import { classifyQuestion } from './safety.js';
import { householdTz } from './house.js';
import { tonightPlan } from './plan.js';

const WOKE = /\b(woke|waking|nightmare|crying|cried|up again|couldn'?t sleep|bad dream)\b/i;
const ASLEEP = /\b(asleep|fell asleep|sleeping|lights out)\b/i;
const RAN_OUT = /\b(?:last|ran out of|run out of|out of|finished the|no more|running low on|used the last)\s+(?:the\s+)?([a-z][a-z' -]{1,30}?)(?=[.,!;]|$|\s+(?:so|and|but|for)\b)/gi;

export interface Debrief {
  handoff_id: number;
  carer: string;
  timeline: Array<{ at: string; text: string; kind: string }>;
  questions: Array<{ id: number; text: string; answer: string | null; answered_by: string | null; scope: string | null; status: string }>;
  insights: string[];
  rule_suggestions: Array<{ question_id: number; text: string; answer: string; by: string }>;
  supplies: string[];
}

const logOf = (db: DB, handoffId: number) =>
  db.prepare('SELECT * FROM log_events WHERE handoff_id = ? ORDER BY at').all(handoffId) as unknown as LogEvent[];

export function buildDebrief(db: DB, h: Handoff): Debrief {
  const tz = householdTz(db);
  const log = logOf(db, h.id);
  const questions = db
    .prepare('SELECT id, text, answer, answered_by, scope, status, category, urgency FROM questions WHERE handoff_id = ? ORDER BY id')
    .all(h.id) as Array<Debrief['questions'][number] & { category: string; urgency: string }>;
  const insights: string[] = [];
  const child = (db.prepare("SELECT name FROM members WHERE kind = 'child' ORDER BY id LIMIT 1").get() as { name: string } | undefined)?.name ?? 'The child';

  // Night wakes, tonight and across recent evenings with a sitter.
  const wokeTonight = log.some((e) => WOKE.test(e.text));
  const previous = db
    .prepare("SELECT id FROM handoffs WHERE status = 'ended' AND id <> ? AND started_at < ? ORDER BY started_at DESC LIMIT 3")
    .all(h.id, h.started_at) as Array<{ id: number }>;
  const wokeBefore = previous.filter((p) => logOf(db, p.id).some((e) => WOKE.test(e.text))).length;
  if (wokeTonight && previous.length >= 2 && wokeBefore >= 1) {
    insights.push(`${child} woke up at night in ${wokeBefore + 1} of the last ${previous.length + 1} evenings with a sitter. Might be worth keeping an eye on.`);
  } else if (wokeTonight) {
    insights.push(`${child} woke up once during the night.`);
  }

  // Bedtime against tonight's plan.
  const asleep = log.find((e) => ASLEEP.test(e.text));
  const planned = tonightPlan(db, tz, h, localTime(tz, new Date(h.started_at))).items.find((i) => i.key === 'bedtime');
  if (asleep && planned) {
    // A time the carer said ("fell asleep at 8:40") beats when they happened to log it.
    const said = /\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(asleep.text);
    const saidMinutes = said ? ((Number(said[1]) % 12) + (said[3] && /a/i.test(said[3]) ? 0 : 12)) * 60 + Number(said[2] ?? 0) : null;
    const at = saidMinutes ?? localTime(tz, new Date(asleep.at)).minutes;
    const diff = at - planned.minutes;
    insights.push(
      Math.abs(diff) <= 10
        ? `Asleep at ${formatTime(at)}, right on the plan.`
        : `Asleep at ${formatTime(at)}, ${Math.abs(diff)} minutes ${diff > 0 ? 'after' : 'before'} the plan's ${planned.time}${h.plan_shift_reason ? ' (bedtime had moved for the late nap)' : ''}.`,
    );
  }

  // Teach-back.
  try {
    const tb = h.teachback ? JSON.parse(h.teachback) : null;
    if (tb?.done) {
      const right = tb.results.filter((r: { correct: boolean | null }) => r.correct).length;
      insights.push(right === tb.questions.length ? `${h.carer_name} got all ${right} handover questions right.` : `${h.carer_name} got ${right} of ${tb.questions.length} handover questions right; the rest were corrected on screen.`);
    }
  } catch {
    // no teach-back recorded
  }

  // Tonight's one-off answers that could become house rules (never food, medicine or safety).
  const rule_suggestions = questions
    .filter((q) => q.status === 'answered' && q.scope === 'tonight' && q.answer && q.urgency !== 'urgent' && classifyQuestion(q.text) === 'general' && !/^please call me/i.test(q.answer))
    .map((q) => ({ question_id: q.id, text: q.text, answer: q.answer!, by: q.answered_by ?? 'Parent' }));

  // Things that ran out.
  const supplies = [
    ...new Set(
      log.flatMap((e) => [...e.text.matchAll(RAN_OUT)].map((m) => m[1].trim().replace(/\s+(today|tonight|now)$/i, '').toLowerCase())),
    ),
  ].slice(0, 6);
  if (supplies.length) insights.push(`Running low: ${supplies.join(', ')}.`);

  return {
    handoff_id: h.id,
    carer: h.carer_name,
    timeline: log.map((e) => ({ at: e.at, text: e.text, kind: e.kind })),
    questions: questions.map(({ category: _c, urgency: _u, ...q }) => q),
    insights,
    rule_suggestions,
    supplies,
  };
}

/** The debrief of the most recent handoff, if it ended in the last 24 hours. */
export function latestDebrief(db: DB): Debrief | null {
  const h = db.prepare("SELECT * FROM handoffs WHERE status = 'ended' ORDER BY ended_at DESC LIMIT 1").get() as unknown as Handoff | undefined;
  if (!h?.ended_at || now().getTime() - new Date(h.ended_at).getTime() > 24 * 3_600_000) return null;
  return buildDebrief(db, h);
}

/** Turns one of last night's answers into a permanent house rule, at a parent's request. */
export function saveAnswerAsRule(db: DB, questionId: number): boolean {
  const q = db.prepare("SELECT * FROM questions WHERE id = ? AND status = 'answered'").get(questionId) as
    | { id: number; text: string; answer: string; answered_by: string; scope: string; urgency: string; handoff_id: number }
    | undefined;
  if (!q || q.scope !== 'tonight' || q.urgency === 'urgent' || classifyQuestion(q.text) !== 'general') return false;
  const text = `Q: ${q.text.replace(/\?*$/, '?')} A: ${q.answer}`;
  const updated = db.prepare('UPDATE facts SET expires_at = NULL, handoff_id = NULL WHERE text = ? AND handoff_id = ?').run(text, q.handoff_id);
  if (!updated.changes) {
    db.prepare("INSERT INTO facts (category, subject, text, source, author, created_at, visibility, risk) VALUES ('rules', NULL, ?, 'parent_answer', ?, ?, 'carer', 'normal')").run(
      text,
      q.answered_by,
      nowIso(),
    );
  }
  db.prepare("UPDATE questions SET scope = 'always' WHERE id = ?").run(q.id);
  return true;
}

// ---------- since your last visit ----------

export interface SinceLastVisit {
  last_visit: string;
  added: Array<{ text: string; said_by: string }>;
  removed: Array<{ text: string }>;
}

/** What changed in the house manual since this carer's last handoff ended. */
export function sinceLastVisit(db: DB, carerName: string, currentHandoffId: number): SinceLastVisit | null {
  const last = db
    .prepare("SELECT ended_at FROM handoffs WHERE lower(carer_name) = lower(?) AND status = 'ended' AND id <> ? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1")
    .get(carerName, currentHandoffId) as { ended_at: string } | undefined;
  if (!last) return null;
  const facts = db.prepare("SELECT * FROM facts WHERE visibility <> 'parent' AND confirmed = 1 AND handoff_id IS NULL").all() as unknown as Fact[];
  const t = nowIso();
  const added = facts
    .filter((f) => f.created_at > last.ended_at && (!f.expires_at || f.expires_at > t))
    .map((f) => ({ text: f.text, said_by: f.author }));
  const removed = facts.filter((f) => f.expires_at && f.expires_at > last.ended_at && f.expires_at <= t).map((f) => ({ text: f.text }));
  if (!added.length && !removed.length) return null;
  return { last_visit: last.ended_at, added, removed };
}
