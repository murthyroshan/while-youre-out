// Not a unit test: times the hybrid brain against a RUNNING server (real Gemini proxy).
//   npx tsx test/e2e-hybrid.ts http://127.0.0.1:8787
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GeminiBrain } from '../src/brain/gemini';
import { HybridBrain } from '../src/brain/hybrid';
import { RuleBrain } from '../src/brain/rules';
import type { ToolResult } from '../src/mcp';

const server = process.argv[2] ?? 'http://127.0.0.1:8787';
const base = `${server}/h/${randomBytes(16).toString('hex')}`;
const client = new Client({ name: 'e2e-hybrid', version: '0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
const { tools } = await client.listTools();
const rules = new RuleBrain();
const hybrid = new HybridBrain(rules, new GeminiBrain({ serverOrigin: base, tools: () => tools, instructions: () => undefined, fallback: rules }));
const said: string[] = [];
const io = { say: (t: string) => void said.push(t), tool: async (name: string, args = {}) => (await client.callTool({ name, arguments: args })) as ToolResult, task: () => {} };
for (const u of ["Where's the EpiPen?", 'Is it fine if she skips brushing her teeth tonight', 'क्या माया कुकीज़ खा सकती है?']) {
  const t0 = Date.now();
  said.length = 0;
  await hybrid.handle(u, io);
  console.log(`${String(Date.now() - t0).padStart(5)} ms  ${u}  →  ${said.join(' ').slice(0, 110)}`);
}
await client.close();
