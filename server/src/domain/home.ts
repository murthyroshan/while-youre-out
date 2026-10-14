// The Echo Show's home screen during a handoff: what's next, how the evening is going, who's in
// the house, and whether the parents have answered. Built from the same data as everything else;
// the screen refreshes it every half minute.
import type { DB } from '../db.js';
import { formatTime, localTime, now as nowDate } from '../clock.js';
import { activeHandoff, eveningLog, household, householdTz, parentNames, pendingQuestions, contacts, visibleFacts } from './house.js';
import { inSentence, nextItem, tonightPlan } from './plan.js';
import { busyUntil, getSetting } from './shadow.js';
import { sinceLastVisit } from './debrief.js';
import { summary, teachbackState } from './teachback.js';
import { latestDoorEvent } from './door.js';

const ALLERGENS = ['peanut', 'tree nut', 'egg', 'milk', 'dairy', 'wheat', 'gluten', 'soy', 'sesame', 'fish', 'shellfish', 'shrimp', 'bee', 'penicillin', 'latex', 'nut'];
const ASLEEP = /\b(asleep|fell asleep|sleeping|lights out|went to bed|in bed)\b/i;
const WOKE = /\b(woke|awake|up again|crying)\b/i;

export interface HomeMember {
  name: string;
  kind: 'child' | 'pet';
  age: string | null;
  /** Short label for the badge, e.g. "Peanuts". */
  allergy: string | null;
}

export interface HomeScreen {
  mode: 'carer' | 'parent';
  household: string;
  carer: string | null;
  clock: { hhmm: string; minutes: number; weekday: string; time: string };
  next: { key: string; title: string; time: string; minutes_until: number; status: string; checklist: string[] } | null;
  plan: Array<{ key: string; title: string; time: string; status: string }>;
  night: boolean;
  asleep_since: string | null;
  last_log: { time: string; text: string } | null;
  members: HomeMember[];
  parents: Array<{ name: string; relation: string }>;
  questions_waiting: number;
  last_answer: { by: string; answer: string; question: string; minutes_ago: number } | null;
  busy_until: string | null;
  teachback: { right: number; total: number; done: boolean } | null;
  /** The doorbell in the last hour, and what a parent said about it. */
  door: { time: string; label: string; decision: string | null } | null;
  /** What the parents changed since this carer's last visit (first hour of the handoff). */
  changes?: string[];
  /** Lights out for the house (simulated smart home). */
  smart_home?: Array<{ device: string; state: string }> | null;
}

/** "Peanuts", "Eggs and sesame": the allergens named in a child's allergy rules. */
function allergyLabel(texts: string[]): string | null {
  if (!texts.length) return null;
  const lower = texts.join(' ').toLowerCase();
  const found: string[] = [];
  for (const a of ALLERGENS) {
    if (new RegExp(`\\b${a}s?\\b`).test(lower) && !found.some((f) => f.includes(a))) found.push(a);
  }
  if (!found.length) return 'Allergy';
  const plural = found.map((a) => (/(fish|dairy|wheat|gluten|soy|sesame|milk|latex|penicillin|shellfish)$/.test(a) ? a : `${a}s`));
  const label = plural.length > 1 ? `${plural.slice(0, -1).join(', ')} and ${plural.at(-1)}` : plural[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The time the carer said ("fell asleep at 8:10"), which beats when they logged it. Evening by default. */
function saidTime(text: string): string | null {
  const m = /\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return null;
  return formatTime(((Number(m[1]) % 12) + (m[3] && /a/i.test(m[3]) ? 0 : 12)) * 60 + Number(m[2] ?? 0));
}

export function homeScreen(db: DB): HomeScreen {
  const tz = householdTz(db);
  const now = localTime(tz);
  const h = activeHandoff(db);
  const facts = visibleFacts(db, 'carer');
  const members = (db.prepare('SELECT name, kind, age FROM members ORDER BY id').all() as Array<{ name: string; kind: 'child' | 'pet'; age: string | null }>).map(
    (m) => ({ ...m, allergy: m.kind === 'child' ? allergyLabel(facts.filter((f) => f.category === 'allergy' && f.subject === m.name).map((f) => f.text)) : null }),
  );
  const people = contacts(db);
  const parents = parentNames(db).map((name) => ({ name, relation: people.find((c) => c.name === name)?.relation ?? '' }));
  const clock = { hhmm: now.hhmm, minutes: now.minutes, weekday: now.weekday, time: formatTime(now.minutes) };
  const base: HomeScreen = {
    mode: h ? 'carer' : 'parent',
    household: household(db)?.name ?? '',
    carer: h?.carer_name ?? null,
    clock,
    next: null,
    plan: [],
    night: false,
    asleep_since: null,
    last_log: null,
    members,
    parents,
    questions_waiting: 0,
    last_answer: null,
    busy_until: null,
    teachback: null,
    door: null,
  };
  if (!h) return { ...base, plan: tonightPlan(db, tz, undefined, now).items.map((i) => ({ key: i.key, title: i.title, time: i.time, status: 'upcoming' })) };

  const plan = tonightPlan(db, tz, h, now);
  const next = nextItem(plan.items);
  const log = eveningLog(db, h.id);
  const timeOf = (iso: string) => formatTime(localTime(tz, new Date(iso)).minutes);
  // Asleep, unless something later says they woke up.
  const lastSleep = [...log].reverse().find((e) => ASLEEP.test(e.text) || WOKE.test(e.text));
  const asleep = lastSleep && ASLEEP.test(lastSleep.text) && !/\bwoke\b/i.test(lastSleep.text) ? lastSleep : null;
  const bedtime = plan.items.find((i) => i.key === 'bedtime');
  const answered = db
    .prepare("SELECT text, answer, answered_by, answered_at FROM questions WHERE handoff_id = ? AND status = 'answered' AND text NOT LIKE 'Urgent:%' ORDER BY answered_at DESC LIMIT 1")
    .get(h.id) as { text: string; answer: string; answered_by: string; answered_at: string } | undefined;
  const tb = teachbackState(db);
  const busy = busyUntil(db);
  return {
    ...base,
    next: next ? { key: next.key, title: next.title, time: next.time, minutes_until: next.minutes - now.minutes, status: next.status, checklist: next.checklist } : null,
    plan: plan.items.map((i) => ({ key: i.key, title: i.title, time: i.time, status: i.status })),
    night: Boolean(asleep) || Boolean(bedtime && (bedtime.status === 'done' || now.minutes >= bedtime.minutes + 15)),
    asleep_since: asleep ? (saidTime(asleep.text) ?? timeOf(asleep.at)) : null,
    last_log: log.length ? { time: timeOf(log.at(-1)!.at), text: log.at(-1)!.text } : null,
    questions_waiting: pendingQuestions(db).filter((q) => q.handoff_id === h.id).length,
    last_answer: answered
      ? { by: answered.answered_by, answer: answered.answer, question: answered.text, minutes_ago: Math.max(0, Math.round((nowDate().getTime() - Date.parse(answered.answered_at)) / 60000)) }
      : null,
    busy_until: busy ? formatTime(localTime(tz, busy).minutes) : null,
    teachback: tb ? { ...summary(tb), done: tb.done } : null,
    // A returning carer: what the parents changed since their last visit, for the first hour.
    changes: (() => {
      if (nowDate().getTime() - Date.parse(h.started_at) > 60 * 60_000) return [];
      const since = sinceLastVisit(db, h.carer_name, h.id);
      return since ? [...since.added.map((a) => a.text), ...since.removed.map((r) => `No longer: ${r.text}`)].slice(0, 3) : [];
    })(),
    // Lights out for the house (simulated smart home), once it has happened tonight.
    smart_home: (() => {
      try {
        const scene = JSON.parse(getSetting(db, 'smart_home') ?? 'null') as { at: string; actions: Array<{ device: string; state: string }> } | null;
        return scene && scene.at >= h.started_at ? scene.actions : null;
      } catch {
        return null;
      }
    })(),
    door: (() => {
      const ev = latestDoorEvent(db, 60 * 60_000);
      if (!ev) return null;
      const a = db.prepare("SELECT answered_by, answer FROM questions WHERE door_event_id = ? AND status = 'answered' ORDER BY id DESC LIMIT 1").get(ev.id) as
        | { answered_by: string; answer: string }
        | undefined;
      return { time: timeOf(ev.at), label: ev.label, decision: a ? `${a.answered_by}: "${a.answer}"` : null };
    })(),
  };
}

/** One sentence for voice: "Next is bath at 7:15 PM, in 12 minutes." */
export function homeSentence(s: HomeScreen) {
  if (s.mode === 'parent') return `No one is babysitting right now.`;
  if (s.asleep_since) return `All quiet. Asleep since ${s.asleep_since}.`;
  if (!s.next) return s.plan.length ? "Everything on tonight's plan is done." : `${s.carer} is looking after things.`;
  const m = s.next.minutes_until;
  const when = m > 1 ? `, in ${m} minutes` : m >= -5 ? ', now' : `, ${-m} minutes ago`;
  return `Next is ${inSentence(s.next.title, s.members.map((m) => m.name))} at ${s.next.time}${when}.`;
}
