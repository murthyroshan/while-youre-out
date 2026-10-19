// Ordering dinner, the agentic way: across a delivery partner, the parent's approval and the front
// door. The sitter asks; the add-on offers only what is safe for this family (no allergen, nothing
// labelled "may contain", no sweets after the parents' cut-off); the sitter can't spend money, so
// the order waits for a parent's OK on their phone; once approved the delivery joins tonight's
// expected visitors, so the doorbell knows it's dinner. A demo: a sample restaurant, no money moves.
// In production this is an Alexa+ food-delivery partner and Amazon Pay.
import { randomBytes } from 'node:crypto';
import { type DB, nowIso } from '../db.js';
import { formatTime, localTime, now } from '../clock.js';
import { allergenMentions, activeHandoff, events, householdTz, visibleFacts } from './house.js';
import { addVisitor } from './door.js';
import { dollars } from './payments.js';
import { pushNotice } from './devices.js';

export const RESTAURANT = 'Corner Kitchen (sample restaurant)';
export const STORE = 'Household delivery (sample store)';
/** What households run out of, at sample prices (anything else is ordered at an estimate). */
const SUPPLIES: Array<[RegExp, string, number]> = [
  [/diaper|nappy|nappies/, 'Diapers', 2499],
  [/wipe/, 'Baby wipes', 849],
  [/formula/, 'Baby formula', 3299],
  [/milk/, 'Milk', 429],
  [/bread/, 'Bread', 399],
  [/egg/, 'Eggs', 499],
  [/banana/, 'Bananas', 199],
  [/juice/, 'Juice', 449],
  [/toilet paper|loo roll/, 'Toilet paper', 1199],
  [/dog food|kibble/, 'Dog food', 2899],
];
/** A dish's name inside a sentence: "the mac and cheese". */
export const inSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

export interface MenuItem {
  id: string;
  name: string;
  price_cents: number;
  /** What's in it, as the restaurant lists it (allergens are read from this). */
  contains: string;
  kids: boolean;
  sweet?: boolean;
}

// A sample menu, written the way restaurants list allergens.
export const MENU: MenuItem[] = [
  { id: 'margherita', name: 'Margherita pizza', price_cents: 1400, contains: 'wheat, milk', kids: true },
  { id: 'mac', name: 'Mac and cheese', price_cents: 1100, contains: 'wheat, milk', kids: true },
  { id: 'grilled', name: 'Grilled chicken and rice', price_cents: 1500, contains: '', kids: true },
  { id: 'dal', name: 'Dal and rice', price_cents: 1000, contains: '', kids: false },
  { id: 'satay', name: 'Chicken satay skewers', price_cents: 1200, contains: 'peanut sauce', kids: true },
  { id: 'padthai', name: 'Pad thai', price_cents: 1500, contains: 'peanuts, egg, may contain nuts', kids: false },
  { id: 'noodles', name: 'Sesame noodles', price_cents: 1300, contains: 'wheat, sesame, may contain nuts', kids: true },
  { id: 'brownie', name: 'Chocolate brownie', price_cents: 600, contains: 'wheat, egg, milk, may contain nuts', kids: true, sweet: true },
  { id: 'cookie', name: 'Sugar cookie', price_cents: 400, contains: 'wheat, egg, milk', kids: true, sweet: true },
];

/** The parents' sweets cut-off ("No sweets after 6 pm"), in minutes after midnight. */
function sweetsCutoff(db: DB): number | null {
  for (const f of visibleFacts(db, 'carer')) {
    const m = /\bno (?:sweets|candy|dessert|desserts|sugar)\b.*?\bafter (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(f.text);
    if (!m) continue;
    let h = Number(m[1]) % 12;
    if ((m[3] ?? 'pm').toLowerCase() === 'pm') h += 12;
    return h * 60 + Number(m[2] ?? 0);
  }
  return null;
}

export interface MenuChoice {
  restaurant: string;
  options: Array<{ id: string; name: string; price: string; safe: string }>;
  left_out: Array<{ name: string; why: string }>;
}

/** What tonight's sitter may order: the family's allergies and the parents' rules decide. */
export function safeMenu(db: DB, craving = ''): MenuChoice {
  const cutoff = sweetsCutoff(db);
  const minutes = localTime(householdTz(db)).minutes;
  const left_out: MenuChoice['left_out'] = [];
  const ok: MenuItem[] = [];
  for (const item of MENU) {
    // What's in it, then what it "may contain": either keeps it off tonight's menu.
    const mayContain = /may contain[^,]*/i.exec(item.contains)?.[0] ?? '';
    const direct = allergenMentions(db, `${item.name}. ${item.contains.replace(mayContain, '')}`);
    const traces = mayContain ? allergenMentions(db, mayContain) : [];
    if (direct.length) left_out.push({ name: item.name, why: `contains ${direct.join(', ')}` });
    else if (traces.length) left_out.push({ name: item.name, why: mayContain });
    else if (item.sweet && cutoff !== null && minutes >= cutoff) left_out.push({ name: item.name, why: `no sweets after ${formatTime(cutoff)}` });
    else ok.push(item);
  }
  const want = craving.toLowerCase();
  const score = (i: MenuItem) => (want && want.split(/\W+/).some((w) => w.length > 2 && i.name.toLowerCase().includes(w)) ? 10 : 0) + (i.kids ? 2 : 0) + (i.sweet ? -5 : 0);
  const picks = [...ok].sort((a, b) => score(b) - score(a)).slice(0, 3);
  // What each dish was checked against, in the family's own terms: "Peanut-free".
  const allergyText = visibleFacts(db, 'carer').filter((f) => f.category === 'allergy').map((f) => f.text).join(' ');
  const known = allergyText ? allergenMentions(db, allergyText) : [];
  const safe = known.length ? known.map((a) => `${a.charAt(0).toUpperCase()}${a.slice(1)}-free`).join(' · ') : 'OK by the house rules';
  return {
    restaurant: RESTAURANT,
    options: picks.map((i) => ({ id: i.id, name: i.name, price: dollars(i.price_cents), safe })),
    left_out,
  };
}

// ---------- orders: the sitter asks, a parent approves ----------

export interface Order {
  id: number;
  handoff_id: number | null;
  item_id: string;
  item: string;
  price_cents: number;
  restaurant: string;
  status: 'pending' | 'approved' | 'declined';
  requested_by: string;
  approved_by: string | null;
  eta_from: number | null;
  eta_to: number | null;
  token: string;
  created_at: string;
  /** dinner (tonight, from the restaurant) or supplies (tomorrow morning, from the store). */
  kind?: 'dinner' | 'supplies';
}

export class OrderError extends Error {}

/** Finds the dish the sitter named ("the pizza", "Margherita pizza") on the safe menu only. */
export function findSafeItem(db: DB, said: string): MenuItem | undefined {
  const words = said.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !['the', 'and', 'please', 'order', 'get', 'some', 'with', 'one'].includes(w));
  const best = MENU.map((i) => ({ i, hits: words.filter((w) => i.name.toLowerCase().includes(w)).length })).filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits)[0];
  if (!best) return undefined;
  // Asked for by name or not, a dish that isn't safe tonight is never ordered.
  const out = safeMenu(db).left_out.find((l) => l.name === best.i.name);
  if (out) throw new OrderError(`${best.i.name} isn't safe tonight: ${out.why}.`);
  return best.i;
}

export function requestOrder(db: DB, item: MenuItem, requestedBy: string): Order {
  const h = activeHandoff(db);
  // One dinner waiting for approval at a time.
  const waiting = db.prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY id DESC LIMIT 1").get() as Order | undefined;
  if (waiting) db.prepare("UPDATE orders SET status = 'declined' WHERE id = ?").run(waiting.id);
  const info = db
    .prepare("INSERT INTO orders (handoff_id, item_id, item, price_cents, restaurant, status, requested_by, token, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)")
    .run(h?.id ?? null, item.id, item.name, item.price_cents, RESTAURANT, requestedBy, randomBytes(16).toString('hex'), nowIso());
  const o = getOrder(db, Number(info.lastInsertRowid))!;
  events.emit('order_requested', o);
  return o;
}

export const getOrder = (db: DB, id: number) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
export const latestOrder = (db: DB) => db.prepare("SELECT * FROM orders WHERE kind = 'dinner' ORDER BY id DESC LIMIT 1").get() as Order | undefined;
export const pendingOrder = (db: DB) => db.prepare("SELECT * FROM orders WHERE status = 'pending' AND kind = 'dinner' ORDER BY id DESC LIMIT 1").get() as Order | undefined;

/**
 * "We ran out of diapers": a parent taps "Order it" on their phone and it's ordered from the store
 * for tomorrow morning (not tonight, so it doesn't join tonight's expected visitors). A demo store.
 */
export function orderSupplies(db: DB, said: string, by: string): Order {
  const hit = SUPPLIES.find(([re]) => re.test(said.toLowerCase()));
  const name = hit?.[1] ?? `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
  const info = db
    .prepare("INSERT INTO orders (handoff_id, item_id, item, price_cents, restaurant, status, requested_by, approved_by, eta_from, eta_to, token, created_at, kind) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, 'supplies')")
    .run(activeHandoff(db)?.id ?? null, `supplies:${name.toLowerCase().replace(/[^a-z]+/g, '-')}`, name, hit?.[2] ?? 999, STORE, activeHandoff(db)?.carer_name ?? 'The sitter', by, 8 * 60, 10 * 60, randomBytes(16).toString('hex'), nowIso());
  const o = getOrder(db, Number(info.lastInsertRowid))!;
  events.emit('order_approved', o);
  return o;
}

/** A parent approves on their phone: the order is placed and the delivery is expected at the door. */
export function approveOrder(db: DB, o: Order, by: string): Order {
  if (o.status !== 'pending') throw new OrderError(o.status === 'approved' ? 'Already ordered.' : 'This order was cancelled.');
  const t = localTime(householdTz(db), now()).minutes;
  const from = t + 25;
  const to = t + 40;
  db.prepare("UPDATE orders SET status = 'approved', approved_by = ?, eta_from = ?, eta_to = ? WHERE id = ?").run(by, from, to, o.id);
  addVisitor(db, { name: `Dinner from ${o.restaurant.replace(/\s*\(.*\)$/, '')}`, kind: 'delivery', window: `${formatTime(from)} to ${formatTime(to)}`, note: `${o.item}, ordered by ${by}` }, by);
  const done = getOrder(db, o.id)!;
  pushNotice(db, `${by} ordered the ${inSentence(o.item)}. It arrives between ${formatTime(from)} and ${formatTime(to)}.`);
  events.emit('order_approved', done);
  return done;
}

export function declineOrder(db: DB, o: Order, by: string): Order {
  if (o.status === 'pending') db.prepare("UPDATE orders SET status = 'declined', approved_by = ? WHERE id = ?").run(by, o.id);
  const done = getOrder(db, o.id)!;
  pushNotice(db, `${by} said not tonight to the ${inSentence(o.item)}.`);
  events.emit('order_declined', done);
  return done;
}

/** What a host, the card and Alexa's own notification need: status, what, when, how much, a reference. */
export function orderView(o: Order) {
  return {
    id: o.id,
    reference: `${o.kind === 'supplies' ? 'HD' : 'CK'}-${String(o.id).padStart(4, '0')}`,
    kind: o.kind ?? 'dinner',
    status: o.status,
    item: o.item,
    price: dollars(o.price_cents),
    restaurant: o.restaurant,
    requested_by: o.requested_by,
    approved_by: o.approved_by,
    arrives: o.eta_from !== null && o.eta_to !== null ? `${o.kind === 'supplies' ? 'tomorrow, ' : ''}${formatTime(o.eta_from)} to ${formatTime(o.eta_to)}` : null,
  };
}
