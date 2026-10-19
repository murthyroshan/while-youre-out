// The add-on on today's Alexa, through a classic custom skill (Alexa-hosted, free): the skill is an
// MCP host, like Alexa+. Each turn it connects to the add-on over MCP (Streamable HTTP), lets the
// simulator's rule brain turn what was said into tool calls, speaks the result, and shows the card
// on an Echo Show in APL. Every Alexa user gets their own demo house, named by a hash of their
// Alexa user id, so nothing personal is sent to the add-on.
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { RuleBrain } from '../../simulator/src/brain/rules';
import type { ToolResult } from '../../simulator/src/mcp';
import { aplDirective, cardModel } from './apl';

/** The hosted demo. The skill is code-only, so the address lives here. */
export const SERVER = 'https://while-youre-out-wpj3.onrender.com';
/** Alexa waits 8 seconds for a skill; a free host that is waking up can take longer. */
const BUDGET_MS = 6_500;

export interface AlexaRequest {
  version?: string;
  session?: { new?: boolean; attributes?: Record<string, any>; user?: { userId?: string } };
  context?: {
    System?: { user?: { userId?: string }; device?: { supportedInterfaces?: Record<string, unknown> } };
    Viewport?: { pixelWidth?: number };
  };
  request: {
    type: string;
    locale?: string;
    intent?: { name: string; slots?: Record<string, { value?: string }> };
    arguments?: unknown[];
  };
}

const HELP = "I keep the parents' notes for whoever is looking after the kids. Say \"Priya is babysitting tonight\" to start, then ask anything, like \"where's the EpiPen?\". Say \"emergency\" anytime.";

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textOf = (r: ToolResult) => r.content.map((c) => c.text ?? '').join(' ').trim();

/** What was said, from whichever request carries it. */
function utteranceOf(req: AlexaRequest['request']): string | null {
  if (req.type === 'Alexa.Presentation.APL.UserEvent') return typeof req.arguments?.[0] === 'string' ? (req.arguments[0] as string) : null;
  if (req.type !== 'IntentRequest' || !req.intent) return null;
  const said = req.intent.slots?.utterance?.value;
  switch (req.intent.name) {
    case 'UtteranceIntent':
      return said ?? null;
    case 'AMAZON.YesIntent':
      return 'yes';
    case 'AMAZON.NoIntent':
      return 'no';
    case 'AMAZON.HelpIntent':
      return 'what can you do?';
    default:
      return null;
  }
}

export async function handle(event: AlexaRequest, opts: { server?: string } = {}) {
  const req = event.request;
  if (req.type === 'SessionEndedRequest') return { version: '1.0', response: {} };
  const name = req.intent?.name;
  if (name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent' || name === 'AMAZON.NavigateHomeIntent') {
    return respond(['Okay.'], null, event, { end: true });
  }
  const said = utteranceOf(req);
  if (req.type === 'IntentRequest' && !said) {
    return respond(["Sorry, I didn't catch that. Try \"where's the EpiPen?\" or \"what's next?\""], null, event, { attributes: event.session?.attributes });
  }

  const userId = event.context?.System?.user?.userId ?? event.session?.user?.userId ?? 'anonymous';
  const house = `${(opts.server ?? SERVER).replace(/\/$/, '')}/h/${createHash('sha256').update(`wyo:${userId}`).digest('hex').slice(0, 32)}`;
  const brain = new RuleBrain();
  brain.restore(event.session?.attributes?.brain);
  const speech: string[] = [];
  let card: ToolResult | null = null;
  let parentLink: string | null = null;
  let lang: string | undefined = event.session?.attributes?.lang;
  const client = new Client({ name: 'while-youre-out-alexa-skill', version: '1.0.0' });
  const deadline = AbortSignal.timeout(BUDGET_MS);
  const transport = new StreamableHTTPClientTransport(new URL(`${house}/mcp`), { requestInit: { signal: deadline } });
  try {
    const pending: Array<Promise<void>> = [];
    await client.connect(transport);
    const io = {
      say: (t: string) => void speech.push(t),
      tool: async (tool: string, args: Record<string, unknown> = {}) => {
        const r = (await client.callTool({ name: tool, arguments: args }, undefined, { signal: deadline })) as ToolResult;
        if (r.structuredContent?.view) card = r;
        return r;
      },
      // A skill can't wait for a parent between turns: the question is sent, and the answer is
      // told at the start of the next reply (the add-on's own notices).
      task: (tool: string, args: Record<string, unknown>) => {
        pending.push(
          (async () => {
            // The client sends a call as a task only once it has seen that the tool runs as one.
            await client.listTools(undefined, { signal: deadline });
            for await (const msg of client.experimental.tasks.callToolStream({ name: tool, arguments: args }, undefined, { signal: deadline })) {
              if (msg.type === 'taskCreated' || msg.type === 'result' || msg.type === 'error') break;
            }
          })().catch(() => {}),
        );
      },
    };
    if (said) {
      await brain.handle(said, io);
    } else {
      // "Alexa, open While You're Out": tonight's screen, and how to start.
      const home = await io.tool('home_screen', {});
      // The parent link goes to the Alexa app, so someone can be Mom on their phone.
      const config = (await (await fetch(`${house}/demo/config`, { signal: deadline })).json().catch(() => ({}))) as { parent_url?: string };
      if (config.parent_url?.startsWith('/')) parentLink = `${house}${config.parent_url}`;
      speech.push(home.structuredContent?.carer ? textOf(home) : `While You're Out is ready. ${HELP}`);
    }
    await Promise.all(pending);
    // A Hindi Echo: the sitter speaks Hindi, so from now on the add-on answers in Hindi (once a
    // handoff is on; until then there's nobody to switch).
    if (said && event.request.locale?.startsWith('hi') && lang !== 'hi') {
      const r = await client.callTool({ name: 'set_carer_language', arguments: { language: 'hi-IN' } }, undefined, { signal: deadline }).catch(() => null);
      if (r && !(r as ToolResult).isError) lang = 'hi';
    }
  } catch {
    speech.splice(0, speech.length, "The house is waking up. Ask me again in a few seconds.");
    card = null;
  } finally {
    // Hang up properly, so the add-on knows nobody is waiting on this session any more.
    await transport.terminateSession().catch(() => {});
    void client.close().catch(() => {});
  }
  return respond(speech.length ? speech : ['Okay.'], card, event, { attributes: { brain: brain.snapshot(), ...(lang ? { lang } : {}) }, appCard: parentLink });
}

function respond(
  speech: string[],
  card: ToolResult | null,
  event: AlexaRequest,
  opts: { end?: boolean; attributes?: Record<string, unknown>; appCard?: string | null } = {},
) {
  const text = speech.join(' ').replace(/\s+/g, ' ').trim();
  const apl = Boolean(event.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']);
  const directives =
    apl && !opts.end
      ? [aplDirective(cardModel(card?.structuredContent, text), { pixelWidth: event.context?.Viewport?.pixelWidth, large: card?.structuredContent?.text_size === 'large' })]
      : [];
  return {
    version: '1.0',
    sessionAttributes: opts.attributes ?? {},
    response: {
      outputSpeech: { type: 'SSML', ssml: `<speak>${xml(text)}</speak>` },
      ...(opts.end ? {} : { reprompt: { outputSpeech: { type: 'PlainText', text: 'Anything else? Say "emergency" anytime.' } } }),
      ...(opts.appCard ? { card: { type: 'Simple', title: "While You're Out", content: `Be the parent on your phone: ${opts.appCard}` } } : {}),
      ...(directives.length ? { directives } : {}),
      shouldEndSession: Boolean(opts.end),
    },
  };
}
