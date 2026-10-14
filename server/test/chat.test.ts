// The simulator's chat proxy to Gemini: a spent free-tier key must fail fast, not make the device wait.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { geminiChat, resetChatQuota, AiUnavailableError } from '../src/ai/gemini.js';

const req = { system: 'You are Alexa.', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], functions: [] };
const quota = (retry: string) =>
  new Response(JSON.stringify({ error: { message: 'You exceeded your current quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: retry }] } }), { status: 429 });
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello!' }] } }] }), { status: 200 });

beforeEach(() => {
  resetChatQuota();
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.WYO_GEMINI_CHAT_MODELS = 'model-a,model-b';
});

test('a model out of quota is skipped on later turns until it resets', async () => {
  const asked: string[] = [];
  const fetchImpl = (async (url: string) => {
    const model = /models\/([^:]+):/.exec(url)![1];
    asked.push(model);
    return model === 'model-a' ? quota('25532s') : ok();
  }) as typeof fetch;
  assert.equal((await geminiChat(req, fetchImpl)).model, 'model-b');
  assert.equal((await geminiChat(req, fetchImpl)).model, 'model-b');
  assert.deepEqual(asked, ['model-a', 'model-b', 'model-b'], 'model-a is not asked again');
});

test('"high demand" (503) skips that model for a while; a slow model never holds the device past the budget', async () => {
  const asked: string[] = [];
  const busy = (async (url: string) => {
    asked.push(/models\/([^:]+):/.exec(url)![1]);
    return new Response(JSON.stringify({ error: { message: 'This model is currently experiencing high demand.' } }), { status: 503 });
  }) as typeof fetch;
  await assert.rejects(geminiChat(req, busy), AiUnavailableError);
  await assert.rejects(geminiChat(req, busy), /busy or out of quota/);
  assert.deepEqual(asked, ['model-a', 'model-b'], 'busy models are not asked again straight away');

  resetChatQuota();
  const hang = ((_u: string, init: RequestInit) =>
    new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
  const t0 = Date.now();
  await assert.rejects(geminiChat(req, hang), AiUnavailableError);
  assert.ok(Date.now() - t0 < 6_000, `gave up after ${Date.now() - t0} ms`);
});

test('when every model is out of quota, the next turn fails at once without calling Google', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return quota('3600s');
  }) as typeof fetch;
  await assert.rejects(geminiChat(req, fetchImpl), AiUnavailableError);
  assert.equal(calls, 2);
  await assert.rejects(geminiChat(req, fetchImpl), /busy or out of quota/);
  assert.equal(calls, 2, 'no request was made');
});

test('a model that hung is skipped on the next turn too', async () => {
  let calls = 0;
  const hang = ((_u: string, init: RequestInit) => {
    calls++;
    return new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  }) as unknown as typeof fetch;
  // The first turn spends its budget on model-a; the second tries only model-b; then none.
  await assert.rejects(geminiChat(req, hang));
  assert.equal(calls, 1);
  await assert.rejects(geminiChat(req, hang));
  assert.equal(calls, 2, 'model-a is not asked again');
  await assert.rejects(geminiChat(req, hang), /busy or out of quota/);
  assert.equal(calls, 2, 'no request once both have hung');
});
