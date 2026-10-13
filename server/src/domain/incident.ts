// Emergency Copilot: once an emergency starts, the device walks the carer through the fixed script
// one step at a time ("done", "next"), runs the plan's timers (the second EpiPen after 5 minutes),
// and keeps the parents' phones in step with what is happening. A parent can say they're on
// their way, and the carer sees it. All of it is fixed logic over the family's own plan.
import { type DB, nowIso } from '../db.js';
import { formatTime, localTime, now } from '../clock.js';
import { activeHandoff, events, householdTz } from './house.js';

export interface IncidentStep {
  text: string;
  timer_seconds: number | null;
}

interface Timer {
  step_index: number;
  label: string;
  seconds: number;
  ends_at: string;
  warned: boolean;
  ended: boolean;
}

interface IncidentRow {
  id: number;
  handoff_id: number | null;
  started_at: string;
  kind: string;
  description: string;
  script: string;
  steps: string;
  current: number;
  timers: string;
  updates: string;
  on_the_way: string;
  status: 'active' | 'resolved';
  resolved_at: string | null;
}

export interface Incident {
  id: number;
  handoff_id: number | null;
  started_at: string;
  kind: string;
  description: string;
  /** The fixed script shown on screen (first line, address, plan, EpiPen, paramedic sheet). */
  script: Record<string, unknown>;
  steps: IncidentStep[];
  /** Index of the step being done now; equal to steps.length when all are done. */
  current: number;
  timers: Timer[];
  updates: Array<{ at: string; text: string; by: string }>;
  on_the_way: Array<{ name: string; minutes: number; at: string; announced?: boolean }>;
  status: 'active' | 'resolved';
  resolved_at: string | null;
}

/** An emergency stays "the" emergency for this long; a new one after that is a new incident. */
const ACTIVE_FOR_MS = 3 * 60 * 60_000;

const parse = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

function fromRow(r: IncidentRow): Incident {
  return {
    ...r,
    script: parse(r.script, {}),
    steps: parse(r.steps, []),
    timers: parse(r.timers, []),
    updates: parse(r.updates, []),
    on_the_way: parse(r.on_the_way, []),
  };
}

function save(db: DB, i: Incident, change: string) {
  db.prepare('UPDATE incidents SET current = ?, timers = ?, updates = ?, on_the_way = ?, status = ?, resolved_at = ? WHERE id = ?').run(
    i.current,
    JSON.stringify(i.timers),
    JSON.stringify(i.updates),
    JSON.stringify(i.on_the_way),
    i.status,
    i.resolved_at,
    i.id,
  );
  events.emit('incident', { incident: i, change });
}

export function activeIncident(db: DB): Incident | undefined {
  const since = new Date(now().getTime() - ACTIVE_FOR_MS).toISOString();
  const r = db.prepare("SELECT * FROM incidents WHERE status = 'active' AND started_at >= ? ORDER BY id DESC LIMIT 1").get(since) as unknown as IncidentRow | undefined;
  return r ? fromRow(r) : undefined;
}

export function latestIncident(db: DB): Incident | undefined {
  const r = db.prepare("SELECT * FROM incidents ORDER BY id DESC LIMIT 1").get() as unknown as IncidentRow | undefined;
  return r ? fromRow(r) : undefined;
}

/** Opens an incident, or adds to the one in progress ("and now she's vomiting"). */
export function openIncident(db: DB, input: { kind: string; description: string; steps: IncidentStep[]; script: Record<string, unknown> }): Incident {
  const open = activeIncident(db);
  const by = activeHandoff(db)?.carer_name ?? 'The sitter';
  if (open) {
    open.updates.push({ at: nowIso(), text: `Also reported: "${input.description}"`, by });
    save(db, open, 'reported');
    return open;
  }
  const info = db
    .prepare(
      "INSERT INTO incidents (handoff_id, started_at, kind, description, script, steps, current, timers, updates, on_the_way, status) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', ?, '[]', 'active')",
    )
    .run(
      activeHandoff(db)?.id ?? null,
      nowIso(),
      input.kind,
      input.description,
      JSON.stringify(input.script),
      JSON.stringify(input.steps),
      JSON.stringify([{ at: nowIso(), text: `Reported: "${input.description}"`, by }]),
    );
  return activeIncident(db) ?? fromRow(db.prepare("SELECT * FROM incidents WHERE id = ?").get(Number(info.lastInsertRowid)) as unknown as IncidentRow);
}

const short = (text: string) => (/second epipen/i.test(text) ? 'Second EpiPen' : /\bepipen\b/i.test(text) ? 'EpiPen' : 'Timer');

export type StepAction = 'done' | 'next' | 'back' | 'resolved';

/** Moves the guide on. Finishing the first step starts the plan's timers (e.g. the 5 minutes before a second EpiPen). */
export function stepIncident(db: DB, action: StepAction, by?: string): Incident | undefined {
  const i = activeIncident(db);
  if (!i) return undefined;
  const who = by ?? activeHandoff(db)?.carer_name ?? 'The sitter';
  if (action === 'resolved') {
    i.status = 'resolved';
    i.resolved_at = nowIso();
    i.updates.push({ at: nowIso(), text: 'Said the emergency is over', by: who });
    save(db, i, 'resolved');
    return i;
  }
  if (action === 'back') {
    i.current = Math.max(0, i.current - 1);
    save(db, i, 'back');
    return i;
  }
  if (i.current >= i.steps.length) return i;
  const step = i.steps[i.current];
  i.updates.push({ at: nowIso(), text: `Done: ${step.text}`, by: who });
  if (i.current === 0) {
    i.steps.forEach((s, idx) => {
      if (s.timer_seconds && !i.timers.some((t) => t.step_index === idx)) {
        i.timers.push({ step_index: idx, label: short(s.text), seconds: s.timer_seconds, ends_at: new Date(now().getTime() + s.timer_seconds * 1000).toISOString(), warned: false, ended: false });
      }
    });
  }
  i.current += 1;
  save(db, i, 'step');
  return i;
}

/** A parent says they're coming home ("I'm on my way, 15 minutes"). */
export function markOnTheWay(db: DB, name: string, minutes: number): Incident | undefined {
  const i = activeIncident(db);
  if (!i) return undefined;
  const m = Math.max(1, Math.min(240, Math.round(minutes)));
  i.on_the_way = [...i.on_the_way.filter((o) => o.name !== name), { name, minutes: m, at: nowIso() }];
  i.updates.push({ at: nowIso(), text: `On the way home, about ${m} minutes`, by: name });
  save(db, i, 'on_the_way');
  return i;
}

/** What the screen and the parent page show: steps with their state, live timers, who's coming. */
export function incidentView(db: DB, i: Incident) {
  const tz = householdTz(db);
  const t = now().getTime();
  return {
    id: i.id,
    kind: i.kind,
    status: i.status,
    started_at: i.started_at,
    started: formatTime(localTime(tz, new Date(i.started_at)).minutes),
    elapsed_seconds: Math.max(0, Math.round((t - Date.parse(i.started_at)) / 1000)),
    current: i.current,
    total: i.steps.length,
    steps: i.steps.map((s, idx) => ({ ...s, state: idx < i.current ? 'done' : idx === i.current ? 'now' : 'todo' })),
    timers: i.timers.map((tm) => ({
      label: tm.label,
      step_text: i.steps[tm.step_index]?.text ?? '',
      ends_at: tm.ends_at,
      remaining_seconds: Math.max(0, Math.round((Date.parse(tm.ends_at) - t) / 1000)),
    })),
    updates: i.updates.map((u) => ({ ...u, time: formatTime(localTime(tz, new Date(u.at)).minutes) })),
    on_the_way: i.on_the_way.map((o) => ({ ...o, eta: formatTime((localTime(tz, new Date(o.at)).minutes + o.minutes) % 1440) })),
  };
}

/** Things the device should say now (once each): one minute left, time's up. */
export function takeIncidentAnnouncements(db: DB): string[] {
  const i = activeIncident(db);
  if (!i) return [];
  const t = now().getTime();
  const out: string[] = [];
  let timerSaid = false;
  for (const tm of i.timers) {
    const left = Date.parse(tm.ends_at) - t;
    if (!tm.ended && left <= 0) {
      tm.ended = tm.warned = timerSaid = true;
      out.push(`It's been ${Math.round(tm.seconds / 60)} minutes. ${i.steps[tm.step_index]?.text ?? ''}`.trim());
    } else if (!tm.warned && left <= 60_000) {
      tm.warned = timerSaid = true;
      out.push(`One minute left on the ${tm.label.toLowerCase()} timer.`);
    }
  }
  // The carer hears that help from home is coming.
  for (const o of i.on_the_way) {
    if (o.announced) continue;
    o.announced = true;
    out.push(`${o.name} is on the way home, about ${o.minutes} minutes.`);
  }
  if (out.length) save(db, i, timerSaid ? 'timer' : 'announced');
  return out;
}
