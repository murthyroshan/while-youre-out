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
const MAX_HISTORY = 24;
const MAX_ROUNDS = 5;

const SYSTEM = `You are Alexa+ on an Echo Show in a family home, running the "While You're Out" add-on.
The parents may hand the home over to a carer (a babysitter, grandparent or nanny). Everything about the children, pets and house comes ONLY from the add-on's tools. Never invent rules, times, foods, medicines or advice.

How to act:
- A parent saying someone is babysitting, watching or looking after the kids: call start_handoff with the carer's name. Only pass a language if the parent explicitly said one ("she speaks Hindi" -> hi-IN); never guess a language from a name. Then call teachback with no arguments to start the quick check.
- While the teach-back check is running, pass the carer's replies to teachback as answer (or skip=true).
- Questions about food, bedtime, screen time, rules, pets, the house: call ask_house with the carer's words.
- "Where is ...": call where_is.
- Things that happened ("she's asleep", "napped till 5", "used the last diaper"): call log_event.
- "What's next?" or the plan: call tonight_plan.
- Any question about what the child may do (TV, play, staying up, food...) goes to ask_house FIRST, even if it sounds like a request for a parent. It may include how the parents usually answer.
- Call ask_parent_and_wait only after ask_house, when the carer then asks you to check with a parent or says yes to your offer.
- Anything that sounds like an emergency: call emergency immediately.
- The parents are back / "end the handoff": confirm, then call end_handoff.
- A dictated note from a parent ("remember: ..."): call import_note.

Languages: if the carer speaks another language, call set_carer_language with its BCP-47 code (hi-IN, es-US, ta-IN, ...) once, and always pass an English rendering in question_english / text_english / answer_english / description_english so the add-on's safety rules can read it.

Speaking: keep replies to one or two short sentences, in the language the person spoke. Don't repeat what a tool already said.`;

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
  private fetchImpl: typeof fetch;

  constructor(private opts: GeminiBrainOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  private functions() {
    return this.opts
      .tools()
      .filter((t) => !HIDDEN_TOOLS.has(t.name))
      .map((t) => ({ name: t.name, description: (t.description ?? '').slice(0, 1000), parametersJsonSchema: cleanSchema(t.inputSchema) }));
  }

  private async callModel(): Promise<{ parts: Part[] }> {
    const system = [SYSTEM, this.opts.instructions()].filter(Boolean).join('\n\nAdd-on instructions: ');
    const res = await this.fetchImpl(`${this.opts.serverOrigin}/host/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system, contents: this.history.slice(-MAX_HISTORY), functions: this.functions() }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `LLM proxy ${res.status}`);
    return (await res.json()) as { parts: Part[] };
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

    // Safety first, deterministically, before any model call.
    if (isEmergency(u)) {
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
        for (const c of calls) {
          const { name, args = {}, id } = c.functionCall as { name: string; args?: Record<string, unknown>; id?: string };
          let response: unknown;
          if (name === 'ask_parent_and_wait') {
            io.task(name, args, (result) => io.say(textOf(result)));
            response = { text: 'Question sent to the parents. The answer will be announced when it arrives.' };
            spoken.push('Okay, I\'m asking now. I\'ll tell you when they answer.');
          } else {
            const r = await io.tool(name, args);
            response = forModel(r);
            const s = r.structuredContent ?? {};
            if (s.emergency && name !== 'emergency') {
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
      }
    } catch {
      // The model is unavailable (quota, network): answer this one with the rule brain.
      this.history.length = Math.min(this.history.length, startLength);
      return this.opts.fallback.handle(raw, io);
    }
    io.say(spoken.join(' ') || "Sorry, I didn't catch that.");
  }
}
