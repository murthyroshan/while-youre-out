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

export function geminiFromEnv(): AiClient {
  const key = process.env.GEMINI_API_KEY?.trim();
  const models = process.env.WYO_GEMINI_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? DEFAULT_MODELS;
  return {
    available: Boolean(key),
    async generateJson<T>({ system, parts, schema, timeoutMs = 30_000 }: JsonRequest) {
      if (!key) throw new AiUnavailableError('GEMINI_API_KEY is not set. Add it to server/.env.');
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
          throw new Error(`${model}: ${res.status} ${msg.slice(0, 120)}`);
        }
        const text = (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
        if (!text) throw new Error(`${model}: empty response (${json.candidates?.[0]?.finishReason ?? 'unknown'})`);
        return { data: JSON.parse(text) as T, model };
      };

      // The free tier is often "busy": ask a few models at once and take the first good answer,
      // then fall back to the rest one at a time.
      const PARALLEL = 3;
      const first = models.slice(0, PARALLEL);
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
      for (const model of models.slice(PARALLEL)) {
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
