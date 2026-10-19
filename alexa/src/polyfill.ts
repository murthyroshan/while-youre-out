// Alexa-hosted skills may run on Node.js 16, which has no global fetch or web streams. The MCP
// client needs both, so they are filled in here (undici is the fetch Node itself ships from 18 on;
// the streams are Node's own, just not global before 18). On a newer Node nothing is replaced.
import { fetch, Headers, Request, Response, FormData } from 'undici';
import * as web from 'node:stream/web';

const g = globalThis as Record<string, unknown>;
if (typeof g.fetch !== 'function') Object.assign(g, { fetch, Headers, Request, Response, FormData });
for (const name of ['ReadableStream', 'WritableStream', 'TransformStream', 'TextDecoderStream', 'TextEncoderStream'] as const) {
  if (!g[name] && (web as Record<string, unknown>)[name]) g[name] = (web as Record<string, unknown>)[name];
}
