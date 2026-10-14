// Live Tonight Plan: tonight's timeline built from the parents' own routine, adjusted by their
// own rules as the evening unfolds ("if her nap ends after 4 pm, bedtime moves 30 minutes later").
// Everything here is deterministic: it works with no AI and never invents a step.
import type { DB, Fact, Handoff } from '../db.js';
import { formatTime, localTime, type LocalTime } from '../clock.js';
import { activeHandoff, events, visibleFacts } from './house.js';

export interface PlanItem {
  key: string;
  /** Minutes since midnight, after tonight's adjustments. */
  minutes: number;
  time: string;
  title: string;
  checklist: string[];
  said_by: string;
  source_text: string;
  bedtime_linked: boolean;
  status: 'done' | 'due' | 'upcoming' | 'late';
}

export interface PlanRule {
  kind: 'nap_end_after';
  after_minutes: number;
  shift: number;
  said_by: string;
  text: string;
}

const DAYS: Record<string, number[]> = {
  sunday: [0], sundays: [0], monday: [1], mondays: [1], tuesday: [2], tuesdays: [2], wednesday: [3], wednesdays: [3],
  thursday: [4], thursdays: [4], friday: [5], fridays: [5], saturday: [6], saturdays: [6],
  weekend: [0, 6], weekends: [0, 6], weekday: [1, 2, 3, 4, 5], weekdays: [1, 2, 3, 4, 5], 'school nights': [0, 1, 2, 3, 4],
};
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const BEDTIME_LINKED = /\b(bath|pyjamas?|pajamas?|teeth|stor(y|ies)|books?|lights out|bed ?time|bed)\b/i;
const KIND_OF = (title: string) =>
  /\b(lights out|bed ?time|bed)\b/i.test(title) ? 'bedtime' : /\bdinner|supper\b/i.test(title) ? 'dinner' : /\bbath\b/i.test(title) ? 'bath' : title.toLowerCase().replace(/[^a-z]+/g, '-').slice(0, 30);

/** Evening times: "7:15" means 7:15 pm unless it says am. */
function toMinutes(h: number, m: number, ap?: string) {
  let hour = h % 12;
  if (!ap || /p/i.test(ap)) hour += 12;
  if (ap && /a/i.test(ap) && h === 12) hour = 0;
  return hour * 60 + m;
}

const dayLimit = (text: string): number[] | null => {
  const m = /\bon (sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|weekends?|weekdays?|school nights)\b/i.exec(text);
  return m ? DAYS[m[1].toLowerCase()] ?? null : null;
};

const TIMED = /([^.,;:!?]*?)\s*(?:\bat\b|\bby\b|\bis\b)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s*(?:[.,;:!?]|$|on\b|then\b|and\b|\())/gi;
const NAMED = /\b(bed ?time|lights out|dinner|supper|bath)\b/i;

/** Pulls the timed steps out of one fact, e.g. "Bath at 7:15, pyjamas, ..., lights out at 8." */
export function timedSteps(f: Pick<Fact, 'text' | 'author'>): Array<{ minutes: number; title: string; checklist: string[]; days: number[] | null }> {
  const steps: Array<{ minutes: number; title: string; checklist: string[]; days: number[] | null }> = [];
  const days = dayLimit(f.text);
  const clauses = f.text.split(/,|;|\.(?!\d)|\bthen\b/i).map((c) => c.trim()).filter(Boolean);
  let pending: string[] = [];
  for (const clause of clauses) {
    TIMED.lastIndex = 0;
    const m = TIMED.exec(clause);
    const hasTimeWord = m && (/\b(at|by)\b/i.test(clause) || NAMED.test(clause) || m[4]);
    // "No sweets after 6 pm" is a restriction, not a step in the evening.
    const restriction = m && /\b(after|before|until|till|past|no later than|not after)\s*$/i.test(m[1] ?? '');
    if (m && hasTimeWord && !restriction && Number(m[2]) >= 1 && Number(m[2]) <= 12 && !/\b(minutes?|mins?|hours?|cups?|scoops?|books?|times)\b/i.test(clause.slice(m.index + m[0].length, m.index + m[0].length + 12))) {
      const title = (m[1] || clause.replace(m[0], '')).replace(/\b(at|by|is|on \w+)\s*$/i, '').trim() || clause;
      steps.push({ minutes: toMinutes(Number(m[2]), Number(m[3] ?? 0), m[4]), title: cap(title), checklist: pending, days });
      pending = [];
    } else {
      pending.push(cap(clause));
    }
  }
  // Untimed steps after the last time belong to that last step ("..., then a short walk").
  if (pending.length && steps.length) steps[steps.length - 1].checklist.push(...pending);
  return steps;
}

const RULE = /if (?:her|his|their|the|maya'?s) nap ends after (\d{1,2})(?::(\d{2}))?\s*(am|pm)?,?\s*(?:then )?(?:her |his |the )?bed ?time (?:moves|goes|is) (\d{1,3}) ?(?:minutes|mins) (later|earlier)/i;

export function planRules(facts: Fact[]): PlanRule[] {
  return facts.flatMap((f) => {
    const m = RULE.exec(f.text);
    if (!m) return [];
    const shift = Number(m[4]) * (/earlier/i.test(m[5]) ? -1 : 1);
    return [{ kind: 'nap_end_after' as const, after_minutes: toMinutes(Number(m[1]), Number(m[2] ?? 0), m[3]), shift, said_by: f.author, text: f.text }];
  });
}

const parse = (s: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

export function tonightPlan(db: DB, tz: string, h: Handoff | undefined = activeHandoff(db), at?: LocalTime): { items: PlanItem[]; now: LocalTime; shift: number; shift_reason: string | null } {
  const now = at ?? localTime(tz);
  const today = WEEKDAY_INDEX[now.weekday];
  const facts = visibleFacts(db, 'carer').filter((f) => ['routine', 'food', 'pet', 'medicine', 'screen'].includes(f.category) && !RULE.test(f.text));
  const byKind = new Map<string, PlanItem & { dayLimited: boolean }>();
  const done = new Set(parse(h?.plan_done));
  const shift = h?.plan_shift ?? 0;

  for (const f of facts) {
    for (const s of timedSteps(f)) {
      if (s.days && !s.days.includes(today)) continue; // e.g. "on Fridays" on a Tuesday
      const kind = KIND_OF(s.title);
      const existing = byKind.get(kind);
      // A rule for tonight's day ("8:30 on Fridays") beats an everyday one ("lights out at 8").
      if (existing && (existing.dayLimited || !s.days)) continue;
      const linked = BEDTIME_LINKED.test(s.title);
      const minutes = s.minutes + (linked ? shift : 0);
      byKind.set(kind, {
        key: kind,
        minutes,
        time: formatTime(minutes),
        title: s.title,
        checklist: s.checklist,
        said_by: f.author,
        source_text: f.text,
        bedtime_linked: linked,
        status: 'upcoming',
        dayLimited: Boolean(s.days),
      });
    }
  }
  const items = [...byKind.values()]
    .sort((a, b) => a.minutes - b.minutes)
    .map(({ dayLimited: _d, ...item }) => {
      const status: PlanItem['status'] = done.has(item.key) ? 'done' : now.minutes >= item.minutes + 30 ? 'late' : now.minutes >= item.minutes - 5 ? 'due' : 'upcoming';
      return { ...item, status };
    });
  return { items, now, shift, shift_reason: h?.plan_shift_reason ?? null };
}

/** A step's title inside a sentence: "next is bath", but "next is Bruno gets one cup" (a name stays). */
export function inSentence(title: string, names: string[]): string {
  const first = title.split(/\s/)[0] ?? '';
  return names.some((n) => n.toLowerCase() === first.toLowerCase()) ? title : title.charAt(0).toLowerCase() + title.slice(1);
}

/**
 * What's next: the first step that is due or still to come. A step more than half an hour past
 * that nobody logged stays on the timeline as late, but the evening moves on without it.
 */
export const nextItem = (items: PlanItem[]) => items.find((i) => i.status === 'due' || i.status === 'upcoming') ?? null;

// A reminder is only said while it's fresh: "It's 7:45: bath" at 8:10 would be wrong.
const ANNOUNCE_WITHIN_MINUTES = 10;

/** Items that just became due and haven't been announced yet; marks them announced. */
export function takeDueAnnouncements(db: DB, tz: string): PlanItem[] {
  const h = activeHandoff(db);
  if (!h) return [];
  const { items, now } = tonightPlan(db, tz, h);
  const announced = new Set(parse(h.plan_announced));
  const due = items.filter((i) => i.status === 'due' && !announced.has(`${i.key}@${i.minutes}`));
  if (due.length) {
    for (const i of due) announced.add(`${i.key}@${i.minutes}`);
    db.prepare('UPDATE handoffs SET plan_announced = ? WHERE id = ?').run(JSON.stringify([...announced]), h.id);
  }
  // Stale ones (the clock jumped, or the device was off) are marked but not said.
  return due.filter((i) => now.minutes - i.minutes <= ANNOUNCE_WITHIN_MINUTES);
}

// ---------- reacting to the evening log ----------

const NAP_END =
  /\bnap(?:ped)?\b[^.]*?\b(?:until|till|til|to|ended at|ends at|ending at|done at|over at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|\bwoke (?:up )?from (?:her|his|their|the|a) nap at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?|\b(?:up|awake) from (?:her|his|their|the) nap at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
const DONE_WORDS: Array<[RegExp, string]> = [
  [/\b(ate|had|finished|done with) (her |his |their )?(dinner|supper)\b|\bdinner (is )?done\b/i, 'dinner'],
  [/\b(had|took|done with|finished) (a |her |his |their )?bath\b|\bbath (is )?done\b|\bout of the bath\b/i, 'bath'],
  [/\b(asleep|fell asleep|lights out|in bed|went to bed|sleeping)\b/i, 'bedtime'],
];

export interface PlanChange {
  message: string;
  new_bedtime?: string;
}

/** Applies the log to tonight's plan: ticks items off and applies the parents' timing rules. */
export function applyLogToPlan(db: DB, tz: string, text: string): PlanChange | null {
  const h = activeHandoff(db);
  if (!h) return null;
  const done = new Set(parse(h.plan_done));
  let changed = false;
  for (const [re, key] of DONE_WORDS) {
    if (re.test(text) && !done.has(key)) {
      done.add(key);
      changed = true;
    }
  }
  if (changed) db.prepare('UPDATE handoffs SET plan_done = ? WHERE id = ?').run(JSON.stringify([...done]), h.id);

  const m = NAP_END.exec(text);
  if (!m || h.plan_shift !== 0) return null;
  const hh = Number(m[1] ?? m[4] ?? m[7]);
  const mm = Number(m[2] ?? m[5] ?? m[8] ?? 0);
  const ap = m[3] ?? m[6] ?? m[9];
  if (!(hh >= 1 && hh <= 12)) return null;
  // Naps end in the afternoon: "napped till 5" means 5 pm.
  const napEnd = toMinutes(hh, mm, ap);
  const rule = planRules(visibleFacts(db, 'carer')).find((r) => napEnd > r.after_minutes);
  if (!rule) return null;
  const reason = `${rule.said_by}'s rule: "${rule.text}"`;
  db.prepare('UPDATE handoffs SET plan_shift = ?, plan_shift_reason = ? WHERE id = ?').run(rule.shift, reason, h.id);
  const bed = tonightPlan(db, tz).items.find((i) => i.key === 'bedtime');
  const change = {
    message: bed ? `${reason} So bedtime is now ${bed.time}.` : `${reason} So bedtime moves ${Math.abs(rule.shift)} minutes ${rule.shift > 0 ? 'later' : 'earlier'}.`,
    new_bedtime: bed?.time,
  };
  events.emit('plan_changed', change);
  return change;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
