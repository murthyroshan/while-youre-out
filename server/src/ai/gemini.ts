// Minimal Gemini REST client: structured JSON output, image/PDF input, and fallback across
// models because the free tier often answers "high demand, try again later".
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
if (!process.env.GEMINI_API_KEY && existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // A malformed .env file just means no key; callers report that clearly.
  }
}

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// The first three are asked at once: two strong models plus a fast, rarely busy one.
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-lite-latest', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.5-flash'];

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export class AiUnavailableError extends Error {}

export interface JsonRequest {
  system: string;
  parts: Part[];
  /** JSON Schema for the response. */
  schema: Record<string, unknown>;
  timeoutMs?: number;
}

export interface AiClient {
  readonly available: boolean;
  generateJson<T>(req: JsonRequest): Promise<{ data: T; model: string }>;
}

export interface ChatRequest {
  system: string;
  /** Gemini `contents`: user, model and function-response turns, passed through as-is. */
  contents: unknown[];
  /** Gemini `functionDeclarations`. */
  functions: unknown[];
}

// Models whose free-tier quota is used up (Google says when it resets): skipped until then, so a
// spent key fails in milliseconds instead of making the device wait.
const exhaustedUntil = new Map<string, number>();
const CHAT_TIMEOUT_MS = 8_000;

/** Out of quota: skip this model until Google says it resets. */
function noteQuota(model: string, json: any) {
  // "retryDelay": "25532s" for a daily quota; a per-minute limit says a few seconds.
  const delay = (json?.error?.details ?? []).find((d: any) => String(d?.['@type']).endsWith('RetryInfo'))?.retryDelay;
  const seconds = Math.min(24 * 3600, Math.max(30, parseFloat(String(delay ?? '60')) || 60));
  exhaustedUntil.set(model, Date.now() + seconds * 1000);
}

/** For tests. */
export function resetChatQuota() {
  exhaustedUntil.clear();
}

/**
 * One turn of function-calling chat, used by the simulator's "Alexa" brain through the server so
 * the API key never reaches a browser. Tries one model at a time (racing would spend quota 3x).
 */
export async function geminiChat(req: ChatRequest, fetchImpl: typeof fetch = fetch): Promise<{ parts: unknown[]; model: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AiUnavailableError('GEMINI_API_KEY is not set. Add it to server/.env.');
  // gemini-flash-lite-latest is left out: it often hangs on large tool lists.
  const all = process.env.WYO_GEMINI_CHAT_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash'];
  const models = all.filter((m) => (exhaustedUntil.get(m) ?? 0) <= Date.now());
  if (!models.length) throw new AiUnavailableError('The Gemini key has used its free quota for now.');
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    tools: req.functions.length ? [{ functionDeclarations: req.functions }] : undefined,
    generationConfig: { temperature: 0.2 },
  });
  const errors: string[] = [];
  for (const model of models) {
    try {
      const res = await fetchImpl(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        errors.push(`${model}: ${res.status} ${json?.error?.message?.slice(0, 100) ?? ''}`);
        if (res.status === 429) noteQuota(model, json);
        if ((res.status === 400 && /api key/i.test(json?.error?.message ?? '')) || res.status === 403) break;
        continue;
      }
      const parts = json.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts) || !parts.length) {
        errors.push(`${model}: empty (${json.candidates?.[0]?.finishReason ?? 'unknown'})`);
        continue;
      }
      return { parts, model };
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new AiUnavailableError(`No Gemini model could answer right now. ${errors.join(' | ')}`);
}

export function geminiFromEnv(): AiClient {
  const key = process.env.GEMINI_API_KEY?.trim();
  const models = process.env.WYO_GEMINI_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? DEFAULT_MODELS;
  return {
    available: Boolean(key),
    async generateJson<T>({ system, parts, schema, timeoutMs = 20_000 }: JsonRequest) {
      if (!key) throw new AiUnavailableError('GEMINI_API_KEY is not set. Add it to server/.env.');
      const usable = models.filter((m) => (exhaustedUntil.get(m) ?? 0) <= Date.now());
      if (!usable.length) throw new AiUnavailableError('The Gemini key has used its free quota for now.');
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0 },
      });
      const errors: string[] = [];
      let fatal = false;

      const attempt = async (model: string, signal: AbortSignal): Promise<{ data: T; model: string }> => {
        const res = await fetch(`${API}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
          body,
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) {
          const msg = json?.error?.message ?? '';
          // A bad key won't work on any model, so stop trying.
          if ((res.status === 400 && /api key/i.test(msg)) || res.status === 403) fatal = true;
          if (res.status === 429) noteQuota(model, json);
          throw new Error(`${model}: ${res.status} ${msg.slice(0, 120)}`);
        }
        const text = (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
        if (!text) throw new Error(`${model}: empty response (${json.candidates?.[0]?.finishReason ?? 'unknown'})`);
        return { data: JSON.parse(text) as T, model };
      };

      // The free tier is often "busy": ask a few models at once and take the first good answer,
      // then fall back to the rest one at a time.
      const PARALLEL = 3;
      const first = usable.slice(0, PARALLEL);
      const controller = new AbortController();
      try {
        const winner = await Promise.any(
          first.map((m) =>
            attempt(m, controller.signal).catch((e) => {
              errors.push(e instanceof Error ? e.message : String(e));
              throw e;
            }),
          ),
        );
        controller.abort(); // cancel the slower requests
        return winner;
      } catch {
        // all of the first batch failed
      }
      for (const model of usable.slice(PARALLEL)) {
        if (fatal) break;
        try {
          return await attempt(model, new AbortController().signal);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      throw new AiUnavailableError(`No Gemini model could answer right now. ${errors.join(' | ')}`);
    },
  };
}
