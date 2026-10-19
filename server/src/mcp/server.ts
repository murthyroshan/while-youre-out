import { ADDON_INSTRUCTIONS } from '../ai/hostPrompt.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import { InMemoryTaskMessageQueue } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import type { DB } from '../db.js';
import { OUTPUTS, STATUS } from './outputs.js';
import { FOOD_GUARD, FOOD_GUARD_SPOKEN, MEDICINE_GUARD, MEDICINE_GUARD_SPOKEN, SPOKEN_WORDS, firstSentence, fitSpoken, isEmergency, mentionsMedicine, wordCount } from '../domain/safety.js';
import { activeHandoff, allergenMentions, answerQuestion, familyNames, attachTask, briefing, contacts, createQuestion, currentContactFor, endHandoff, escalateQuestion, eveningLog, events, expireQuestion, getQuestion, HandoffInProgressError, householdTz, logEvent, parentNames, type Role, sharesWords, startHandoff, visibleFacts, whereIs } from '../domain/house.js';
import { startEmergency } from '../domain/emergency.js';
import { homeScreen, homeSentence } from '../domain/home.js';
import { doorCheck, getDoorEvent } from '../domain/door.js';
import { markPlayed, pickMessage, type MessageInfo } from '../domain/messages.js';
import { createPayment, dollars, duration, getPayment, payableHandoff, PaymentError, type Payment } from '../domain/payments.js';
import { activeIncident, incidentView, latestIncident, stepIncident, takeIncidentAnnouncements } from '../domain/incident.js';
import { importNote, ImportError } from '../domain/houseBrain.js';
import { applyLogToPlan, inSentence, nextItem, takeDueAnnouncements, tonightPlan } from '../domain/plan.js';
import { SHOP_ANSWERS, shoppingList, shoppingQuestion, suppliesMentioned } from '../domain/shopping.js';
import { bedtimeScene } from '../domain/smarthome.js';
import { teachback } from '../domain/teachback.js';
import { busyUntil, shadowSuggestion } from '../domain/shadow.js';
import { buildDebrief, sinceLastVisit } from '../domain/debrief.js';
import { englishOf, fixedTranslation, sentences, translateAll, languageCode, LANGUAGES, translateOne } from '../domain/translate.js';
import type { Handoff, Question } from '../db.js';
import { formatTime, localTime, now } from '../clock.js';
import { AiUnavailableError, type AiClient } from '../ai/gemini.js';
import QRCode from 'qrcode';
import { cardHtml, CARD_MIME, CARD_URI } from './card.js';

export interface ServerDeps {
  db: DB;
  taskStore: TaskStore;
  /** How long a contact has to answer before the next one is asked. */
  escalateAfterMs: number;
  /** Public origin of this server, used to turn photo paths into absolute URLs. */
  publicUrl: string;
  /** AI client used by House Brain to read notes. */
  ai: AiClient;
  /** How long a spoken note may take to read before the device answers anyway (default 8 s). */
  voiceWaitMs?: number;
  /** The public demo only: this house's parent page, so someone testing over MCP can be Mom too. */
  parentPage?: string | null;
}

const ui = { ui: { resourceUri: CARD_URI }, 'ui/resourceUri': CARD_URI };

function plain(view: string, data: Record<string, unknown>, text: string): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: { view, ...data } };
}

/**
 * Anyone in the room can talk to the device and voice can't prove who is speaking, so voice
 * always gets the carer's view. Parent-only facts are shown only on the authenticated parent page.
 */
const VOICE_ROLE: Role = 'carer';
const CAPABILITIES = /^(what (can|do) you do|what are you (for|able to do)|how (can|do) you help( me)?|what can you help (me )?with|what can i ask( you)?|help)\??!?$/i;
const INGESTED = /\b(ate|eaten|has eaten|had|has had|swallowed|drank|took a bite|bit into|tasted|licked|chewed)\b/i;
/** Upper bound for free-text inputs, so one call can't store megabytes. */
const MAX_TEXT = 1000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildServer({ db, taskStore, escalateAfterMs, publicUrl, ai, voiceWaitMs = 8_000, parentPage = null }: ServerDeps) {
  // The family's own names, for the safety rules ("Leo can't breathe" is an emergency for any family).
  const names = () => familyNames(db);
  // Alexa+ add-ons can't start speaking on their own. So anything the carer hasn't heard yet (a
  // reminder that came due, a parent's answer) is told at the start of the next reply, when they
  // talk. The simulator also announces these by itself; whatever it said is never said twice.
  const takeNotices = (): string[] => {
    const h = activeHandoff(db);
    if (!h) return [];
    const names = (db.prepare('SELECT name FROM members').all() as Array<{ name: string }>).map((m) => m.name);
    const out = takeDueAnnouncements(db, householdTz(db)).map((i) => `Reminder: ${inSentence(i.title, names)} at ${i.time}.`);
    const answered = db.prepare("SELECT * FROM questions WHERE handoff_id = ? AND status = 'answered' AND heard = 0 ORDER BY id").all(h.id) as unknown as Question[];
    for (const q of answered) {
      out.push(
        q.shopping_item
          ? q.answer === SHOP_ANSWERS.yes
            ? `${q.answered_by} added ${q.shopping_item} to the shopping list.`
            : `${q.answered_by} said not now to ${q.shopping_item}.`
          : `${q.answered_by} answered "${q.text.length > 60 ? `${q.text.slice(0, 57)}...` : q.text}": "${q.answer}"`,
      );
    }
    if (answered.length) db.prepare(`UPDATE questions SET heard = 1 WHERE id IN (${answered.map(() => '?').join(',')})`).run(...answered.map((q) => q.id));
    return out;
  };
  const withNotices = <A extends unknown[]>(fn: (...a: A) => Promise<CallToolResult>) =>
    async (...a: A): Promise<CallToolResult> => {
      const result = await fn(...a);
      // Never in front of an emergency, and not for the device's own reminder checks.
      const announcing = (a[0] as { announce?: boolean } | undefined)?.announce === true;
      if (result.isError || result.structuredContent?.emergency || announcing) return result;
      const notices = takeNotices();
      if (!notices.length) return result;
      const [first, ...rest] = result.content;
      const content = first?.type === 'text' ? [{ ...first, text: `${notices.join(' ')} ${first.text}`.trim() }, ...rest] : [{ type: 'text' as const, text: notices.join(' ') }, ...result.content];
      return { ...result, content, structuredContent: { ...(result.structuredContent ?? {}), notices } };
    };

  // Joined to the whole base URL, which on the demo includes the house (/h/<id>), not just the origin.
  const abs = (path: string | null) =>
    !path ? null : /^https?:\/\//.test(path) ? path : `${publicUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  const clockTime = (d: Date) => formatTime(localTime(householdTz(db), d).minutes);
  const carerLang = () => languageCode(activeHandoff(db)?.language);
  /** A result spoken in the carer's language; the parents' original words stay in the data and on screen. */
  const localized = async (view: string, data: Record<string, unknown>, text: string): Promise<CallToolResult> => {
    const lang = carerLang();
    if (lang === 'en' || !text) return plain(view, data, text);
    const parts = await translateAll(db, ai, sentences(text), lang);
    const spoken = parts.every((p): p is string => Boolean(p)) ? parts.join(' ') : null;
    return plain(view, { ...data, language: lang, spoken, english: text }, spoken ?? text);
  };

  /** The carer's words in English for the safety rules: the device's rendering, else ours. */
  const inEnglish = async (said: string, given: string | undefined) => given || (await englishOf(db, ai, said, carerLang()));

  /** Alerts the parents about a possible allergen exposure and returns what to tell the carer. */
  const allergyAlert = (what: string, allergens: string[]) => {
    const allergy = visibleFacts(db, 'carer').find((f) => f.category === 'allergy');
    const carer = activeHandoff(db)?.carer_name ?? 'The carer';
    const q = createQuestion(db, `Urgent: ${carer} said "${what}". Allergy on file: ${allergy?.text ?? allergens.join(', ')}`, null, 'urgent');
    const who = currentContactFor(db, q);
    return `${allergy ? `${allergy.author} said: "${allergy.text}"` : `Allergy on file: ${allergens.join(', ')}.`} Watch for swelling, hives, vomiting or trouble breathing. If you see any of them, say "emergency". I've alerted ${who?.name ?? 'the parents'}.`;
  };
  const server = new McpServer(
    {
      name: 'while-youre-out',
      title: "While You're Out",
      version: '0.1.0',
      description: "Alexa+ add-on for whoever looks after your kids and home while you're out.",
    },
    {
      capabilities: { tasks: { requests: { tools: { call: {} } } } },
      taskStore,
      taskMessageQueue: new InMemoryTaskMessageQueue(),
      instructions: ADDON_INSTRUCTIONS,
    },
  );

  // Every tool says what it returns (outputSchema) and what the device shows while it runs and once
  // it has answered (_meta.ui.invoking / invoked, on the definition and on each successful result).
  const registerTool = server.registerTool.bind(server) as (...args: any[]) => any;
  (server as any).registerTool = (name: string, config: Record<string, any>, handler: any) => {
    const status = STATUS[name];
    const meta = status ? { ...config._meta, ui: { ...config._meta?.ui, ...status } } : config._meta;
    const schema = OUTPUTS[name];
    const withStatus = (r: any) => {
      // A field of the wrong type must never turn a whole answer into an error for the person
      // asking: it is logged and left out, and the rest of the answer goes through.
      if (schema && r?.structuredContent && !r.isError) {
        const check = schema.safeParse(r.structuredContent);
        if (!check.success) {
          const bad = new Set(check.error.issues.map((i) => String(i.path[0])).filter((k) => k !== 'view'));
          console.error(`outputSchema: ${name} returned unexpected ${[...bad].join(', ')}`);
          r = { ...r, structuredContent: Object.fromEntries(Object.entries(r.structuredContent).filter(([k]) => !bad.has(k))) };
        }
      }
      return status && r && !r.isError ? { ...r, _meta: { ...r._meta, ui: { ...r._meta?.ui, ...status } } } : r;
    };
    const wrapped = typeof handler === 'function' ? async (...args: unknown[]) => withStatus(await handler(...args)) : handler;
    return registerTool(name, { ...config, ...(OUTPUTS[name] ? { outputSchema: OUTPUTS[name] } : {}), _meta: meta }, wrapped);
  };

  server.registerResource(
    'card',
    CARD_URI,
    { title: "While You're Out card", mimeType: CARD_MIME, description: 'Renders handoff cards on Echo Show-style screens.' },
    async () => ({
      contents: [
        {
          uri: CARD_URI,
          mimeType: CARD_MIME,
          text: cardHtml(),
          // Lets MCP Apps hosts load images from this server (doorbell snapshots, where things are).
          _meta: { ui: { csp: { resourceDomains: [new URL(publicUrl).origin] } } },
        },
      ],
    }),
  );

  server.registerResource(
    'house-manual',
    'house://manual',
    { title: 'House manual (carer view)', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(visibleFacts(db, 'carer'), null, 2) }],
    }),
  );

  server.registerTool(
    'start_handoff',
    {
      title: 'Start a handoff',
      annotations: { destructiveHint: false },
      description:
        'Call when a parent hands the home over to a carer ("Priya is babysitting tonight"). Switches the device into carer mode and returns tonight\'s briefing to read aloud.',
      inputSchema: {
        carer_name: z.string().trim().min(1).max(60).optional().describe("Name of the person taking over. Leave out if the parent didn't say; the device will ask."),
        language: z.string().max(20).default('en').describe('Language the carer prefers, as a BCP-47 code such as en, hi, es'),
        hourly_rate: z.number().min(0).max(500).optional().describe("The sitter's hourly rate in dollars, if the parent said it"),
        replace: z.boolean().default(false).describe('Set only after the parent confirms ending the handoff already in progress'),
      },
      _meta: ui,
    },
    async ({ carer_name: named, language: lang, hourly_rate, replace }) => {
      let carer_name = named;
      let language = lang;
      let rate = hourly_rate;
      // "We're heading out" without a name: ask on the screen (MCP form elicitation).
      if (!carer_name) {
        const asked = await askWhoIsSitting();
        if (!asked) return { content: [{ type: 'text', text: "Who's looking after the kids tonight? Say, for example, 'Priya is babysitting tonight'." }], isError: true };
        if (asked === 'declined') return plain('handoff_cancelled', {}, "Okay, I won't start sitter mode.");
        carer_name = asked.carer_name;
        language = asked.language ?? language;
        rate = asked.hourly_rate ?? rate;
      }
      let h;
      try {
        h = startHandoff(db, carer_name, language, { replace, rateCents: rate === undefined ? null : Math.round(rate * 100) });
      } catch (e) {
        if (e instanceof HandoffInProgressError) {
          return {
            content: [{ type: 'text', text: `${e.current.carer_name} is already looking after things. Should I end that handoff and start one for ${carer_name}?` }],
            structuredContent: { view: 'handoff_conflict', current: e.current.carer_name, requested: carer_name },
            isError: true,
          };
        }
        throw e;
      }
      const b = briefing(db);
      const plan = tonightPlan(db, householdTz(db), h);
      // A carer who has been here before sees what changed since their last visit (on the card).
      const since = sinceLastVisit(db, h.carer_name, h.id);
      // Spoken: only what could save a life. Tonight's plan, what changed and who to call are on screen.
      const text = fitSpoken([
        since ? `Welcome back, ${h.carer_name}.` : `Handoff started for ${h.carer_name}.`,
        b.must_know.length ? `Most important: ${b.must_know.slice(0, 2).map(firstSentence).join(' ')}` : '',
        b.epipen ? `The EpiPen: ${b.epipen}` : '',
        b.first_contact ? `${b.first_contact} is first to call.` : '',
      ].filter(Boolean)).join(' ');
      return localized('briefing', { carer: h.carer_name, language: h.language, ...b, plan: plan.items, since_last_visit: since, ...(parentPage ? { parent_page: parentPage } : {}) }, text);
    },
  );

  /** Asks the parent on the screen who is babysitting (form elicitation); null if the host can't ask. */
  const askWhoIsSitting = async (): Promise<{ carer_name: string; language?: string; hourly_rate?: number } | 'declined' | null> => {
    if (!server.server.getClientCapabilities()?.elicitation) return null;
    try {
      const r = await server.server.elicitInput({
        mode: 'form',
        message: "Who's looking after the kids tonight?",
        requestedSchema: {
          type: 'object',
          properties: {
            carer_name: { type: 'string', title: 'Name', description: 'Who is babysitting', minLength: 1, maxLength: 60 },
            language: {
              type: 'string',
              title: 'Language they speak',
              oneOf: Object.entries({ en: 'English', 'hi-IN': 'Hindi', 'es-US': 'Spanish', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'bn-IN': 'Bengali' }).map(([c, t]) => ({ const: c, title: t })),
              default: 'en',
            },
            hourly_rate: { type: 'number', title: 'Hourly rate ($)', description: 'So you can pay them in one tap later', minimum: 0, maximum: 500 },
          },
          required: ['carer_name'],
        },
      });
      const c = r.content as Record<string, unknown> | undefined;
      if (r.action !== 'accept' || typeof c?.carer_name !== 'string' || !c.carer_name.trim()) return 'declined';
      return {
        carer_name: c.carer_name.trim().slice(0, 60),
        language: typeof c.language === 'string' ? c.language : undefined,
        hourly_rate: typeof c.hourly_rate === 'number' && c.hourly_rate >= 0 ? c.hourly_rate : undefined,
      };
    } catch {
      return null;
    }
  };

  // ---------- paying the sitter (URL-mode elicitation) ----------
  const paymentData = async (p: Payment) => ({
    id: p.id,
    carer: p.carer,
    status: p.status,
    hours: duration(p.minutes),
    rate: dollars(p.rate_cents),
    amount: dollars(p.amount_cents),
    tip: p.tip_cents ? dollars(p.tip_cents) : null,
    total: dollars(p.amount_cents + p.tip_cents),
    url: abs(`/pay/${p.token}`)!,
    // Scan with the phone: the payment happens there, never on the shared screen.
    qr_svg: p.status === 'pending' ? await QRCode.toString(abs(`/pay/${p.token}`)!, { type: 'svg', margin: 1, color: { dark: '#1d2433', light: '#ffffff' } }) : null,
  });

  server.registerTool(
    'pay_sitter',
    {
      title: 'Pay the sitter',
      annotations: { destructiveHint: false, openWorldHint: true },
      description:
        "When the parents are back and say 'pay Priya': works out the evening (hours times the rate the parent gave, rounded up to the quarter hour) and asks the parent to approve it on their phone through a link (the payment is never made on the shared screen). Tell them to check their phone.",
      inputSchema: {},
      _meta: ui,
    },
    async () => {
      const h = payableHandoff(db);
      if (!h) return { content: [{ type: 'text', text: "There's no evening to pay for yet." }], isError: true };
      let p: Payment;
      try {
        p = createPayment(db, h);
      } catch (e) {
        if (e instanceof PaymentError) return { content: [{ type: 'text', text: e.message }], isError: true };
        throw e;
      }
      const data = await paymentData(p);
      const message = `Approve paying ${p.carer} ${data.amount} for tonight (${data.hours} at ${data.rate} an hour) on your phone.`;
      // The device hears when it's done: notifications/elicitation/complete.
      const done = server.server.createElicitationCompletionNotifier(p.elicitation_id);
      const onPaid = (paid: Payment) => {
        if (paid.id !== p.id) return;
        events.off('payment_paid', onPaid);
        void done().catch(() => {});
      };
      events.on('payment_paid', onPaid);
      if (server.server.getClientCapabilities()?.elicitation?.url) {
        try {
          const r = await server.server.elicitInput({ mode: 'url', message, url: data.url, elicitationId: p.elicitation_id });
          if (r.action !== 'accept') {
            events.off('payment_paid', onPaid);
            return plain('pay', { ...data, status: 'not_opened' }, 'Okay. You can pay later from the parent page.');
          }
        } catch {
          // the link is still on the screen and on the parent page
        }
      }
      return plain('pay', data, `${p.carer}'s evening comes to ${data.amount}: ${data.hours} at ${data.rate} an hour. I've sent it to your phone to approve.`);
    },
  );

  server.registerTool(
    'payment_status',
    {
      title: 'Payment status',
      description: 'Whether the sitter has been paid. The payment card refreshes itself with this.',
      inputSchema: { id: z.number().int().positive().describe('The payment id that pay_sitter returned') },
      annotations: { readOnlyHint: true },
      // Only the payment card and the device call this.
      _meta: { ui: { resourceUri: CARD_URI, visibility: ['app'] }, 'ui/resourceUri': CARD_URI },
    },
    async ({ id }) => {
      const p = getPayment(db, id);
      if (!p) return { content: [{ type: 'text', text: 'No such payment.' }], isError: true };
      const data = await paymentData(p);
      return plain('pay', data, p.status === 'paid' ? `Done. ${p.carer} has been paid ${data.total}.` : p.status === 'declined' ? 'The payment was cancelled.' : 'Waiting for you to approve it on your phone.');
    },
  );

  server.registerTool(
    'set_carer_language',
    {
      title: "Set the carer's language",
      annotations: { destructiveHint: false, idempotentHint: true },
      description:
        "Call when the carer speaks (or asks to be spoken to in) another language, e.g. a grandparent speaking Hindi. From then on replies are given in that language, with the parents' original words kept on screen.",
      inputSchema: { language: z.string().trim().min(2).max(20).describe('BCP-47 code such as hi-IN, es-US, ta-IN') },
    },
    async ({ language }) => {
      const h = activeHandoff(db);
      if (!h) return { content: [{ type: 'text', text: 'There is no handoff in progress.' }], isError: true };
      const code = languageCode(language);
      db.prepare('UPDATE handoffs SET language = ? WHERE id = ?').run(code === 'en' ? 'en' : language, h.id);
      return localized('language', { language: code }, code === 'en' ? "Okay, I'll speak English." : `Okay, from now on I'll speak ${LANGUAGES[code]}.`);
    },
  );

  server.registerTool(
    'teachback',
    {
      title: 'Teach-back check',
      annotations: { destructiveHint: false },
      description:
        'A quick check that the carer understood the essentials before the parents leave (allergy, where the EpiPen is, who to call first). Call with no arguments to start, then pass the carer\'s spoken answer as `answer` (or skip=true). Read out the question and any correction. The parents see the result on their phone.',
      inputSchema: {
        answer: z.string().trim().max(MAX_TEXT).optional().describe("The carer's answer to the current handover question, in their words"),
        answer_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer answered in another language'),
        skip: z.boolean().default(false).describe('true when the carer wants to skip this question'),
        restart: z.boolean().default(false).describe('true to start the handover check again from the first question'),
      },
      _meta: ui,
    },
    async ({ answer: spokenAnswer, answer_english, skip, restart }) => {
      const english = spokenAnswer === undefined ? undefined : await inEnglish(spokenAnswer, answer_english);
      const answer = spokenAnswer === undefined ? undefined : [spokenAnswer, english !== spokenAnswer ? english : null].filter(Boolean).join(' ');
      if (answer && isEmergency(answer, names())) {
        return plain('answer', { category: 'emergency', facts: [], guard: null, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      }
      const step = teachback(db, { answer, skip, restart });
      if (step.kind === 'unavailable') return { content: [{ type: 'text', text: step.reason }], isError: true };
      const fb = step.feedback;
      const said = fb ? (fb.correct ? 'That\'s right.' : fb.correct === null ? 'Okay, skipping that one.' : `Not quite. The parents said: "${fb.answer}"`) : '';
      if (step.kind === 'done') {
        const s = step.summary;
        const end =
          s.right === s.total
            ? `All ${s.total} right. The parents can see the handover is confirmed.`
            : s.skipped === s.total
              ? 'Check skipped. The answers are on the screen, and the parents can see it was skipped.'
              : `You got ${s.right} out of ${s.total} right${s.skipped ? ` and skipped ${s.skipped}` : ''}. I've shown the correct answers, and the parents can see the result.`;
        return localized('teachback', { ...step, carer: activeHandoff(db)?.carer_name }, [said, end].filter(Boolean).join(' '));
      }
      const intro = step.number === 1 && !fb ? `Quick check before the parents leave, ${step.total} questions. ` : '';
      return localized('teachback', { ...step, carer: activeHandoff(db)?.carer_name }, `${said} ${intro}${step.question}`.trim());
    },
  );

  server.registerTool(
    'tonight_plan',
    {
      title: "Tonight's plan",
      annotations: { destructiveHint: false },
      description:
        "Tonight's timeline from the parents' routine (dinner, bath, bedtime…), adjusted by their rules as the evening goes. With announce=true it also returns the steps that just became due, once each, so the device can say them aloud (\"It's 7:15: bath time\").",
      inputSchema: { announce: z.boolean().default(false).describe('true to also return the steps that just came due, once each, to say aloud') },
      _meta: ui,
    },
    withNotices(async ({ announce }) => {
      const tz = householdTz(db);
      const due = announce ? takeDueAnnouncements(db, tz) : [];
      const plan = tonightPlan(db, tz);
      const next = nextItem(plan.items);
      const names = (db.prepare('SELECT name FROM members').all() as Array<{ name: string }>).map((m) => m.name);
      const say = due.length
        ? due.map((i) => `It's ${i.time}: ${inSentence(i.title, names)}${i.checklist.length ? ` (${i.checklist.join(', ').toLowerCase()})` : ''}. ${i.said_by}'s plan.`).join(' ')
        : next
          ? plan.now.minutes > next.minutes
            ? `${next.title.charAt(0).toUpperCase()}${next.title.slice(1)} was due at ${next.time}.`
            : `Next is ${inSentence(next.title, names)} at ${next.time}.`
          : plan.items.length
            ? 'Everything on tonight\'s plan is done.'
            : "The parents haven't given times for tonight.";
      // Lights out: the house gets ready for bed (simulated smart home), and the parents'
      // goodnight message plays if they left one for bedtime.
      const bedtime = due.some((i) => i.key === 'bedtime');
      const scene = bedtime ? bedtimeScene(db) : null;
      const picked = bedtime ? pickMessage(db, 'bedtime') : undefined;
      const justPlayed = picked?.played_at ? now().getTime() - Date.parse(picked.played_at) < 15 * 60_000 : false;
      const goodnight = justPlayed ? undefined : picked;
      if (goodnight && goodnight.when_to_play !== 'missing') {
        markPlayed(db, goodnight);
        return localized(
          'message',
          { ...messageCard(goodnight), due: due.map((i) => i.key), smart_home: scene?.actions ?? null },
          `${say} ${goodnight.from_name} left a goodnight message for ${goodnight.for_name ?? 'you'}. ${scene?.say ?? ''}`.trim(),
        );
      }
      return localized(
        'plan',
        { items: plan.items, now: plan.now.hhmm, shift: plan.shift, shift_reason: plan.shift_reason, due: due.map((i) => i.key), smart_home: scene?.actions ?? null },
        `${say} ${scene?.say ?? ''}`.trim(),
      );
    }),
  );

  server.registerTool(
    'home_screen',
    {
      title: 'Tonight at a glance',
      description:
        "The Echo Show's home screen during a handoff: what's next on tonight's plan, how the evening is going, who's in the house and whether the parents have answered. Show it when the device is idle; the screen refreshes itself. Also answers \"how's it going?\" or \"what's happening tonight?\".",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: CARD_URI, visibility: ['model', 'app'] }, 'ui/resourceUri': CARD_URI },
    },
    async () => {
      const s = homeScreen(db);
      return localized('home', { ...s, timezone: householdTz(db) }, homeSentence(s));
    },
  );

  server.registerTool(
    'import_note',
    {
      title: 'Teach the house a note',
      annotations: { destructiveHint: false },
      description:
        'Only for a PARENT teaching a standing house rule or fact for future carers, when nobody is babysitting ("Alexa, remember: no juice after 7, bath at 7:15"). Not for something that happened tonight ("remember she napped till 5"): that is log_event. Reads the note into proposed house-manual cards; nothing is used until a parent confirms them on their phone, so tell them that. Codes and passwords are never stored. Refused during a handoff.',
      inputSchema: {
        text: z.string().trim().min(1).max(MAX_TEXT * 5).describe('The note, in the parent\'s words'),
        label: z.string().trim().max(80).default('Note told to Alexa').describe('Where the note came from, in a few words, e.g. "Fridge note"'),
      },
    },
    async ({ text, label }) => {
      // During a handoff the person talking is most likely the carer, and carers don't set house rules.
      if (activeHandoff(db)) {
        return {
          isError: true,
          content: [{ type: 'text', text: "Someone is babysitting right now, so new house rules come from the parents' phone. If this happened tonight, I can log it." }],
          structuredContent: { view: 'import', handoff_active: true },
        };
      }
      try {
        // A device can't go quiet for half a minute: if the AI is slow, answer now and finish in the
        // background. The cards appear on the parent's phone either way.
        const job = importNote(db, ai, { kind: 'text', text, label, author: 'Told to Alexa' });
        const out = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), voiceWaitMs))]);
        if (!out) {
          job.catch((e) => console.error('Reading a spoken note failed', e instanceof Error ? e.message : e));
          return localized('import', { pending: true }, "Got it. I'm writing that up; it'll be on your phone to confirm in a minute.");
        }
        const n = out.proposals.length;
        const conflicts = out.proposals.filter((p) => p.conflict_fact_id || p.conflict_reason).length;
        const parts = [
          n ? `I found ${n} thing${n === 1 ? '' : 's'} to add to the house manual.` : "I couldn't find any rules in that note.",
          conflicts ? `${conflicts} of them disagree${conflicts === 1 ? 's' : ''} with what's already saved.` : '',
          out.dropped_secrets ? "I left out codes and passwords, which I never store." : '',
          n ? `Please check and confirm ${n === 1 ? 'it' : 'them'} on your phone before tonight.` : '',
        ];
        return localized('import', { count: n, conflicts, dropped_secrets: out.dropped_secrets }, parts.filter(Boolean).join(' '));
      } catch (e) {
        if (e instanceof ImportError) return { content: [{ type: 'text', text: e.message }], isError: true };
        if (e instanceof AiUnavailableError) return { content: [{ type: 'text', text: "I can't read notes right now. Try again in a minute." }], isError: true };
        throw e;
      }
    },
  );

  server.registerTool(
    'ask_house',
    {
      title: 'Ask the house manual',
      annotations: { destructiveHint: false },
      description:
        "Answers a carer's question using only the parents' own words (food, bedtime, screen time, rules, pets). For food and medicine it also returns a guard sentence that must be said. If `emergency` is true, call the `emergency` tool right away. If `allergy_alert` is set, read it aloud: the parents have been alerted.",
      inputSchema: {
        question: z.string().trim().min(1).max(MAX_TEXT).describe("The carer's question, in their words"),
        question_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language. Safety rules read it.'),
      },
      _meta: ui,
    },
    withNotices(async ({ question: said, question_english }) => {
      // Safety rules read English; an emergency in either language counts.
      const english = await inEnglish(said, question_english);
      if (english === null && !isEmergency(said, names())) {
        return localized(
          'answer',
          { category: 'general', facts: [], guard: null, suggest_ask_parent: true },
          "I couldn't understand that well enough to answer safely. I can ask a parent.",
        );
      }
      const question = english ?? said;
      // "What can you do?": what this add-on is for, in one breath (Alexa+ asks every add-on to answer it).
      if (CAPABILITIES.test(question.trim())) {
        const child = (db.prepare("SELECT name FROM members WHERE kind = 'child' ORDER BY id LIMIT 1").get() as { name: string } | undefined)?.name;
        return localized(
          'answer',
          { category: 'general', facts: [], guard: null, suggest_ask_parent: false, emergency: false, exact: true, capabilities: true },
          `I know the parents' notes for tonight. Ask where things are, what ${child ?? 'the kids'} can eat, or what's next. If they haven't said, I'll ask them. Say "emergency" anytime.`,
        );
      }
      // "Where's the EpiPen?" in any language: the place, as the parents described it.
      const where = /^(?:where(?:'s| is| are| do i find| can i find| do they keep)|find)\s+(?:the |her |his |my |their |maya'?s )?(.+?)\??$/i.exec(question.trim());
      const place = where && !isEmergency(question, names()) ? whereIs(db, where[1]) : null;
      if (place) return localized('location', { ...place, photo_url: abs(place.photo_url) }, `${place.item}: ${place.description}`);
      if (isEmergency(said, names()) || isEmergency(question, names())) {
        return plain('answer', { category: 'emergency', facts: [], guard: null, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      }
      const a = answerQuestion(db, question, VOICE_ROLE);
      if (a.emergency) {
        return plain('answer', { ...a }, 'This sounds like an emergency. Call the emergency tool now.');
      }
      // "She already ate a peanut butter cookie, is she ok?" is an exposure, not a question about food.
      const allergens = INGESTED.test(question) ? allergenMentions(db, question) : [];
      if (allergens.length) {
        const alert = allergyAlert(question, allergens);
        return localized('answer', { ...a, allergy_alert: alert, allergens }, alert);
      }
      const facts = a.facts.map((f) =>
        f.source === 'parent_answer' ? `Earlier ${f.said_by} answered this. ${f.text}` : f.source === 'contacts' ? f.text : `${f.said_by} said: "${f.text}"`,
      );
      // Shadow Parent: on low-risk questions the manual doesn't settle, say how the parents usually answer.
      const shadow = a.suggest_ask_parent && !a.guard ? shadowSuggestion(db, question) : null;
      const busy = busyUntil(db);
      // Spoken: the best answer in the parents' words, then what must always be said. A note that only
      // comes close is read out if it shares a word with the question ("YouTube"); otherwise ("Can she
      // sleep in your bed?" vs the bedtime routine) the closest notes are on the card, not read out.
      // The routine says "lights out at 8", but a late nap moved tonight's bedtime: say tonight's first.
      const moved = /\bbed ?time\b|\blights out\b|\b(what time|when)\b.*\b(bed|sleep)\b/i.test(question) && activeHandoff(db)?.plan_shift
        ? tonightPlan(db, householdTz(db)).items.find((i) => i.key === 'bedtime')
        : undefined;
      const tonight = moved ? [`Tonight, bedtime is ${moved.time}; the late nap moved it.`] : [];
      const closeAt = a.exact ? -1 : a.facts.findIndex((f) => sharesWords(f.text, question));
      const close = closeAt >= 0;
      // How the parents usually answer says it better than "not exactly".
      const lead = a.exact || !a.facts.length || (shadow && !close) ? [] : [close ? "The parents haven't said exactly. Closest:" : "The parents haven't said exactly; their closest notes are on screen."];
      const offer = shadow || a.guard ? null : !a.facts.length ? "The parents haven't covered this. I can ask them." : !a.exact ? 'I can ask them.' : null;
      const after = [
        a.guard === FOOD_GUARD ? FOOD_GUARD_SPOKEN : a.guard === MEDICINE_GUARD ? MEDICINE_GUARD_SPOKEN : a.guard,
        shadow?.message,
        offer,
        busy && a.suggest_ask_parent ? `The parents asked for urgent questions only until ${clockTime(busy)}.` : null,
      ].filter((l): l is string => Boolean(l));
      // "What's for dinner?" is answered by the note that names it. The allergy still comes first,
      // but as its one key sentence, so the actual answer fits in what is said.
      const named = a.exact && a.category === 'food' ? a.facts.findIndex((f) => f.risk !== 'safety' && sharesWords(f.text, question)) : -1;
      const safety = a.facts.find((f) => f.risk === 'safety');
      const pool =
        named >= 0 && safety
          ? [firstSentence(safety.text), `${a.facts[named].said_by} said: "${firstSentence(a.facts[named].text)}"`]
          : a.exact ? facts : close ? [facts[closeAt]] : [];
      const spoken = fitSpoken(pool, SPOKEN_WORDS - wordCount([...tonight, ...lead, ...after].join(' ')));
      return localized('answer', { ...a, shadow, busy_until: busy ? clockTime(busy) : null, tonight_bedtime: moved?.time ?? null }, [...tonight, ...lead, ...spoken, ...after].join(' '));
    }),
  );

  server.registerTool(
    'where_is',
    {
      title: 'Where is something',
      description: 'Finds where something is kept in the house (EpiPen, first aid kit, pyjamas, dog food) and shows the parents\' photo if there is one.',
      inputSchema: { item: z.string().trim().min(1).max(100).describe('The thing to find, e.g. "EpiPen", "first aid kit", "dog food"') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      _meta: ui,
    },
    withNotices(async ({ item }) => {
      if (isEmergency(item, names())) return plain('answer', { category: 'emergency', facts: [], guard: null, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      const loc = whereIs(db, item);
      if (!loc)
        return localized('answer', { category: 'general', facts: [], guard: null, found: false, suggest_ask_parent: true }, `The parents haven't said where the ${item} is. I can ask them.`);
      return localized('location', { ...loc, photo_url: abs(loc.photo_url) }, `${loc.item}: ${loc.description}`);
    }),
  );

  server.registerTool(
    'log_event',
    {
      title: 'Log the evening',
      annotations: { destructiveHint: false },
      description:
        'Records something that happened during the handoff, in the carer\'s words ("asleep at 8:10", "woke up crying at 9", "remember she napped till 5"). The parents see it in the morning summary. A parent\'s standing house rule is import_note, not this. If the result has `emergency: true`, call the `emergency` tool right away. If it has an `allergy_alert`, read it aloud.',
      inputSchema: {
        text: z.string().min(1).max(MAX_TEXT).describe('What happened, in the carer\'s words, e.g. "she fell asleep at 8:10"'),
        text_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language'),
        kind: z.enum(['sleep', 'food', 'mood', 'health', 'pet', 'note']).default('note').describe('What it is about: sleep, food, mood, health, pet, or note'),
      },
    },
    withNotices(async ({ text: said, text_english, kind }) => {
      const text = (await inEnglish(said, text_english)) ?? said;
      if (!activeHandoff(db)) {
        return { content: [{ type: 'text', text: 'There is no handoff in progress, so there is nothing to log yet.' }], isError: true };
      }
      const ev = logEvent(db, text !== said ? `${said} (${text})` : said, kind);
      // Logging must never bypass the safety checks the carer would get by asking.
      if (isEmergency(text, names()) || isEmergency(said, names())) {
        return plain('logged', { event: ev, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      }
      const allergens = allergenMentions(db, text);
      if (allergens.length) {
        const alert = allergyAlert(text, allergens);
        return localized('logged', { event: ev, allergy_alert: alert, allergens }, alert);
      }
      // Medicine given without a parent's say-so: the parents hear about it now, not in the morning.
      if (mentionsMedicine(text)) {
        const rule = visibleFacts(db, 'carer').find((f) => f.category === 'medicine');
        const q = createQuestion(db, `Urgent: ${activeHandoff(db)?.carer_name ?? 'The carer'} logged "${text}"`, null, 'urgent');
        const who = currentContactFor(db, q);
        const alert = `${rule ? `${rule.author}'s rule: "${rule.text}" ` : ''}I've let ${who?.name ?? 'the parents'} know.`;
        return localized('logged', { event: ev, medicine_alert: alert }, `Logged. ${alert}`);
      }
      // The parents' own timing rules react to the log ("napped till 5" moves bedtime).
      const change = applyLogToPlan(db, householdTz(db), text);
      if (change) {
        const plan = tonightPlan(db, householdTz(db));
        return localized('plan', { event: ev, plan_change: change.message, items: plan.items, shift: plan.shift, shift_reason: plan.shift_reason }, `Got it. ${change.message}`);
      }
      // The shopping list agent: something ran out, so a parent is asked to add it to the list.
      const missing = suppliesMentioned(text).filter((item) => !shoppingList(db).includes(item));
      if (missing.length) {
        const item = missing[0];
        const first = parentNames(db)[0] ?? 'the parents';
        const ask = { question: shoppingQuestion(activeHandoff(db)?.carer_name ?? 'The sitter', item), shopping_item: item };
        return localized('logged', { event: ev, shopping_ask: ask }, `Got it. I'm asking ${first} to add ${item} to the shopping list.`);
      }
      return { content: [{ type: 'text', text: `Logged: ${ev.text}` }], structuredContent: { view: 'logged', event: ev } };
    }),
  );

  server.registerTool(
    'ask_parent',
    {
      title: 'Ask a parent',
      annotations: { destructiveHint: false, openWorldHint: true },
      description:
        "Sends the carer's question to a parent's phone when the manual doesn't answer it. Returns immediately with a question id; use `check_parent_answer` to see the reply. Hosts that support MCP tasks should prefer `ask_parent_and_wait`.",
      inputSchema: {
        question: z.string().trim().min(1).max(MAX_TEXT).describe('What the carer wants to ask the parents, in their words'),
        question_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language'),
      },
      _meta: ui,
    },
    async ({ question, question_english }) => {
      const q = createQuestion(db, question, null, undefined, question_english ?? null);
      const who = currentContactFor(db, q);
      const emergency = isEmergency(question, names()) || (question_english ? isEmergency(question_english, names()) : false);
      const busy = busyUntil(db);
      const waiting = busy && q.urgency !== 'urgent' && !emergency;
      // Emergencies never wait for a translation.
      const reply = emergency ? plain : localized;
      return reply(
        'question',
        { id: q.id, text: q.text, status: q.status, urgency: q.urgency, asked: who ? `${who.name} (${who.relation})` : 'a parent', emergency, busy_until: busy ? clockTime(busy) : null },
        emergency
          ? `This sounds like an emergency. Call the emergency tool now. I've also told ${who?.name ?? 'the parents'}.`
          : waiting
            ? `${who?.name ?? 'The parents'} asked for urgent questions only until ${clockTime(busy!)}, so this one will wait for them. If it's urgent, say so.`
            : `I've asked ${who?.name ?? 'a parent'}. I'll tell you as soon as they answer.`,
      );
    },
  );

  server.registerTool(
    'check_parent_answer',
    {
      title: 'Check for a parent\'s answer',
      description: 'Checks whether a parent has answered a question sent with `ask_parent`.',
      inputSchema: { question_id: z.number().int().positive().describe('The id that ask_parent returned') },
      annotations: { readOnlyHint: true },
      _meta: ui,
    },
    async ({ question_id }) => {
      const q = getQuestion(db, question_id);
      // Only questions from the current handoff: earlier carers' questions stay private.
      const current = activeHandoff(db)?.id ?? null;
      if (!q || q.handoff_id !== current) return { content: [{ type: 'text', text: 'No such question.' }], isError: true };
      const who = currentContactFor(db, q);
      const text = q.status === 'answered' ? `${q.answered_by} said: "${q.answer}"` : `No answer yet from ${who?.name ?? 'the parents'}.`;
      if (q.status === 'answered') db.prepare('UPDATE questions SET heard = 1 WHERE id = ?').run(q.id);
      return localized('question', { ...q, asked: who ? `${who.name} (${who.relation})` : 'a parent' }, text);
    },
  );

  // Long-running version: an MCP task that completes when a parent answers,
  // and moves down the contact chain if nobody answers in time.
  server.experimental.tasks.registerToolTask(
    'ask_parent_and_wait',
    {
      title: 'Ask a parent and wait for the answer',
      annotations: { destructiveHint: false, openWorldHint: true },
      description:
        "Sends the carer's question to the parents and runs as a task until someone answers. If the first contact doesn't answer in time, the next contact is asked.",
      inputSchema: {
        question: z.string().trim().min(1).max(MAX_TEXT).describe('What the carer wants to ask the parents, in their words'),
        question_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language'),
        door_event_id: z.number().int().positive().optional().describe('From door_check: attaches the doorbell photo, and the question is treated as urgent'),
        shopping_item: z.string().trim().min(1).max(60).optional().describe('From log_event (shopping_ask): the parents answer "add to list" or "not now"'),
      },
      execution: { taskSupport: 'required' },
      outputSchema: OUTPUTS.ask_parent_and_wait,
      _meta: { ...ui, ui: { ...ui.ui, ...STATUS.ask_parent_and_wait } },
    },
    {
      async createTask({ question, question_english, door_event_id, shopping_item }, { taskStore: store, taskRequestedTtl }) {
        // Between 1 minute and 6 hours, whatever the client asks for.
        const ttl = Math.min(Math.max(taskRequestedTtl ?? 60 * 60 * 1000, 60_000), 6 * 60 * 60 * 1000);
        const task = await store.createTask({ ttl, pollInterval: 2000 });
        // Someone waiting at the door can't wait for busy mode: door questions are urgent.
        const door = getDoorEvent(db, door_event_id);
        const q = createQuestion(db, question, task.taskId, door ? 'urgent' : undefined, question_english ?? null, door?.id ?? null, shopping_item ?? null);
        attachTask(db, q.id, task.taskId);
        const first = currentContactFor(db, q);
        // Busy mode: non-urgent questions wait quietly and don't move down the contact chain.
        const isWaiting = () => q.urgency !== 'urgent' && busyUntil(db) !== null;
        let wasWaiting = isWaiting();
        await store.updateTaskStatus(
          task.taskId,
          'working',
          wasWaiting ? `${first?.name ?? 'The parents'} asked for urgent questions only until ${clockTime(busyUntil(db)!)}. This one is waiting.` : `Asked ${first?.name ?? 'a parent'}`,
        );

        let done = false;
        const cleanup = () => {
          done = true;
          clearInterval(timer);
          clearTimeout(expiry);
          events.off('answered', onAnswered);
          events.off('question_closed', onClosed);
        };
        const stillOpen = async () => {
          const t = await store.getTask(task.taskId).catch(() => null);
          return !done && t !== null && t.status === 'working';
        };

        // One watcher: notices cancellation, and moves down the contact chain on schedule.
        let lastEscalation = Date.now();
        let chainDone = false;
        const timer = setInterval(async () => {
          try {
            if (!(await stillOpen())) {
              // Cancelled by the client (or expired): take the question off the parent's phone.
              cleanup();
              expireQuestion(db, q.id, 'The question was cancelled.');
              return;
            }
            if (isWaiting()) {
              wasWaiting = true;
              lastEscalation = Date.now();
              return;
            }
            if (wasWaiting) {
              // Busy mode just ended: the question now goes to the parent as normal.
              wasWaiting = false;
              lastEscalation = Date.now();
              await store.updateTaskStatus(task.taskId, 'working', `Asked ${currentContactFor(db, getQuestion(db, q.id)!)?.name ?? 'a parent'}`);
              return;
            }
            if (chainDone || Date.now() - lastEscalation < escalateAfterMs) return;
            lastEscalation = Date.now();
            const next = escalateQuestion(db, q.id);
            if (next) await store.updateTaskStatus(task.taskId, 'working', `No answer yet. Also asked ${next.name} (${next.relation}).`);
            else chainDone = true; // everyone has been asked; keep waiting for an answer
          } catch {
            cleanup();
          }
        }, Math.min(5000, escalateAfterMs));

        // When the task expires unanswered, stop listening and mark the question expired.
        const expiry = setTimeout(() => {
          cleanup();
          expireQuestion(db, q.id);
        }, ttl);

        // The handoff ended (or the question was otherwise closed) before anyone answered.
        const onClosed = async (closed: { id: number; reason: string }) => {
          if (closed.id !== q.id) return;
          const open = await stillOpen();
          cleanup();
          if (!open) return;
          await store
            .storeTaskResult(task.taskId, 'completed', {
              content: [{ type: 'text', text: `No answer: ${closed.reason}` }],
              structuredContent: { view: 'question', ...getQuestion(db, q.id), asked: first?.name ?? 'a parent', closed: true },
            })
            .catch(() => {});
        };
        events.on('question_closed', onClosed);

        const onAnswered = async (answered: { id: number; answer: string | null; answered_by: string | null }) => {
          if (answered.id !== q.id) return;
          const open = await stillOpen();
          cleanup();
          if (!open) return;
          await store
            .storeTaskResult(task.taskId, 'completed', {
              content: [
                {
                  type: 'text',
                  text: shopping_item
                    ? answered.answer === SHOP_ANSWERS.yes
                      ? `${answered.answered_by} added ${shopping_item} to the shopping list.`
                      : `${answered.answered_by} said not now to ${shopping_item}.`
                    : `${answered.answered_by} said: "${answered.answer}"`,
                },
              ],
              structuredContent: { view: 'question', ...getQuestion(db, q.id), asked: answered.answered_by, door_snapshot: abs(door?.snapshot_url ?? null) },
            })
            .catch(() => {});
          // The device was waiting on this task, so it hears the answer now: not repeated later.
          db.prepare('UPDATE questions SET heard = 1 WHERE id = ?').run(q.id);
        };
        events.on('answered', onAnswered);
        return { task };
      },
      async getTask(_args, { taskId, taskStore: store }) {
        const t = await store.getTask(taskId);
        if (!t) throw new McpError(ErrorCode.InvalidParams, `Task ${taskId} not found or expired`);
        return t;
      },
      async getTaskResult(_args, { taskId, taskStore: store }) {
        const result = (await store.getTaskResult(taskId)) as CallToolResult;
        // The device has the answer now: it isn't repeated at the start of the next reply.
        db.prepare("UPDATE questions SET heard = 1 WHERE task_id = ? AND status = 'answered'").run(taskId);
        return result;
      },
    },
  );

  server.registerTool(
    'emergency',
    {
      title: 'Emergency',
      annotations: { destructiveHint: false, openWorldHint: true },
      description:
        'Call immediately if the carer describes an emergency (trouble breathing, swelling, choking, unconscious, seizure, swallowed something, serious injury, fire). Returns a fixed safety script from the family\'s own information and alerts every contact. Read `say_first` aloud before anything else.',
      inputSchema: {
        description: z.string().trim().min(1).max(MAX_TEXT).describe('What the carer said is happening'),
        description_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language'),
      },
      _meta: { ...ui, ui: { resourceUri: CARD_URI, preferredDisplayMode: 'fullscreen' } },
    },
    async ({ description, description_english }) => {
      const e = startEmergency(db, [description, description_english].filter(Boolean).join(' / '));
      e.epipen_photo = abs(e.epipen_photo);
      const lang = carerLang();
      const fixed = lang === 'en' ? null : fixedTranslation(e.say_first, lang);
      const address = e.address?.trim() ? e.address : null;
      const steps = e.action_plan.steps;
      const first = steps[0]?.text ?? '';
      // The parents' allergy plan puts the EpiPen first and 911 straight after (as allergy action
      // plans do): then the first thing said is step 1, and the address comes with the 911 step.
      const planLeads = steps.length > 1 && !/\b911\b/.test(first) && steps.some((s) => /\b911\b/.test(s.text));
      // The general script starts with the same "Call 911" sentence; say it once.
      const english = planLeads
        ? `Step 1 of ${steps.length}: ${first} Say "done" when you have.`
        : [e.say_first, first === e.say_first ? '' : first].filter(Boolean).join(' ');
      // Emergencies never wait for an AI: a fixed translation of the first line if we have one, English
      // otherwise. The address itself is shown big on screen, never said aloud (Alexa+ privacy policy).
      const spoken = fixed;
      return plain('emergency', { ...e, address, language: lang, spoken }, spoken ? `${spoken} ${english}` : english);
    },
  );

  /** The emergency screen's data: the fixed script plus where the carer is in it. */
  const incidentResult = (i: NonNullable<ReturnType<typeof activeIncident>>, text: string, extra: Record<string, unknown> = {}) => {
    const s = i.script as Record<string, unknown>;
    // The sitter's language stays on the screen as it refreshes: the same fixed translation of the
    // first line that the emergency started with (never an AI's).
    const lang = carerLang();
    // Only while it lasts: "call 911 now" must not stay on screen once help has taken over.
    const fixed = lang === 'en' || i.status !== 'active' ? null : fixedTranslation(String(s.say_first ?? ''), lang);
    const relay = fixed ? { language: lang, spoken: fixed } : {};
    // Photos as absolute URLs: the card runs in a sandbox with no base address of its own.
    return plain('emergency', { ...s, address: s.address || null, epipen_photo: abs((s.epipen_photo as string | null) ?? null), incident: incidentView(db, i), ...relay, ...extra }, text);
  };

  server.registerTool(
    'emergency_step',
    {
      title: 'Emergency: next step',
      annotations: { destructiveHint: false },
      description:
        'During an emergency, moves the step-by-step guide on. Call with action "done" when the carer says they did the step ("done", "I gave the EpiPen", "called 911"), "next" to skip ahead, "back" to repeat, and "resolved" only when the carer says it is over (paramedics have taken over, she is fine). Read the returned text aloud.',
      inputSchema: { action: z.enum(['done', 'next', 'back', 'resolved']).describe('done (the step is done), next (skip ahead), back (repeat it), or resolved (help has taken over)') },
      _meta: { ...ui, ui: { resourceUri: CARD_URI, preferredDisplayMode: 'fullscreen' } },
    },
    async ({ action }) => {
      const before = activeIncident(db);
      if (!before) return { content: [{ type: 'text', text: 'There is no emergency in progress.' }], isError: true };
      const i = stepIncident(db, action)!;
      if (i.status === 'resolved') {
        return incidentResult(i, "Okay. I've told the parents the emergency is over. If anything changes, say emergency again.", { resolved: true });
      }
      // The timer belongs to the step just finished ("5 minutes since the EpiPen"), so it is said first.
      const timer = i.current === 1 && i.timers.length && before.current === 0 ? `${Math.round(i.timers[0].seconds / 60)}-minute timer started. ` : '';
      const address = String((i.script as Record<string, unknown>).address ?? '').trim();
      const step = i.steps[i.current]?.text ?? '';
      // The address is shown big on the screen, not said aloud (Alexa+ policy: no private details by voice).
      const where = address && /\b911\b/.test(step) ? ' The address is on the screen.' : '';
      const text =
        i.current >= i.steps.length
          ? `${timer}That was the last step. Stay with her and follow the 911 dispatcher. Say "it's over" when help has taken over.`
          : `${timer}${action === 'back' ? 'Again' : 'Next'}, step ${i.current + 1} of ${i.steps.length}: ${step}${where}`;
      return incidentResult(i, text);
    },
  );

  server.registerTool(
    'emergency_status',
    {
      title: 'Emergency status',
      description:
        "The emergency in progress: which step the carer is on, the plan's timers, and which parent is on the way. The emergency screen refreshes itself with this. With announce=true it also returns what should be said now, once each (\"One minute left on the EpiPen timer\").",
      inputSchema: { announce: z.boolean().default(false).describe('true to also return what should be said now (timer warnings, a parent on the way), once each') },
      annotations: { readOnlyHint: true },
      // Only the emergency screen and the device call this; the model has emergency and emergency_step.
      _meta: { ui: { resourceUri: CARD_URI, visibility: ['app'], preferredDisplayMode: 'fullscreen' }, 'ui/resourceUri': CARD_URI },
    },
    async ({ announce }) => {
      const say = announce ? takeIncidentAnnouncements(db) : [];
      const i = activeIncident(db) ?? latestIncident(db);
      if (!i) return { content: [{ type: 'text', text: 'There is no emergency in progress.' }], structuredContent: { view: 'none', active: false } };
      return incidentResult(i, say.join(' ') || (i.status === 'resolved' ? 'The emergency is over.' : `Step ${Math.min(i.current + 1, i.steps.length)} of ${i.steps.length}.`), {
        announce: say,
        active: i.status === 'active',
      });
    },
  );

  server.registerTool(
    'end_handoff',
    {
      title: 'End the handoff',
      annotations: { destructiveHint: true },
      description: 'Call when the parents are back. Ends carer mode and returns the evening summary for the parents.',
      inputSchema: {},
      _meta: ui,
    },
    async () => {
      const ended = endHandoff(db);
      if (!ended) return { content: [{ type: 'text', text: 'There is no handoff in progress.' }] };
      const h = db.prepare('SELECT * FROM handoffs WHERE id = ?').get(ended.id) as unknown as Handoff;
      const d = buildDebrief(db, h);
      // Raw timestamps: the card formats them in the viewer's own time zone.
      const questions = d.questions.map((q) => (q.answer ? `${q.text} → ${q.answered_by}: "${q.answer}"` : `${q.text} (unanswered)`));
      const text = fitSpoken([
        `Evening with ${h.carer_name}: ${plural(d.timeline.length, 'note')}, ${plural(questions.length, 'question')}.`,
        ...d.insights,
        d.rule_suggestions.length ? `${plural(d.rule_suggestions.length, "of tonight's answers")} could become house rules; they're on your phone.` : '',
      ].filter(Boolean)).join(' ');
      return localized('summary', { carer: h.carer_name, timezone: householdTz(db), timeline: d.timeline, questions, insights: d.insights, rule_suggestions: d.rule_suggestions, supplies: d.supplies }, text);
    },
  );

  /** What the Echo Show needs to play a parent's message. */
  const messageCard = (m: MessageInfo) => {
    const from = contacts(db).find((c) => c.name === m.from_name);
    return {
      id: m.id,
      from: m.from_name,
      relation: from?.relation ?? null,
      for_name: m.for_name,
      kind: m.kind,
      caption: m.caption,
      url: abs(`/media/messages/${m.id}?t=${m.token}`),
    };
  };

  server.registerTool(
    'play_message',
    {
      title: "Play the parents' message",
      annotations: { destructiveHint: false, idempotentHint: true },
      description:
        "Plays the voice or video message a parent recorded for the child. Call when the child misses a parent or is sad (\"Maya misses her mom\", \"she's crying for her dad\"), or when the carer asks to play it. At lights out the tonight_plan reminder plays the bedtime message by itself.",
      inputSchema: { when: z.enum(['bedtime', 'missing', 'any']).default('missing').describe('bedtime, or missing when the child misses the parents') },
      _meta: { ...ui, ui: { resourceUri: CARD_URI, preferredDisplayMode: 'fullscreen' } },
    },
    async ({ when }) => {
      const m = pickMessage(db, when);
      if (!m) return localized('answer', { category: 'general', facts: [], guard: null }, "The parents haven't left a message tonight. I can call them if you like.");
      markPlayed(db, m);
      return localized('message', messageCard(m), `${m.from_name} left a message for ${m.for_name ?? 'you'}.`);
    },
  );

  server.registerTool(
    'door_check',
    {
      title: 'Who is at the door?',
      description:
        "Call when the carer asks about the front door (\"someone's knocking, should I open?\", \"who's at the door?\", the doorbell rang). Uses the doorbell camera's latest event, who the parents said to expect tonight, delivery windows and the parents' door rule. Never says a stranger is safe. If the result has ask_parent, call ask_parent_and_wait with that question and door_event_id so the parents see the photo.",
      inputSchema: { question: z.string().trim().max(MAX_TEXT).optional().describe("The carer's words") },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      _meta: ui,
    },
    withNotices(async ({ question }) => {
      if (question && isEmergency(question, names())) {
        return plain('answer', { category: 'emergency', facts: [], guard: null, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      }
      const c = doorCheck(db);
      const data = { ...c, event: c.event ? { ...c.event, snapshot_url: abs(c.event.snapshot_url), time: clockTime(new Date(c.event.at)) } : null };
      return localized('door', data, c.say);
    }),
  );

  return server;
}
