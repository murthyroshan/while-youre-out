import { useEffect, useRef, useState } from 'react';
import type { ToolResult } from './mcp';

/**
 * A minimal MCP Apps host. It renders a ui:// resource in a sandboxed iframe and speaks the
 * MCP Apps postMessage protocol: answers ui/initialize, then sends the tool input and result.
 */
export function AppFrame(props: {
  html: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: ToolResult;
  displayMode: 'inline' | 'fullscreen';
  onDisplayMode?: (mode: 'inline' | 'fullscreen') => void;
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
    const sendToolData = () => {
      const p = latest.current;
      post({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: p.toolInput } });
      post({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: p.toolResult });
    };

    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const m = e.data;
      if (!m || m.jsonrpc !== '2.0') return;
      if (m.method === 'ui/initialize' && m.id != null) {
        post({
          jsonrpc: '2.0',
          id: m.id,
          result: {
            protocolVersion: '2026-01-26',
            hostInfo: { name: 'echo-show-simulator', version: '0.1.0' },
            hostCapabilities: {},
            hostContext: {
              theme: 'light',
              displayMode: latest.current.displayMode,
              availableDisplayModes: ['inline', 'fullscreen'],
              platform: 'web',
              deviceCapabilities: { touch: true, hover: false },
              toolInfo: { tool: { name: latest.current.toolName } },
            },
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
        const mode = m.params?.mode === 'fullscreen' ? 'fullscreen' : 'inline';
        latest.current.onDisplayMode?.(mode);
        post({ jsonrpc: '2.0', id: m.id, result: { mode } });
      } else if (m.id != null) {
        // Requests this simple host does not implement (open-link, message…).
        post({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Not supported by the simulator: ${m.method}` } });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
