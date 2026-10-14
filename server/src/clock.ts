// The house's clock. In demo mode it can be moved ("make it 7:40 pm") so a video can show the
// evening unfold without waiting; it always moves forward from the chosen time. Each demo house
// has its own (see context.ts).
import { currentHouse } from './context.js';

let defaultOffsetMs = 0;
const offset = () => currentHouse()?.clockOffsetMs ?? defaultOffsetMs;
const setOffset = (ms: number) => {
  const house = currentHouse();
  if (house) house.clockOffsetMs = ms;
  else defaultOffsetMs = ms;
};

export const now = () => new Date(Date.now() + offset());
export const nowIso = () => now().toISOString();

export interface LocalTime {
  /** "19:15" in the household's time zone. */
  hhmm: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** "Sat" */
  weekday: string;
  isWeekend: boolean;
  /** "2026-10-17" local date */
  date: string;
}

export function localTime(tz: string, at: Date = now()): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const h = Number(parts.hour) % 24;
  const m = Number(parts.minute);
  return {
    hhmm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    minutes: h * 60 + m,
    weekday: parts.weekday,
    isWeekend: parts.weekday === 'Sat' || parts.weekday === 'Sun',
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Moves the clock so it is `hhmm` in the household's time zone, today or on the next given
 * weekday ("Sat"). Demo use only.
 */
export function setDemoTime(hhmm: string, tz: string, weekday?: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error('Use HH:MM, for example 19:40');
  const target = Number(m[1]) * 60 + Number(m[2]);
  if (target >= 24 * 60) throw new Error('Use a time between 00:00 and 23:59');
  const day = weekday ? WEEKDAYS.findIndex((d) => d.toLowerCase() === weekday.slice(0, 3).toLowerCase()) : -1;
  if (weekday && day < 0) throw new Error('Use a weekday such as Sat');
  const current = localTime(tz, new Date());
  const days = day < 0 ? 0 : (day - WEEKDAYS.indexOf(current.weekday) + 7) % 7;
  setOffset((days * 24 * 60 + target - current.minutes) * 60_000);
  return localTime(tz);
}

export function resetClock() {
  setOffset(0);
}

export const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
