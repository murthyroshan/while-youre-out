import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import { InMemoryTaskMessageQueue } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import type { DB } from '../db.js';
import { isEmergency, mentionsMedicine } from '../domain/safety.js';
import {
  activeHandoff,
  allergenMentions,
  answerQuestion,
  attachTask,
  briefing,
  createQuestion,
  currentContactFor,
  endHandoff,
  escalateQuestion,
  eveningLog,
  expireQuestion,
  events,
  getQuestion,
  HandoffInProgressError,
  householdTz,
  logEvent,
  startHandoff,
  visibleFacts,
  whereIs,
  type Role,
} from '../domain/house.js';
import { startEmergency } from '../domain/emergency.js';
import { importNote, ImportError } from '../domain/houseBrain.js';
import { applyLogToPlan, takeDueAnnouncements, tonightPlan } from '../domain/plan.js';
import { teachback } from '../domain/teachback.js';
import { busyUntil, shadowSuggestion } from '../domain/shadow.js';
import { buildDebrief, sinceLastVisit } from '../domain/debrief.js';
import { fixedTranslation, languageCode, LANGUAGES, translateOne } from '../domain/translate.js';
import type { Handoff } from '../db.js';
import { formatTime, localTime } from '../clock.js';
import { AiUnavailableError, type AiClient } from '../ai/gemini.js';
import { CARD_HTML, CARD_MIME, CARD_URI } from './card.js';

export interface ServerDeps {
  db: DB;
  taskStore: TaskStore;
  /** How long a contact has to answer before the next one is asked. */
  escalateAfterMs: number;
  /** Public origin of this server, used to turn photo paths into absolute URLs. */
  publicUrl: string;
  /** AI client used by House Brain to read notes. */
  ai: AiClient;
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
const INGESTED = /\b(ate|eaten|has eaten|had|has had|swallowed|drank|took a bite|bit into|tasted|licked|chewed)\b/i;
/** Upper bound for free-text inputs, so one call can't store megabytes. */
const MAX_TEXT = 1000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildServer({ db, taskStore, escalateAfterMs, publicUrl, ai }: ServerDeps) {
  const abs = (path: string | null) => (path ? new URL(path, publicUrl).href : null);
  const clockTime = (d: Date) => formatTime(localTime(householdTz(db), d).minutes);
  const carerLang = () => languageCode(activeHandoff(db)?.language);
  /** A result spoken in the carer's language; the parents' original words stay in the data and on screen. */
  const localized = async (view: string, data: Record<string, unknown>, text: string): Promise<CallToolResult> => {
    const lang = carerLang();
    if (lang === 'en' || !text) return plain(view, data, text);
    const spoken = await translateOne(db, ai, text, lang);
    return plain(view, { ...data, language: lang, spoken, english: text }, spoken ?? text);
  };

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
      instructions: [
        "You are helping a carer (babysitter, grandparent, nanny) who is looking after the family's children while the parents are out.",
        "Only ever repeat the parents' own words returned by these tools. Never invent rules.",
        "Never tell the carer that a food or medicine is safe, and never suggest doses. Always say the guard sentence the tools return.",
        "If anything sounds like an emergency, call the `emergency` tool immediately and read its first line out loud.",
        "If the manual does not answer a question, offer to ask a parent with `ask_parent`.",
      ].join(' '),
    },
  );

  server.registerResource(
    'card',
    CARD_URI,
    { title: "While You're Out card", mimeType: CARD_MIME, description: 'Renders handoff cards on Echo Show-style screens.' },
    async () => ({
      contents: [
        {
          uri: CARD_URI,
          mimeType: CARD_MIME,
          text: CARD_HTML,
          // Lets MCP Apps hosts load the parents' photos from this server.
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
      description:
        'Call when a parent hands the home over to a carer ("Priya is babysitting tonight"). Switches the device into carer mode and returns tonight\'s briefing to read aloud.',
      inputSchema: {
        carer_name: z.string().trim().min(1).max(60).describe('Name of the person taking over'),
        language: z.string().max(20).default('en').describe('Language the carer prefers, as a BCP-47 code such as en, hi, es'),
        replace: z.boolean().default(false).describe('Set only after the parent confirms ending the handoff already in progress'),
      },
      _meta: ui,
    },
    async ({ carer_name, language, replace }) => {
      let h;
      try {
        h = startHandoff(db, carer_name, language, { replace });
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
      // A carer who has been here before hears only what changed since their last visit.
      const since = sinceLastVisit(db, h.carer_name, h.id);
      const sinceText = since
        ? `Welcome back, ${h.carer_name}. Since your last visit: ${[...since.added.slice(0, 3).map((a) => `"${a.text}"`), ...since.removed.slice(0, 2).map((r) => `no longer "${r.text}"`)].join('; ')}.`
        : '';
      const text = [
        `Handoff started for ${h.carer_name}.`,
        sinceText,
        b.must_know.length ? `Most important: ${b.must_know.join(' ')}` : '',
        b.epipen ? `The EpiPen is here: ${b.epipen}` : '',
        plan.items.length ? `Tonight: ${plan.items.map((i) => `${i.title.toLowerCase()} at ${i.time}`).join(', ')}.` : '',
        b.first_contact ? `If anything comes up, ${b.first_contact} is first to call.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return localized('briefing', { carer: h.carer_name, language: h.language, ...b, plan: plan.items, since_last_visit: since }, text);
    },
  );

  server.registerTool(
    'set_carer_language',
    {
      title: "Set the carer's language",
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
      description:
        'A quick check that the carer understood the essentials before the parents leave (allergy, where the EpiPen is, who to call first). Call with no arguments to start, then pass the carer\'s spoken answer as `answer` (or skip=true). Read out the question and any correction. The parents see the result on their phone.',
      inputSchema: {
        answer: z.string().trim().max(MAX_TEXT).optional(),
        answer_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer answered in another language'),
        skip: z.boolean().default(false),
        restart: z.boolean().default(false),
      },
      _meta: ui,
    },
    async ({ answer: spokenAnswer, answer_english, skip, restart }) => {
      const answer = spokenAnswer === undefined ? undefined : [spokenAnswer, answer_english].filter(Boolean).join(' ');
      if (answer && isEmergency(answer)) {
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
              : `${s.right} of ${s.total} right${s.skipped ? `, ${s.skipped} skipped` : ''}. I've shown the correct answers, and the parents can see the result.`;
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
      description:
        "Tonight's timeline from the parents' routine (dinner, bath, bedtime…), adjusted by their rules as the evening goes. With announce=true it also returns the steps that just became due, once each, so the device can say them aloud (\"It's 7:15: bath time\").",
      inputSchema: { announce: z.boolean().default(false) },
      _meta: ui,
    },
    async ({ announce }) => {
      const tz = householdTz(db);
      const due = announce ? takeDueAnnouncements(db, tz) : [];
      const plan = tonightPlan(db, tz);
      const next = plan.items.find((i) => i.status !== 'done');
      const say = due.length
        ? due.map((i) => `It's ${i.time}: ${i.title.toLowerCase()}${i.checklist.length ? ` (${i.checklist.join(', ').toLowerCase()})` : ''}. ${i.said_by}'s plan.`).join(' ')
        : next
          ? `Next is ${next.title.toLowerCase()} at ${next.time}.`
          : plan.items.length
            ? 'Everything on tonight\'s plan is done.'
            : "The parents haven't given times for tonight.";
      return localized('plan', { items: plan.items, now: plan.now.hhmm, shift: plan.shift, shift_reason: plan.shift_reason, due: due.map((i) => i.key) }, say);
    },
  );

  server.registerTool(
    'import_note',
    {
      title: 'Teach the house a note',
      description:
        'Use when a parent dictates or shares the text of a note for carers ("Alexa, remember: no sweets after 6, bath at 7"). Reads it into proposed house-manual cards. Nothing is used until a parent confirms the cards on their phone, so tell them that. Codes and passwords are never stored.',
      inputSchema: {
        text: z.string().trim().min(1).max(MAX_TEXT * 5).describe('The note, in the parent\'s words'),
        label: z.string().trim().max(80).default('Note told to Alexa'),
      },
    },
    async ({ text, label }) => {
      try {
        const out = await importNote(db, ai, { kind: 'text', text, label, author: 'Told to Alexa' });
        const n = out.proposals.length;
        const conflicts = out.proposals.filter((p) => p.conflict_fact_id || p.conflict_reason).length;
        const parts = [
          n ? `I found ${n} thing${n === 1 ? '' : 's'} to add to the house manual.` : "I couldn't find any rules in that note.",
          conflicts ? `${conflicts} of them disagree${conflicts === 1 ? 's' : ''} with what's already saved.` : '',
          out.dropped_secrets ? "I left out codes and passwords, which I never store." : '',
          n ? 'Please check and confirm them on your phone before tonight.' : '',
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
      description:
        "Answers a carer's question using only the parents' own words (food, bedtime, screen time, rules, pets). For food and medicine it also returns a guard sentence that must be said. If `emergency` is true, call the `emergency` tool right away. If `allergy_alert` is set, read it aloud: the parents have been alerted.",
      inputSchema: {
        question: z.string().trim().min(1).max(MAX_TEXT).describe("The carer's question, in their words"),
        question_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language. Safety rules read it.'),
      },
      _meta: ui,
    },
    async ({ question: said, question_english }) => {
      // Safety rules read the English rendering when there is one; an emergency in either language counts.
      const question = question_english || said;
      if (isEmergency(said) || isEmergency(question)) {
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
      const lines = a.facts.map((f) =>
        f.source === 'parent_answer' ? `Earlier ${f.said_by} answered this. ${f.text}` : `${f.said_by} said: "${f.text}"`,
      );
      if (!a.exact) lines.unshift("The parents haven't said exactly. Here's what's closest.");
      if (a.guard) lines.push(a.guard);
      // Shadow Parent: on low-risk questions the manual doesn't settle, say how the parents usually answer.
      const shadow = a.suggest_ask_parent && !a.guard ? shadowSuggestion(db, question) : null;
      const busy = busyUntil(db);
      if (shadow) lines.push(shadow.message);
      else if (!a.facts.length && !a.guard) lines.push("The parents haven't covered this. I can ask them.");
      if (busy && a.suggest_ask_parent) lines.push(`The parents asked for urgent questions only until ${clockTime(busy)}.`);
      return localized('answer', { ...a, shadow, busy_until: busy ? clockTime(busy) : null }, lines.join(' '));
    },
  );

  server.registerTool(
    'where_is',
    {
      title: 'Where is something',
      description: 'Finds where something is kept in the house (EpiPen, first aid kit, pyjamas, dog food) and shows the parents\' photo if there is one.',
      inputSchema: { item: z.string().trim().min(1).max(100) },
      annotations: { readOnlyHint: true },
      _meta: ui,
    },
    async ({ item }) => {
      if (isEmergency(item)) return plain('answer', { category: 'emergency', facts: [], guard: null, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      const loc = whereIs(db, item);
      if (!loc)
        return localized('answer', { category: 'general', facts: [], guard: null, found: false, suggest_ask_parent: true }, `The parents haven't said where the ${item} is. I can ask them.`);
      return localized('location', { ...loc, photo_url: abs(loc.photo_url) }, `${loc.item}: ${loc.description}`);
    },
  );

  server.registerTool(
    'log_event',
    {
      title: 'Log the evening',
      description:
        'Records something that happened during the handoff, in the carer\'s words ("asleep at 8:10", "woke up crying at 9"). The parents see it in the morning summary. If the result has `emergency: true`, call the `emergency` tool right away. If it has an `allergy_alert`, read it aloud.',
      inputSchema: {
        text: z.string().min(1).max(MAX_TEXT),
        text_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language'),
        kind: z.enum(['sleep', 'food', 'mood', 'health', 'pet', 'note']).default('note'),
      },
    },
    async ({ text: said, text_english, kind }) => {
      const text = text_english || said;
      if (!activeHandoff(db)) {
        return { content: [{ type: 'text', text: 'There is no handoff in progress, so there is nothing to log yet.' }], isError: true };
      }
      const ev = logEvent(db, text_english ? `${said} (${text_english})` : said, kind);
      // Logging must never bypass the safety checks the carer would get by asking.
      if (isEmergency(text) || isEmergency(said)) {
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
      return { content: [{ type: 'text', text: `Logged: ${ev.text}` }], structuredContent: { view: 'logged', event: ev } };
    },
  );

  server.registerTool(
    'ask_parent',
    {
      title: 'Ask a parent',
      description:
        "Sends the carer's question to a parent's phone when the manual doesn't answer it. Returns immediately with a question id; use `check_parent_answer` to see the reply. Hosts that support MCP tasks should prefer `ask_parent_and_wait`.",
      inputSchema: {
        question: z.string().trim().min(1).max(MAX_TEXT),
        question_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language'),
      },
      _meta: ui,
    },
    async ({ question, question_english }) => {
      const q = createQuestion(db, question, null, undefined, question_english ?? null);
      const who = currentContactFor(db, q);
      const emergency = isEmergency(question) || (question_english ? isEmergency(question_english) : false);
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
      inputSchema: { question_id: z.number().int().positive() },
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
      return localized('question', { ...q, asked: who ? `${who.name} (${who.relation})` : 'a parent' }, text);
    },
  );

  // Long-running version: an MCP task that completes when a parent answers,
  // and moves down the contact chain if nobody answers in time.
  server.experimental.tasks.registerToolTask(
    'ask_parent_and_wait',
    {
      title: 'Ask a parent and wait for the answer',
      description:
        "Sends the carer's question to the parents and runs as a task until someone answers. If the first contact doesn't answer in time, the next contact is asked.",
      inputSchema: {
        question: z.string().trim().min(1).max(MAX_TEXT),
        question_english: z.string().trim().max(MAX_TEXT).optional().describe('English rendering if the carer spoke another language'),
      },
      execution: { taskSupport: 'required' },
      _meta: ui,
    },
    {
      async createTask({ question, question_english }, { taskStore: store, taskRequestedTtl }) {
        // Between 1 minute and 6 hours, whatever the client asks for.
        const ttl = Math.min(Math.max(taskRequestedTtl ?? 60 * 60 * 1000, 60_000), 6 * 60 * 60 * 1000);
        const task = await store.createTask({ ttl, pollInterval: 2000 });
        const q = createQuestion(db, question, task.taskId, undefined, question_english ?? null);
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
              structuredContent: { view: 'question', ...getQuestion(db, q.id), asked: first?.name ?? 'a parent' },
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
              content: [{ type: 'text', text: `${answered.answered_by} said: "${answered.answer}"` }],
              structuredContent: { view: 'question', ...getQuestion(db, q.id), asked: answered.answered_by },
            })
            .catch(() => {});
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
        return (await store.getTaskResult(taskId)) as CallToolResult;
      },
    },
  );

  server.registerTool(
    'emergency',
    {
      title: 'Emergency',
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
      const english = `${e.say_first} The address is ${e.address}. ${e.action_plan.steps[0]?.text ?? ''}`;
      // Emergencies never wait for an AI: a fixed translation of the first line if we have one, English otherwise.
      return plain('emergency', { ...e, language: lang, spoken: fixed ? `${fixed} ${e.address}` : null }, fixed ? `${fixed} ${e.address}. ${english}` : english);
    },
  );

  server.registerTool(
    'end_handoff',
    {
      title: 'End the handoff',
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
      const text = [
        `Evening with ${h.carer_name}: ${plural(d.timeline.length, 'note')}, ${plural(questions.length, 'question')}.`,
        ...d.insights,
        d.rule_suggestions.length ? `${plural(d.rule_suggestions.length, "of tonight's answers")} could become house rules; they're on your phone.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return localized('summary', { carer: h.carer_name, timezone: householdTz(db), timeline: d.timeline, questions, insights: d.insights, rule_suggestions: d.rule_suggestions, supplies: d.supplies }, text);
    },
  );

  return server;
}
