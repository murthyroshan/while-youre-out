// Paying the sitter: hours from the handoff times the rate the parent gave, plus a tip. The parent
// approves on their phone (MCP URL-mode elicitation: the payment never happens on the shared
// screen). In this demo no money moves; in production this is where Amazon Pay would sit.
import { randomBytes } from 'node:crypto';
import { type DB, nowIso } from '../db.js';
import { now } from '../clock.js';
import { events } from './house.js';
import type { Handoff } from '../db.js';

export interface Payment {
  id: number;
  handoff_id: number;
  carer: string;
  minutes: number;
  rate_cents: number;
  amount_cents: number;
  tip_cents: number;
  status: 'pending' | 'paid' | 'declined';
  token: string;
  elicitation_id: string;
  created_at: string;
  paid_at: string | null;
}

export class PaymentError extends Error {}

export const DEFAULT_RATE_CENTS = 1600;

/** Billable time: started to ended, rounded up to the quarter hour, at least an hour. */
export function billableMinutes(h: Pick<Handoff, 'started_at' | 'ended_at'>): number {
  const end = h.ended_at ? Date.parse(h.ended_at) : now().getTime();
  const raw = Math.max(0, (end - Date.parse(h.started_at)) / 60_000);
  // Two minutes of grace, so 6:00 to 10:30 is 4 h 30, not 4 h 45 because of a few seconds.
  return Math.max(60, Math.ceil(Math.max(0, raw - 2) / 15) * 15);
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
export const duration = (minutes: number) => `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;

/** The evening to pay for: tonight's handoff (ended, or still going), never an old one. */
export function payableHandoff(db: DB): (Handoff & { rate_cents: number | null }) | undefined {
  const h = db.prepare('SELECT * FROM handoffs ORDER BY id DESC LIMIT 1').get() as (Handoff & { rate_cents: number | null }) | undefined;
  if (!h) return undefined;
  const ended = h.ended_at ? Date.parse(h.ended_at) : now().getTime();
  return now().getTime() - ended <= 24 * 60 * 60_000 ? h : undefined;
}

export function createPayment(db: DB, h: Handoff & { rate_cents: number | null }): Payment {
  const existing = db.prepare("SELECT * FROM payments WHERE handoff_id = ? AND status IN ('pending','paid') ORDER BY id DESC LIMIT 1").get(h.id) as Payment | undefined;
  if (existing?.status === 'paid') throw new PaymentError(`${h.carer_name} has already been paid ${dollars(existing.amount_cents + existing.tip_cents)} for that evening.`);
  if (existing) return existing;
  const minutes = billableMinutes(h);
  const rate = h.rate_cents ?? DEFAULT_RATE_CENTS;
  const amount = Math.round((minutes / 60) * rate);
  const info = db
    .prepare("INSERT INTO payments (handoff_id, carer, minutes, rate_cents, amount_cents, tip_cents, status, token, elicitation_id, created_at) VALUES (?, ?, ?, ?, ?, 0, 'pending', ?, ?, ?)")
    .run(h.id, h.carer_name, minutes, rate, amount, randomBytes(16).toString('hex'), `pay-${randomBytes(8).toString('hex')}`, nowIso());
  return getPayment(db, Number(info.lastInsertRowid))!;
}

export function getPayment(db: DB, id: number): Payment | undefined {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment | undefined;
}

export function paymentByToken(db: DB, token: unknown): Payment | undefined {
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) return undefined;
  return db.prepare('SELECT * FROM payments WHERE token = ?').get(token) as Payment | undefined;
}

/** The parent approved on their phone. */
export function approvePayment(db: DB, p: Payment, tipCents: number): Payment {
  if (p.status !== 'pending') throw new PaymentError(p.status === 'paid' ? 'Already paid.' : 'This payment was cancelled.');
  const tip = Math.max(0, Math.min(10_000, Math.round(tipCents)));
  db.prepare("UPDATE payments SET status = 'paid', tip_cents = ?, paid_at = ? WHERE id = ?").run(tip, nowIso(), p.id);
  const paid = getPayment(db, p.id)!;
  events.emit('payment_paid', paid);
  return paid;
}

export function declinePayment(db: DB, p: Payment) {
  if (p.status === 'pending') db.prepare("UPDATE payments SET status = 'declined' WHERE id = ?").run(p.id);
  events.emit('payment_declined', getPayment(db, p.id));
}
