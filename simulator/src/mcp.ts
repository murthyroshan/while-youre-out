import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, any>;
  isError?: boolean;
}

export interface TaskUpdate {
  status?: string;
  result?: ToolResult;
}

async function open(url: string) {
  const client = new Client({ name: 'echo-show-simulator', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  const { tools } = await client.listTools();
  return { client, transport, tools };
}

// The server forgets sessions when it restarts; the client then gets "Session not found".
const isLostSession = (e: unknown) => /session not found|404/i.test(e instanceof Error ? e.message : String(e));

/** The simulator's connection to an MCP server, playing the role Alexa+ plays in production. */
export class McpConnection {
  private uiCache = new Map<string, string>();

  private constructor(
    private url: string,
    private client: Client,
    public tools: Tool[],
    public serverName: string,
    public protocolVersion: string | undefined,
  ) {}

  static async connect(url: string) {
    const { client, transport, tools } = await open(url);
    const info = client.getServerVersion();
    return new McpConnection(url, client, tools, info?.title ?? info?.name ?? 'MCP server', transport.protocolVersion);
  }

  private reconnecting: Promise<void> | null = null;

  /** Opens a fresh session after the server restarted. Simultaneous failures share one reconnect. */
  private reconnect(): Promise<void> {
    this.reconnecting ??= (async () => {
      try {
        void this.client.close().catch(() => {});
        const { client, tools } = await open(this.url);
        this.client = client;
        this.tools = tools;
        this.uiCache.clear();
      } finally {
        this.reconnecting = null;
      }
    })();
    return this.reconnecting;
  }

  private async withReconnect<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (!isLostSession(e)) throw e;
      await this.reconnect();
      return fn();
    }
  }

  /** The server's own instructions from initialize, passed to the AI brain. */
  get instructions(): string | undefined {
    return this.client.getInstructions();
  }

  /** The MCP App (ui:// resource) a tool wants shown with its result, if any. */
  uiResourceFor(tool: string): string | undefined {
    const meta = this.tools.find((t) => t.name === tool)?._meta as Record<string, any> | undefined;
    return meta?.ui?.resourceUri ?? meta?.['ui/resourceUri'];
  }

  wantsFullscreen(tool: string): boolean {
    const meta = this.tools.find((t) => t.name === tool)?._meta as Record<string, any> | undefined;
    return meta?.ui?.preferredDisplayMode === 'fullscreen';
  }

  async uiHtml(uri: string): Promise<string> {
    const cached = this.uiCache.get(uri);
    if (cached) return cached;
    const res = await this.withReconnect(() => this.client.readResource({ uri }));
    const first = res.contents[0] as { text?: string };
    const html = first?.text ?? '';
    this.uiCache.set(uri, html);
    return html;
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return (await this.withReconnect(() => this.client.callTool({ name, arguments: args }))) as ToolResult;
  }

  /** Calls a task-based tool and yields status messages until the final result. */
  async *callTask(name: string, args: Record<string, unknown>): AsyncGenerator<TaskUpdate> {
    let started = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        for await (const msg of this.client.experimental.tasks.callToolStream({ name, arguments: args })) {
          started = true;
          if (msg.type === 'taskCreated' || msg.type === 'taskStatus') yield { status: msg.task.statusMessage ?? msg.task.status };
          else if (msg.type === 'result') yield { result: msg.result as ToolResult };
          else if (msg.type === 'error') throw msg.error;
        }
        return;
      } catch (e) {
        // Only retry if the session was lost before the task began; never send the question twice.
        if (started || attempt > 0 || !isLostSession(e)) throw e;
        await this.reconnect();
      }
    }
  }

  async close() {
    await this.client.close();
  }
}

export const textOf = (r: ToolResult) => r.content.map((c) => c.text ?? '').join(' ').trim();
