import type { ToolResult } from '../mcp';

/** What a brain can do on the device. The simulator implements this. */
export interface DeviceIO {
  /** Speak (and show) a reply. */
  say(text: string): void;
  /** Call an MCP tool; the device shows the tool's card if it has one. */
  tool(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
  /** Call a task-based MCP tool in the background; status messages appear as they arrive. */
  task(name: string, args: Record<string, unknown>, onDone: (result: ToolResult) => void): void;
  /** Takes a photo with the device camera (countdown on screen). Null if it couldn't. */
  capture?(): Promise<{ data: string; mime: string } | null>;
  /** Places an Alexa call to a contact ("Mom", "Anita"); returns who is being called. */
  call?(who: string): Promise<string>;
}

/** Turns what someone says into tool calls. Alexa+ plays this role in production. */
export interface Brain {
  readonly name: string;
  handle(utterance: string, io: DeviceIO): Promise<void>;
}
