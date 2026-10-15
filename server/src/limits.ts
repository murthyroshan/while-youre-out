// Limits shared by every house on this server. Each visitor gets their own demo house, but the
// Gemini quota, the memory and the network belong to everyone: one visitor (or one script) must
// not be able to use them up for the judges.

const windows = new Map<string, number[]>();

/** Sliding window: true (and counted) if `key` has had fewer than `max` uses in `windowMs`. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= max) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 10_000) sweep(now);
  return true;
}

/** All of them must allow it; only then is it counted against each. */
export function allowAll(rules: Array<[key: string, max: number, windowMs: number]>): boolean {
  const now = Date.now();
  const full = rules.some(([key, max, windowMs]) => (windows.get(key) ?? []).filter((t) => t > now - windowMs).length >= max);
  if (full) return false;
  for (const [key, max, windowMs] of rules) allow(key, max, windowMs);
  return true;
}

function sweep(now: number) {
  // Keys idle for a day hold nothing that any window still counts.
  for (const [key, times] of windows) if (!times.length || times[times.length - 1] < now - 86_400_000) windows.delete(key);
}

const MINUTE = 60_000;
const DAY = 86_400_000;
// This computer (development, tests): the per-visitor limits are for visitors from the internet.
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

/** The Gemini proxy and House Brain: the whole server, and each visitor, per minute and per day. */
export const aiAllowed = (ip: string, kind: 'chat' | 'import') =>
  LOOPBACK.test(ip)
    ? allow('ai:all', 60, MINUTE)
    : kind === 'chat'
    ? allowAll([
        ['ai:all', 60, MINUTE],
        [`ai:chat:${ip}`, 12, MINUTE],
        [`ai:chat-day:${ip}`, 200, DAY],
      ])
    : allowAll([
        ['ai:all', 60, MINUTE],
        [`ai:import:${ip}`, 3, MINUTE],
        [`ai:import-day:${ip}`, 30, DAY],
      ]);

/** New demo houses, per visitor (the server-wide cap is in houses.ts). */
export const newHouseAllowed = (ip: string) => LOOPBACK.test(ip) || allow(`house:${ip}`, 8, MINUTE);

/** Requests that make the server send something out (test notifications). */
export const pushTestAllowed = (ip: string) => allow(`push-test:${ip}`, 5, MINUTE);

/**
 * Big uploads (recordings, files for House Brain) one or two at a time, and none while memory is
 * already high: a busy demo says "try again" instead of running out of memory for everyone.
 */
let heavy = 0;
const HEAVY_AT_ONCE = 2;
const HIGH_MEMORY = Number(process.env.WYO_MEMORY_LIMIT_MB ?? 380) * 1_000_000;
export function startHeavy(): (() => void) | null {
  if (heavy >= HEAVY_AT_ONCE || process.memoryUsage().rss > HIGH_MEMORY) return null;
  heavy++;
  let done = false;
  return () => {
    if (!done) heavy--;
    done = true;
  };
}
