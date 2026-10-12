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
  logEvent,
  startHandoff,
  visibleFacts,
  whereIs,
  type Role,
} from '../domain/house.js';
import { startEmergency } from '../domain/emergency.js';
import { CARD_HTML, CARD_MIME, CARD_URI } from './card.js';

export interface ServerDeps {
  db: DB;
  taskStore: TaskStore;
  /** How long a contact has to answer before the next one is asked. */
  escalateAfterMs: number;
  /** Public origin of this server, used to turn photo paths into absolute URLs. */
  publicUrl: string;
}

const ui = { ui: { resourceUri: CARD_URI }, 'ui/resourceUri': CARD_URI };

function result(view: string, data: Record<string, unknown>, text: string): CallToolResult {
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

export function buildServer({ db, taskStore, escalateAfterMs, publicUrl }: ServerDeps) {
  const abs = (path: string | null) => (path ? new URL(path, publicUrl).href : null);

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
      const text = [
        `Handoff started for ${h.carer_name}.`,
        b.must_know.length ? `Most important: ${b.must_know.join(' ')}` : '',
        b.epipen ? `The EpiPen is here: ${b.epipen}` : '',
        b.bedtime.length ? `Bedtime: ${b.bedtime.join(' ')}` : '',
        b.first_contact ? `If anything comes up, ${b.first_contact} is first to call.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return result('briefing', { carer: h.carer_name, language: h.language, ...b }, text);
    },
  );

  server.registerTool(
    'ask_house',
    {
      title: 'Ask the house manual',
      description:
        "Answers a carer's question using only the parents' own words (food, bedtime, screen time, rules, pets). For food and medicine it also returns a guard sentence that must be said. If `emergency` is true, call the `emergency` tool right away. If `allergy_alert` is set, read it aloud: the parents have been alerted.",
      inputSchema: { question: z.string().trim().min(1).max(MAX_TEXT).describe("The carer's question, in their words") },
      _meta: ui,
    },
    async ({ question }) => {
      const a = answerQuestion(db, question, VOICE_ROLE);
      if (a.emergency) {
        return result('answer', { ...a }, 'This sounds like an emergency. Call the emergency tool now.');
      }
      // "She already ate a peanut butter cookie, is she ok?" is an exposure, not a question about food.
      const allergens = INGESTED.test(question) ? allergenMentions(db, question) : [];
      if (allergens.length) {
        const alert = allergyAlert(question, allergens);
        return result('answer', { ...a, allergy_alert: alert, allergens }, alert);
      }
      const lines = a.facts.map((f) =>
        f.source === 'parent_answer' ? `Earlier ${f.said_by} answered this. ${f.text}` : `${f.said_by} said: "${f.text}"`,
      );
      if (!a.exact) lines.unshift("The parents haven't said exactly. Here's what's closest.");
      if (a.guard) lines.push(a.guard);
      if (!a.facts.length && !a.guard) lines.push("The parents haven't covered this. I can ask them.");
      return result('answer', { ...a }, lines.join(' '));
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
      if (isEmergency(item)) return result('answer', { category: 'emergency', facts: [], guard: null, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      const loc = whereIs(db, item);
      if (!loc)
        return result('answer', { category: 'general', facts: [], guard: null, found: false, suggest_ask_parent: true }, `The parents haven't said where the ${item} is. I can ask them.`);
      return result('location', { ...loc, photo_url: abs(loc.photo_url) }, `${loc.item}: ${loc.description}`);
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
        kind: z.enum(['sleep', 'food', 'mood', 'health', 'pet', 'note']).default('note'),
      },
    },
    async ({ text, kind }) => {
      if (!activeHandoff(db)) {
        return { content: [{ type: 'text', text: 'There is no handoff in progress, so there is nothing to log yet.' }], isError: true };
      }
      const ev = logEvent(db, text, kind);
      // Logging must never bypass the safety checks the carer would get by asking.
      if (isEmergency(text)) {
        return result('logged', { event: ev, emergency: true }, 'This sounds like an emergency. Call the emergency tool now.');
      }
      const allergens = allergenMentions(db, text);
      if (allergens.length) {
        const alert = allergyAlert(text, allergens);
        return result('logged', { event: ev, allergy_alert: alert, allergens }, alert);
      }
      // Medicine given without a parent's say-so: the parents hear about it now, not in the morning.
      if (mentionsMedicine(text)) {
        const rule = visibleFacts(db, 'carer').find((f) => f.category === 'medicine');
        const q = createQuestion(db, `Urgent: ${activeHandoff(db)?.carer_name ?? 'The carer'} logged "${text}"`, null, 'urgent');
        const who = currentContactFor(db, q);
        const alert = `${rule ? `${rule.author}'s rule: "${rule.text}" ` : ''}I've let ${who?.name ?? 'the parents'} know.`;
        return result('logged', { event: ev, medicine_alert: alert }, `Logged. ${alert}`);
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
      inputSchema: { question: z.string().trim().min(1).max(MAX_TEXT) },
      _meta: ui,
    },
    async ({ question }) => {
      const q = createQuestion(db, question);
      const who = currentContactFor(db, q);
      const emergency = isEmergency(question);
      return result(
        'question',
        { id: q.id, text: q.text, status: q.status, urgency: q.urgency, asked: who ? `${who.name} (${who.relation})` : 'a parent', emergency },
        emergency
          ? `This sounds like an emergency. Call the emergency tool now. I've also told ${who?.name ?? 'the parents'}.`
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
      return result('question', { ...q, asked: who ? `${who.name} (${who.relation})` : 'a parent' }, text);
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
      inputSchema: { question: z.string().trim().min(1).max(MAX_TEXT) },
      execution: { taskSupport: 'required' },
      _meta: ui,
    },
    {
      async createTask({ question }, { taskStore: store, taskRequestedTtl }) {
        // Between 1 minute and 6 hours, whatever the client asks for.
        const ttl = Math.min(Math.max(taskRequestedTtl ?? 60 * 60 * 1000, 60_000), 6 * 60 * 60 * 1000);
        const task = await store.createTask({ ttl, pollInterval: 2000 });
        const q = createQuestion(db, question, task.taskId);
        attachTask(db, q.id, task.taskId);
        const first = currentContactFor(db, q);
        await store.updateTaskStatus(task.taskId, 'working', `Asked ${first?.name ?? 'a parent'}`);

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
      inputSchema: { description: z.string().trim().min(1).max(MAX_TEXT).describe('What the carer said is happening') },
      _meta: { ...ui, ui: { resourceUri: CARD_URI, preferredDisplayMode: 'fullscreen' } },
    },
    async ({ description }) => {
      const e = startEmergency(db, description);
      e.epipen_photo = abs(e.epipen_photo);
      return result('emergency', e, `${e.say_first} The address is ${e.address}. ${e.action_plan.steps[0]?.text ?? ''}`);
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
      const log = eveningLog(db);
      const h = endHandoff(db);
      if (!h) return { content: [{ type: 'text', text: 'There is no handoff in progress.' }] };
      const qs = db.prepare('SELECT text, status, answer, answered_by FROM questions WHERE handoff_id = ? ORDER BY id').all(h.id) as Array<{
        text: string;
        status: string;
        answer: string | null;
        answered_by: string | null;
      }>;
      // Raw timestamps: the card formats them in the viewer's own time zone.
      const timeline = log.map((e) => ({ at: e.at, text: e.text, kind: e.kind }));
      const questions = qs.map((q) => (q.answer ? `${q.text} → ${q.answered_by}: "${q.answer}"` : `${q.text} (unanswered)`));
      return result(
        'summary',
        { carer: h.carer_name, timeline, questions },
        `Evening with ${h.carer_name}: ${plural(timeline.length, 'note')}, ${plural(questions.length, 'question')}.`,
      );
    },
  );

  return server;
}
