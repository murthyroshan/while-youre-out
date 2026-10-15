// A Gemini-powered stand-in for the Alexa+ language model. It understands free speech in any
// language, decides which of the add-on's MCP tools to call, and calls them through the real MCP
// client. The API key stays on the server (/host/llm).
//
// Safety design: what the device SAYS is the server's own reply text (the parents' words, the
// food/medicine guards, the emergency script, already translated by the server), never the
// model's paraphrase. The model only chooses tools and handles small talk. Emergencies are caught
// by the same deterministic rules as the server before the model is even asked.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isEmergency } from '../../../server/src/domain/safety';
import { HOST_SYSTEM as SYSTEM } from '../../../server/src/ai/hostPrompt';
import { emergencyAction } from './rules';
import { textOf, type ToolResult } from '../mcp';
import type { Brain, DeviceIO } from './types';

type Part = Record<string, any>;
type Content = { role: 'user' | 'model'; parts: Part[] };

export interface GeminiBrainOptions {
  /** e.g. http://127.0.0.1:8787 */
  serverOrigin: string;
  tools: () => Tool[];
  /** The MCP server's own instructions (from initialize). */
  instructions: () => string | undefined;
  /** Used for one turn when the model is unavailable (quota, network). */
  fallback: Brain;
  fetchImpl?: typeof fetch;
}

// Tools the model should not use directly: the task version of ask_parent is preferred.
const HIDDEN_TOOLS = new Set(['ask_parent', 'check_parent_answer']);
/** MCP Apps: a tool whose visibility leaves out "model" is only for cards and the host. */
const modelCanUse = (t: Tool) => {
  const visibility = (t._meta as { ui?: { visibility?: unknown } } | undefined)?.ui?.visibility;
  return !HIDDEN_TOOLS.has(t.name) && (!Array.isArray(visibility) || visibility.includes('model'));
};
const DEVICE_FUNCTIONS = [
  {
    name: 'call_contact',
    description: 'Places an Alexa call to one of the family\'s contacts ("call Mom", "phone Anita"). Use the words they used for the person.',
    parametersJsonSchema: { type: 'object', properties: { who: { type: 'string', description: 'Who to call, e.g. "Mom" or "Anita"' } }, required: ['who'] },
  },
];
const MAX_HISTORY = 24;
const MAX_ROUNDS = 3;
// Past this, the rule brain answers instead: a device that goes quiet feels broken.
const MODEL_TIMEOUT_MS = 7_000;
// Tools that only set something up: the model still has to act on what was said.
const SETUP_TOOLS = new Set(['set_carer_language']);

function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$schema') continue;
    out[k] = cleanSchema(v);
  }
  return out;
}

/** Keeps tool results small: the model needs the gist, the card shows the rest. */
function forModel(r: ToolResult) {
  const data = { ...(r.structuredContent ?? {}) } as Record<string, any>;
  for (const k of ['paramedic_sheet', 'action_plan', 'timeline', 'plan', 'items', 'since_last_visit', 'english']) {
    if (k in data) data[k] = Array.isArray(data[k]) ? `(${data[k].length} items shown on screen)` : '(shown on screen)';
  }
  const json = JSON.stringify(data);
  return { text: textOf(r), isError: Boolean(r.isError), data: json.length > 1500 ? `${json.slice(0, 1500)}…` : data };
}

export class GeminiBrain implements Brain {
  readonly name = 'Gemini (via the server)';
  private history: Content[] = [];
  private inEmergency = false;
  private fetchImpl: typeof fetch;

  constructor(private opts: GeminiBrainOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  private functions() {
    return [
      ...this.opts
        .tools()
        .filter(modelCanUse)
        .map((t) => ({ name: t.name, description: (t.description ?? '').slice(0, 1000), parametersJsonSchema: cleanSchema(t.inputSchema) })),
      // Things the device does itself, like Alexa calling.
      ...DEVICE_FUNCTIONS,
    ];
  }

  private async callModel(): Promise<{ parts: Part[] }> {
    const system = [SYSTEM, this.opts.instructions()].filter(Boolean).join('\n\nAdd-on instructions: ');
    const res = await this.fetchImpl(`${this.opts.serverOrigin}/host/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system, contents: this.history.slice(-MAX_HISTORY), functions: this.functions() }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `LLM proxy ${res.status}`);
    return (await res.json()) as { parts: Part[] };
  }

  /** A turn another brain answered, so the model knows what was said ("What is Maya allergic to?"). */
  note(user: string, said: string[]) {
    const u = user.trim();
    if (!u) return;
    this.remember({ role: 'user', parts: [{ text: u }] });
    if (said.length) this.remember({ role: 'model', parts: [{ text: said.join(' ') }] });
  }

  private remember(content: Content) {
    this.history.push(content);
    // Never cut between a model's function call and its response.
    while (this.history.length > MAX_HISTORY || (this.history[0] && this.history[0].role !== 'user') || this.history[0]?.parts.some((p) => p.functionResponse)) {
      this.history.shift();
    }
  }

  async handle(raw: string, io: DeviceIO) {
    const u = raw.trim().replace(/^(hey |ok |okay )?alexa[,.!\s]*/i, '').trim();
    if (!u) return;

    // During an emergency, "done" / "next" / "it's over" move the fixed guide on without the model.
    const step = this.inEmergency ? emergencyAction(u) : null;
    if (step) {
      const r = await io.tool('emergency_step', { action: step });
      if (r.isError || r.structuredContent?.resolved) this.inEmergency = false;
      this.remember({ role: 'user', parts: [{ text: u }] });
      this.remember({ role: 'model', parts: [{ text: textOf(r) }] });
      return io.say(textOf(r));
    }

    // Safety first, deterministically, before any model call.
    if (isEmergency(u)) {
      this.inEmergency = true;
      const e = await io.tool('emergency', { description: u });
      this.remember({ role: 'user', parts: [{ text: u }] });
      this.remember({ role: 'model', parts: [{ text: textOf(e) }] });
      return io.say(textOf(e));
    }

    const startLength = this.history.length;
    this.remember({ role: 'user', parts: [{ text: u }] });
    const spoken: string[] = [];
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const { parts } = await this.callModel();
        this.remember({ role: 'model', parts });
        const calls = parts.filter((p) => p.functionCall);
        if (!calls.length) {
          // Nothing from a tool to say this turn: the model's own reply (small talk, a clarifying question).
          const text = parts.map((p) => p.text ?? '').join(' ').trim();
          if (!spoken.length && text) spoken.push(text);
          break;
        }
        const responses: Part[] = [];
        let handoffStarted = false;
        for (const c of calls) {
          const { name, args = {}, id } = c.functionCall as { name: string; args?: Record<string, unknown>; id?: string };
          let response: unknown;
          if (name === 'call_contact') {
            const who = String(args.who ?? 'a parent');
            const calling = io.call ? await io.call(who) : null;
            response = calling ? { calling } : { error: "This device can't make calls." };
            spoken.push(calling ? `Calling ${calling}.` : "This device can't make calls.");
          } else if (name === 'ask_parent_and_wait') {
            io.task(name, args, (result) => io.say(textOf(result)));
            response = { text: 'Question sent to the parents. The answer will be announced when it arrives.' };
            spoken.push('Okay, I\'m asking now. I\'ll tell you when they answer.');
          } else {
            const r = await io.tool(name, args);
            response = forModel(r);
            const s = r.structuredContent ?? {};
            // Someone at the door: the parents get the photo, decided by the add-on, not left to the model.
            if (name === 'door_check' && s.ask_parent?.door_event_id) {
              io.task('ask_parent_and_wait', { question: s.ask_parent.question, door_event_id: s.ask_parent.door_event_id }, (result) => io.say(textOf(result)));
              response = { ...forModel(r), parents_asked: true };
            }
            // Something ran out: the device asks the parents to add it to the shopping list.
            if (name === 'log_event' && s.shopping_ask?.shopping_item) {
              io.task('ask_parent_and_wait', { question: s.shopping_ask.question, shopping_item: s.shopping_ask.shopping_item }, (result) => io.say(textOf(result)));
              response = { ...forModel(r), parents_asked: true };
            }
            if (name === 'emergency') this.inEmergency = true;
            if (name === 'start_handoff' && !r.isError && s.view !== 'handoff_cancelled') handoffStarted = true;
            if (s.emergency && name !== 'emergency') {
              this.inEmergency = true;
              const e = await io.tool('emergency', { description: String(args.question ?? args.text ?? u), description_english: args.question_english ?? args.text_english });
              spoken.push(textOf(e));
              response = { ...forModel(r), emergency_handled: true };
            } else if (textOf(r)) {
              spoken.push(textOf(r));
            }
          }
          responses.push({ functionResponse: { name, ...(id ? { id } : {}), response } });
        }
        this.remember({ role: 'user', parts: responses });
        // Straight into the teach-back check, like the rule brain: no second model call needed.
        if (handoffStarted && !calls.some((c) => c.functionCall.name === 'teachback')) {
          const tb = await io.tool('teachback', {});
          if (!tb.isError && textOf(tb)) spoken.push(textOf(tb));
        }
        // The device speaks the tools' own words, so once a tool has answered the turn is done.
        // Asking the model again would only double the wait (and the free-tier quota) for nothing.
        if (spoken.length && !calls.every((c) => SETUP_TOOLS.has(c.functionCall.name))) {
          this.remember({ role: 'model', parts: [{ text: spoken.join(' ') }] });
          break;
        }
      }
    } catch {
      // The model is unavailable (quota, network): answer this one with the rule brain.
      this.history.length = Math.min(this.history.length, startLength);
      return this.opts.fallback.handle(raw, io);
    }
    io.say(spoken.join(' ') || "Sorry, I didn't catch that.");
  }
}
