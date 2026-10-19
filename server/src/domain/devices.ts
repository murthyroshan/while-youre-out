// The whole house, not one screen. The kitchen Echo Show is where the sitter talks, but the evening
// happens across the home: the Fire TV in the living room, the Echo Dot in the child's room, the
// front door (Ring), and the parent's Bee. Each one reacts to the parents' own rules and to what
// actually happens tonight, never to a script:
//  - the TV starts its "one hour of TV at most" when the sitter says the kids are watching, and
//    pauses at the limit, or when bath or bed comes, with a message from the parent;
//  - at lights out the night light comes on in the child's room and the parent's goodnight
//    message plays there (white noise if there isn't one); the TV goes off; the door is locked;
//  - in an emergency the porch light comes on for the paramedics, and a parent can unlock the
//    door from their phone; the sitter is told;
//  - what a parent tells their Bee ("she napped until 4:30") moves tonight's plan.
// Simulated devices: in production these are the family's own Alexa smart home, Fire TV and Ring.
import type { DB } from '../db.js';
import { nowIso } from '../db.js';
import { now } from '../clock.js';
import { getSetting, setSetting } from './shadow.js';
import { events, visibleFacts } from './house.js';

export interface Devices {
  dot: { room: string; night_light: boolean; playing: string | null; at: string | null };
  tv: { status: 'off' | 'playing' | 'paused'; title: string | null; started_at: string | null; limit_minutes: number | null; banner: string | null; at: string | null };
  door: { locked: boolean; porch_light: boolean; by: string | null; at: string | null };
  bee: { by: string | null; note: string | null; at: string | null };
}

const childRoom = (db: DB) => {
  const kids = (db.prepare("SELECT name FROM members WHERE kind = 'child' ORDER BY id").all() as Array<{ name: string }>).map((k) => k.name);
  return kids.length === 1 ? `${kids[0]}'s room` : 'The kids’ room';
};

export function devices(db: DB): Devices {
  const saved = JSON.parse(getSetting(db, 'devices') ?? 'null') as Partial<Devices> | null;
  return {
    dot: { room: childRoom(db), night_light: false, playing: null, at: null, ...saved?.dot },
    tv: { status: 'off', title: null, started_at: null, limit_minutes: null, banner: null, at: null, ...saved?.tv },
    door: { locked: true, porch_light: false, by: null, at: null, ...saved?.door },
    bee: { by: null, note: null, at: null, ...saved?.bee },
  };
}
function save(db: DB, d: Devices) {
  setSetting(db, 'devices', JSON.stringify(d));
  events.emit('devices', d);
}

// ---------- what the sitter hears next ----------
/** News from around the house, told at the start of the sitter's next reply (Alexa can't speak first). */
export function pushNotice(db: DB, text: string) {
  const q = JSON.parse(getSetting(db, 'notices') ?? '[]') as string[];
  q.push(text);
  setSetting(db, 'notices', JSON.stringify(q.slice(-5)));
}
export function takeDeviceNotices(db: DB): string[] {
  return [...takeUrgentNotices(db), ...drain(db, 'notices')];
}
/** News that can't wait for an ordinary reply (the door unlocked for the paramedics): the emergency guide says it next. */
export function pushUrgent(db: DB, text: string) {
  const q = JSON.parse(getSetting(db, 'urgent_notices') ?? '[]') as string[];
  q.push(text);
  setSetting(db, 'urgent_notices', JSON.stringify(q.slice(-5)));
}
export const takeUrgentNotices = (db: DB) => drain(db, 'urgent_notices');
function drain(db: DB, key: string): string[] {
  const q = JSON.parse(getSetting(db, key) ?? '[]') as string[];
  if (q.length) setSetting(db, key, '[]');
  return q;
}

// ---------- the living room TV ----------
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, half: 0.5 };
/** The parents' screen-time limit in minutes ("One hour of TV at most", "30 minutes of screens"), and who said it. */
export function screenLimit(db: DB): { minutes: number; said_by: string } | null {
  for (const f of visibleFacts(db, 'carer').filter((x) => x.category === 'screen')) {
    const m = /\b(\d+|an?|one|two|half an?)\s*(hours?|hrs?|minutes?|mins?)\b(?:\s+of)?\s*(?:tv|telly|screen|screens|cartoons?|shows?|watching)?/i.exec(f.text);
    if (!m) continue;
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase().split(' ')[0]] ?? 1;
    return { minutes: Math.round(/^h/i.test(m[2]) ? n * 60 : n), said_by: f.author };
  }
  return null;
}
export const WATCHING = /\b(watch|watching|watches|started)\b.*\b(tv|telly|cartoons?|shows?|episode|movie|film|fire ?tv)\b|\b(tv|telly|cartoons?)\b.*\b(on|watching)\b/i;

/** The sitter said the kids are watching: the TV's clock starts (the parents' limit, if they set one). */
export function tvStarted(db: DB) {
  const d = devices(db);
  if (d.tv.status === 'playing') return d;
  const limit = screenLimit(db);
  d.tv = { status: 'playing', title: 'Gentle cartoons', started_at: nowIso(), limit_minutes: limit?.minutes ?? null, banner: null, at: nowIso() };
  save(db, d);
  return d;
}

/** Pauses the TV with a message on screen, and tells the sitter. */
function pauseTv(db: DB, d: Devices, banner: string, say: string) {
  d.tv = { ...d.tv, status: 'paused', banner, at: nowIso() };
  save(db, d);
  pushNotice(db, say);
}

/**
 * Every minute, and on every reply: the TV's limit, and the plan's next step (bath or bed) coming
 * due while the TV is on. `dueKeys` are the plan steps that are due now.
 */
export function houseTick(db: DB, dueKeys: string[], parentName: string) {
  const d = devices(db);
  if (d.tv.status !== 'playing' || !d.tv.started_at) return;
  const watched = (now().getTime() - Date.parse(d.tv.started_at)) / 60_000;
  const step = dueKeys.find((k) => k === 'bath' || k === 'bedtime');
  if (step) {
    const what = step === 'bath' ? 'Bath time' : 'Bedtime';
    return pauseTv(db, d, `${what} · from ${parentName}`, `I've paused the TV in the living room: ${what.toLowerCase()}.`);
  }
  if (d.tv.limit_minutes && watched >= d.tv.limit_minutes) {
    const limit = d.tv.limit_minutes >= 60 && d.tv.limit_minutes % 60 === 0 ? `${d.tv.limit_minutes / 60} hour${d.tv.limit_minutes > 60 ? 's' : ''}` : `${d.tv.limit_minutes} minutes`;
    return pauseTv(db, d, `That's ${limit} of TV · from ${parentName}`, `I've paused the TV: that's ${limit}, the parents' limit for tonight.`);
  }
}

// ---------- lights out ----------
/** Lights out: the child's room gets ready, the goodnight message plays there, the TV goes off, the door is locked. */
export function lightsOut(db: DB, goodnightFrom: string | null) {
  const d = devices(db);
  d.dot = { ...d.dot, night_light: true, playing: goodnightFrom ? `${goodnightFrom}'s goodnight message` : 'White noise', at: nowIso() };
  const tvWasOn = d.tv.status !== 'off';
  if (tvWasOn) d.tv = { ...d.tv, status: 'off', banner: null, at: nowIso() };
  d.door = { ...d.door, locked: true, at: nowIso() };
  save(db, d);
  const room = d.dot.room;
  const actions = [
    { device: room, state: goodnightFrom ? `night light on · ${goodnightFrom}'s message playing` : 'night light on · white noise' },
    ...(tvWasOn ? [{ device: 'Living room TV', state: 'off' }] : []),
    { device: 'Front door', state: 'locked' },
  ];
  // The Tonight screen shows what the house did at lights out.
  setSetting(db, 'smart_home', JSON.stringify({ at: nowIso(), actions }));
  // "Maya's room" keeps its capital; "The kids' room" reads "the kids' room" mid-sentence.
  const inSentence = room.replace(/^The /, 'the ');
  return { actions, say: `I've put on the night light in ${inSentence}${tvWasOn ? ', turned off the TV' : ''} and checked the front door is locked.` };
}

// ---------- the front door ----------
/** An emergency: the porch light comes on so the paramedics find the house. */
export function porchLightOn(db: DB) {
  const d = devices(db);
  if (d.door.porch_light) return;
  d.door = { ...d.door, porch_light: true, at: nowIso() };
  save(db, d);
}
/** A parent unlocks the front door from their phone (for the paramedics); the sitter is told. */
export function unlockDoor(db: DB, by: string) {
  const d = devices(db);
  d.door = { ...d.door, locked: false, by, at: nowIso() };
  save(db, d);
  pushUrgent(db, `${by} unlocked the front door for the paramedics.`);
  return d;
}
export function lockDoor(db: DB, by: string) {
  const d = devices(db);
  d.door = { ...d.door, locked: true, by, at: nowIso() };
  save(db, d);
  return d;
}

// ---------- the parent's Bee ----------
/** What a parent told their Bee, for tonight. The plan reads it ("napped until 4:30"). */
export function beeNote(db: DB, by: string, note: string) {
  const d = devices(db);
  d.bee = { by, note, at: nowIso() };
  save(db, d);
  return d;
}
