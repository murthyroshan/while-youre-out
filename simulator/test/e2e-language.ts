// Not a unit test: a Hindi-speaking sitter's evening against a RUNNING server, with real Gemini.
//   npx tsx test/e2e-language.ts http://127.0.0.1:8787
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GeminiBrain } from '../src/brain/gemini';
import { HybridBrain } from '../src/brain/hybrid';
import { RuleBrain } from '../src/brain/rules';
import type { ToolResult } from '../src/mcp';

const server = process.argv[2] ?? 'http://127.0.0.1:8787';
const base = `${server}/h/${randomBytes(16).toString('hex')}`;
const client = new Client({ name: 'e2e-language', version: '0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
const { tools } = await client.listTools();
const rules = new RuleBrain();
const brain = new HybridBrain(rules, new GeminiBrain({ serverOrigin: base, tools: () => tools, instructions: () => client.getInstructions(), fallback: rules }));
const said: string[] = [];
const called: string[] = [];
const io = {
  say: (t: string) => void said.push(t),
  tool: async (name: string, args = {}) => {
    called.push(name);
    return (await client.callTool({ name, arguments: args })) as ToolResult;
  },
  task: (name: string) => void called.push(`task:${name}`),
};
for (const u of ['Dadi is babysitting tonight in Hindi', 'मूंगफली', 'रसोई की दराज़ में, चूल्हे के पास', 'अनीता', 'क्या माया कुकीज़ खा सकती है?', 'एपिपेन कहाँ है?', 'वह सांस नहीं ले पा रही है!']) {
  const t0 = Date.now();
  said.length = 0;
  called.length = 0;
  await brain.handle(u, io);
  console.log(`${String(Date.now() - t0).padStart(5)} ms  ${u}\n        tools: ${called.join(', ')}\n        said: ${said.join(' | ').slice(0, 220)}`);
}
await client.close();
