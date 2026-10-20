// Real phone notifications for the parents (Web Push), so a question or an emergency reaches them
// even when the parent page is closed. Works on Android Chrome, desktop browsers, and iPhone once
// the page is added to the home screen.
import webpush from 'web-push';
import { SHOP_ANSWERS } from './shopping.js';
import { type DB, nowIso } from '../db.js';
import { activeHandoff, currentContactFor, events, parentNames } from './house.js';
import { busyUntil, getSetting, setSetting } from './shadow.js';
import type { Contact, Question } from '../db.js';
import { summary, type TeachbackState } from './teachback.js';
import { DOOR_ANSWERS, getDoorEvent } from './door.js';
import type { Incident } from './incident.js';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushMessage {
  title: string;
  body: string;
  /** Same tag replaces the earlier notification instead of stacking (e.g. one per question). */
  tag?: string;
  /** Emergencies and urgent questions stay on screen until tapped, and vibrate harder. */
  urgent?: boolean;
  /** An image shown in the notification (Android), e.g. the doorbell snapshot. */
  image?: string;
  /** The question this asks, so the phone can answer it straight from the notification. */
  question_id?: number;
  /** One-tap answers shown as notification buttons (Android Chrome, desktop). */
  actions?: Array<{ action: string; title: string; answer: string }>;
}

/** Sends one encrypted message. Tests pass a fake; the default is the web-push library. */
export type PushSender = (sub: PushSubscriptionJson, payload: string, options: webpush.RequestOptions) => Promise<{ statusCode: number }>;

const MAX_SUBSCRIPTIONS = 10; // a family's phones and browsers

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
  member: string | null;
}

/** VAPID keys from the environment, or generated once and kept in the database. */
function vapidKeys(db: DB) {
  if (process.env.WYO_VAPID_PUBLIC_KEY && process.env.WYO_VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.WYO_VAPID_PUBLIC_KEY, privateKey: process.env.WYO_VAPID_PRIVATE_KEY };
  }
  const saved = getSetting(db, 'vapid_keys');
  if (saved) return JSON.parse(saved) as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  setSetting(db, 'vapid_keys', JSON.stringify(keys));
  return keys;
}

// The server posts to whatever endpoint a subscription names, so only the browsers' own push
// services are accepted (Chrome/Android, Firefox, Safari/iPhone, Edge); example.com is reserved
// for documentation and tests (RFC 2606), so it can't point at anyone.
const PUSH_HOST = /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com|([a-z0-9-]+\.)*example\.com)$/;
const pushHost = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOST.test(u.hostname);
  } catch {
    return false;
  }
};

export function isValidSubscription(s: any): s is PushSubscriptionJson {
  return (
    s &&
    typeof s.endpoint === 'string' &&
    pushHost(s.endpoint) &&
    s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === 'string' &&
    typeof s.keys?.auth === 'string' &&
    s.keys.p256dh.length < 200 &&
    s.keys.auth.length < 100
  );
}

export function createPush(db: DB, opts: { sender?: PushSender; publicUrl: string; parentKey: string }) {
  const keys = vapidKeys(db);
  // Push services want a contact for the sender; an https URL or a mailto: address.
  const subject = process.env.WYO_VAPID_SUBJECT ?? (opts.publicUrl.startsWith('https://') ? opts.publicUrl : 'mailto:hello@while-youre-out.app');
  const sender: PushSender =
    opts.sender ?? ((sub, payload, options) => webpush.sendNotification(sub, payload, options) as Promise<{ statusCode: number }>);
  const pageUrl = `/parent?k=${encodeURIComponent(opts.parentKey)}`;

  const subscribe = (sub: PushSubscriptionJson, member: string | null) => {
    db.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, member, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, member = excluded.member`,
    ).run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, member, nowIso());
    // Keep the newest ones only.
    db.prepare(
      `DELETE FROM push_subscriptions WHERE endpoint NOT IN (SELECT endpoint FROM push_subscriptions ORDER BY created_at DESC LIMIT ${MAX_SUBSCRIPTIONS})`,
    ).run();
  };
  const unsubscribe = (endpoint: string) => void db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  const subscribers = () => db.prepare('SELECT endpoint, p256dh, auth, member FROM push_subscriptions').all() as unknown as Row[];

  /**
   * Sends to the phones of the named people. If none of them has turned notifications on, every
   * subscribed phone gets it: a missed question is worse than an extra buzz.
   */
  const notify = async (to: string[] | 'everyone', msg: PushMessage, opts: { endpoint?: string } = {}) => {
    const all = subscribers().filter((s) => !opts.endpoint || s.endpoint === opts.endpoint);
    const named = to === 'everyone' ? all : all.filter((s) => s.member && to.includes(s.member));
    const targets = named.length ? named : all;
    const results = await Promise.allSettled(
      targets.map(async (s) => {
        // Each phone answers as its owner ("Answering as Anita").
        const payload = JSON.stringify({ ...msg, url: pageUrl, by: s.member });
        try {
          await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: msg.urgent ? 3600 : 4 * 3600,
            urgency: msg.urgent ? 'high' : 'normal',
            topic: msg.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
          });
          return true;
        } catch (e: any) {
          // The phone unsubscribed or the browser was reset: forget it.
          if (e?.statusCode === 404 || e?.statusCode === 410) unsubscribe(s.endpoint);
          else console.warn('Push failed', e?.statusCode ?? e?.message ?? e);
          return false;
        }
      }),
    );
    return results.filter((r) => r.status === 'fulfilled' && r.value).length;
  };

  const carer = () => activeHandoff(db)?.carer_name ?? 'The sitter';
  const questionBody = (q: Question) => (q.text_english && q.text_english !== q.text ? `"${q.text}" (${q.text_english})` : `"${q.text}"`);

  // ---------- what buzzes the phone ----------
  /** The buttons a question gets on the lock screen. */
  const answersFor = (q: Question): PushMessage['actions'] =>
    q.shopping_item
      ? [
          { action: 'yes', title: 'Add to list', answer: SHOP_ANSWERS.yes },
          { action: 'no', title: 'Not now', answer: SHOP_ANSWERS.no },
        ]
      : q.door_event_id
      ? [
          { action: 'yes', title: 'Let them in', answer: DOOR_ANSWERS.yes },
          { action: 'no', title: "Don't open", answer: DOOR_ANSWERS.no },
        ]
      : q.text.startsWith('Urgent:')
        ? [{ action: 'call', title: 'Call me', answer: 'Please call me.' }]
        : [
            { action: 'yes', title: 'Approve', answer: "Yes, that's fine." },
            { action: 'no', title: 'Deny', answer: "No, please don't." },
          ];
  const questionMessage = (q: Question, title: string): PushMessage => {
    const door = getDoorEvent(db, q.door_event_id);
    return {
      title: door ? `${carer()}: someone's at the front door` : title,
      body: q.text.startsWith('Urgent:') ? q.text.replace(/^Urgent:\s*/, '') : questionBody(q),
      tag: `q${q.id}`,
      urgent: q.urgency === 'urgent',
      image: door?.snapshot_url ?? undefined,
      question_id: q.id,
      actions: answersFor(q),
    };
  };
  const onQuestion = (q: Question) => {
    if (q.urgency === 'urgent') return void notify('everyone', questionMessage(q, `Urgent: ${carer()} needs you`));
    // Busy mode: small questions wait quietly on the page.
    if (busyUntil(db)) return;
    const first = currentContactFor(db, q);
    void notify(first ? [first.name] : 'everyone', questionMessage(q, `${carer()} asks`));
  };
  const onEscalated = ({ question, contact }: { question: Question; contact: Contact }) => {
    if (busyUntil(db) && question.urgency !== 'urgent') return;
    void notify([contact.name], questionMessage(question, `${carer()} asks (no answer yet)`));
  };
  const onEmergency = (e: { description: string; carer: string | null }) => {
    void notify('everyone', {
      title: 'Emergency at home',
      body: `${e.carer ?? 'The sitter'} said: "${e.description}". Call them now.`,
      tag: 'emergency',
      urgent: true,
    });
  };
  const onTeachback = (s: TeachbackState) => {
    if (!s.done) return;
    const { right, total, skipped } = summary(s);
    const allRight = right === total;
    void notify(parentNames(db), {
      title: allRight ? 'Handover confirmed' : 'Handover checked',
      body: `${carer()} got ${right} of ${total} right${skipped ? ` (${skipped} skipped)` : ''}${allRight ? '.' : '; the right answers were shown on screen.'}`,
      tag: 'teachback',
    });
  };
  const onEnded = (h: { carer_name: string }) => {
    void notify(parentNames(db), { title: 'Your morning debrief is ready', body: `How the evening with ${h.carer_name} went.`, tag: 'debrief' });
  };
  // The emergency, as it unfolds: one notification that updates in place (same tag).
  const onIncident = ({ incident: i, change }: { incident: Incident; change: string }) => {
    const last = i.updates.at(-1);
    const who = last?.by ?? carer();
    const step = Math.min(i.current, i.steps.length);
    const timer = change === 'step' && i.current === 1 && i.timers.length ? ` ${Math.round(i.timers[0].seconds / 60)}-minute timer started.` : '';
    const msg: Record<string, PushMessage> = {
      step: { title: `Emergency · step ${step} of ${i.steps.length} done`, body: `${who}: ${last?.text ?? ''}${timer}`, tag: 'emergency', urgent: true },
      timer: { title: 'Emergency · timer', body: i.timers.some((t) => t.ended) ? `Time's up: ${i.steps[i.timers.find((t) => t.ended)!.step_index]?.text ?? ''}` : 'One minute left on the timer.', tag: 'emergency', urgent: true },
      reported: { title: 'Emergency · update', body: `${who}: ${last?.text ?? ''}`, tag: 'emergency', urgent: true },
      on_the_way: { title: `${who} is on the way home`, body: last?.text ?? '', tag: 'emergency-otw' },
      resolved: { title: 'Emergency over', body: `${who} says it's over.`, tag: 'emergency' },
    };
    if (msg[change]) void notify('everyone', msg[change]);
  };

  const onMessagePlayed = (m: { for_name: string | null; from_name: string; carer: string | null }) => {
    void notify(parentNames(db), { title: `${m.for_name ?? 'The kids'} heard your goodnight message 💛`, body: `Played on the Echo Show${m.carer ? ` with ${m.carer}` : ''}.`, tag: 'goodnight' });
  };

  const onPaid = (p: { carer: string; amount_cents: number; tip_cents: number }) => {
    void notify(parentNames(db), { title: `Paid ${p.carer} $${((p.amount_cents + p.tip_cents) / 100).toFixed((p.amount_cents + p.tip_cents) % 100 ? 2 : 0)} ✓`, body: 'Demo payment: no money moved.', tag: 'payment' });
  };

  // The Guest Pass reached its end time: extend it, or it closes in half an hour.
  const onPassReminder = (p: { carer: string }) => {
    void notify(parentNames(db), { title: `${p.carer}'s pass ends now`, body: 'Extend it from your phone, or it closes in 30 minutes.', tag: 'pass' });
  };

  // The sitter wants to order dinner: only a parent can say yes.
  const onOrderRequested = (o: { requested_by: string; item: string; price_cents: number; restaurant: string }) => {
    void notify(parentNames(db), { title: `${o.requested_by} wants to order dinner`, body: `${o.item}, $${(o.price_cents / 100).toFixed(o.price_cents % 100 ? 2 : 0)} from ${o.restaurant}. Allergy-checked. Approve it on your phone.`, tag: 'order', urgent: false });
  };

  // A parent told us no news for hours is its own worry: the moment the sitter notes the child is
  // asleep, the parents hear "all's well" (once; busy mode holds it, like small questions).
  const onLog = (ev: { kind: string; text: string }) => {
    if (ev.kind !== 'sleep' || !/\b(asleep|sleeping|in bed|went to bed|down for the night)\b/i.test(ev.text) || busyUntil(db)) return;
    void notify(parentNames(db), { title: "All's well at home", body: `${carer()}: ${ev.text}`, tag: 'asleep' });
  };

  const handlers: Array<[string, (...a: any[]) => void]> = [
    ['log', onLog],
    ['pass_reminder', onPassReminder],
    ['order_requested', onOrderRequested],
    ['incident', onIncident],
    ['payment_paid', onPaid],
    ['message_played', onMessagePlayed],
    ['question', onQuestion],
    ['question_escalated', onEscalated],
    ['emergency', onEmergency],
    ['teachback', onTeachback],
    ['handoff_ended', onEnded],
  ];
  for (const [name, fn] of handlers) events.on(name, fn);
  const close = () => {
    for (const [name, fn] of handlers) events.off(name, fn);
  };

  return { publicKey: keys.publicKey, subscribe, unsubscribe, subscribers, notify, close };
}
