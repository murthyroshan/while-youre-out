import { useEffect, useRef, useState } from 'react';
import type { ToolResult } from './mcp';

type Mode = 'inline' | 'fullscreen';

/**
 * A minimal MCP Apps host. It renders a ui:// resource in a sandboxed iframe and speaks the
 * MCP Apps postMessage protocol: answers ui/initialize, sends the tool input and result, lets the
 * card call the server's tools (tools/call) and speak for the user (ui/message), and switches
 * display modes.
 */
export function AppFrame(props: {
  html: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: ToolResult;
  displayMode: Mode;
  onDisplayMode?: (mode: Mode) => void;
  /** A card calling one of the server's tools (e.g. the home screen refreshing itself). */
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  /** A card sending a message as the user (e.g. a big "Emergency" button). */
  onUserMessage?: (text: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const ready = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const post = (msg: unknown) => frame.contentWindow?.postMessage(msg, '*');
    const reply = (id: unknown, result: unknown) => post({ jsonrpc: '2.0', id, result });
    const fail = (id: unknown, message: string, code = -32601) => post({ jsonrpc: '2.0', id, error: { code, message } });
    const sendToolData = () => {
      const p = latest.current;
      post({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: p.toolInput } });
      post({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: p.toolResult });
    };

    const onMessage = async (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const m = e.data;
      if (!m || m.jsonrpc !== '2.0') return;
      const p = latest.current;
      if (m.method === 'ui/initialize' && m.id != null) {
        reply(m.id, {
          protocolVersion: '2026-01-26',
          hostInfo: { name: 'echo-show-simulator', version: '0.2.0' },
          hostCapabilities: { serverTools: {}, message: {}, displayModes: ['inline', 'fullscreen'] },
          hostContext: {
            theme: 'dark',
            displayMode: p.displayMode,
            availableDisplayModes: ['inline', 'fullscreen'],
            platform: 'web',
            deviceCapabilities: { touch: true, hover: false },
            containerDimensions: { width: frame.clientWidth, height: frame.clientHeight },
            toolInfo: { tool: { name: p.toolName } },
          },
        });
      } else if (m.method === 'ui/notifications/initialized') {
        ready.current = true;
        sendToolData();
      } else if (m.method === 'ui/notifications/size-changed') {
        const h = m.params?.height;
        // Ignore zero sizes (hidden tabs) and tiny changes, which could otherwise loop.
        if (typeof h === 'number' && h > 0) setHeight((old) => (Math.abs(old - h) > 2 ? Math.min(Math.max(h, 120), 2000) : old));
      } else if (m.method === 'ui/request-display-mode' && m.id != null) {
        const mode: Mode = m.params?.mode === 'fullscreen' ? 'fullscreen' : 'inline';
        p.onDisplayMode?.(mode);
        reply(m.id, { mode });
      } else if (m.method === 'tools/call' && m.id != null) {
        const name = m.params?.name;
        if (typeof name !== 'string' || !p.onToolCall) return fail(m.id, 'tools/call is not available');
        try {
          reply(m.id, await p.onToolCall(name, (m.params?.arguments as Record<string, unknown>) ?? {}));
        } catch (err) {
          fail(m.id, err instanceof Error ? err.message : String(err), -32603);
        }
      } else if (m.method === 'ui/message' && m.id != null) {
        const content = m.params?.content;
        const blocks = Array.isArray(content) ? content : content ? [content] : [];
        const text = blocks.map((b: { type?: string; text?: string }) => (b?.type === 'text' ? b.text ?? '' : '')).join(' ').trim();
        if (!text || !p.onUserMessage) return fail(m.id, 'ui/message is not available');
        p.onUserMessage(text);
        reply(m.id, {});
      } else if (m.id != null) {
        // Requests this simple host does not implement (open-link…).
        fail(m.id, `Not supported by the simulator: ${m.method}`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // A new result for the same card (the home screen updating): send it once the card is ready.
  useEffect(() => {
    if (!ready.current) return;
    ref.current?.contentWindow?.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: props.toolResult }, '*');
  }, [props.toolResult]);

  // Tell the card when its display mode changes.
  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { displayMode: props.displayMode } }, '*');
  }, [props.displayMode]);

  return (
    <iframe
      ref={ref}
      title={`${props.toolName} card`}
      className={`app-frame ${props.displayMode}`}
      sandbox="allow-scripts"
      srcDoc={props.html}
      style={props.displayMode === 'fullscreen' ? undefined : { height }}
    />
  );
}
