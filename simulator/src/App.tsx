import { useCallback, useEffect, useRef, useState } from 'react';
import { McpConnection, type ToolResult } from './mcp';
import { AppFrame } from './AppFrame';
import { RuleBrain } from './brain/rules';
import type { Brain, DeviceIO } from './brain/types';
import { canListen, listenOnce, speak, stopSpeaking } from './voice';

const DEFAULT_URL = import.meta.env.VITE_MCP_URL ?? 'http://127.0.0.1:8787/mcp';
const PARENT_KEY = import.meta.env.VITE_PARENT_KEY ?? 'demo-parent-key';

type Light = 'idle' | 'listening' | 'thinking' | 'speaking';
interface Card {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
  html: string;
  mode: 'inline' | 'fullscreen';
}
interface Line {
  id: number;
  who: 'you' | 'alexa';
  text: string;
}
interface TaskView {
  id: number;
  question: string;
  statuses: string[];
  done: boolean;
}

const SUGGESTIONS = [
  'Priya is babysitting tonight',
  'Can Maya have the cookies on the counter?',
  'What time is bedtime?',
  "Where's the EpiPen?",
  'Can she watch another episode?',
  'Can she sleep in your bed?',
  'She fell asleep at 8:10',
  "Her lips are swelling and she can't breathe",
  "We're back",
];

let nextId = 1;

export function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [conn, setConn] = useState<McpConnection | null>(null);
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [connError, setConnError] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [carer, setCarer] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [light, setLight] = useState<Light>('idle');
  const [voiceOn, setVoiceOn] = useState(() => {
    try {
      return localStorage.getItem('wyo.voice') !== 'off';
    } catch {
      return true;
    }
  });
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [now, setNow] = useState(new Date());
  const brain = useRef<Brain>(new RuleBrain());
  // Read through a ref so replies from long-running tasks respect the current setting.
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  const stopListening = useRef<() => void>(() => {});
  const cardRef = useRef<Card | null>(null);
  cardRef.current = card;
  const connRef = useRef<McpConnection | null>(null);
  const connectSeq = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const connect = useCallback(async (target: string) => {
    // Only the latest connect attempt wins; older sessions are closed, not leaked.
    const seq = ++connectSeq.current;
    setConnState('connecting');
    setConnError('');
    const previous = connRef.current;
    connRef.current = null;
    void previous?.close().catch(() => {});
    try {
      const c = await McpConnection.connect(target);
      if (seq !== connectSeq.current) return void c.close().catch(() => {});
      connRef.current = c;
      setConn(c);
      setConnState('connected');
    } catch (e) {
      if (seq !== connectSeq.current) return;
      setConn(null);
      setConnState('error');
      setConnError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void connect(DEFAULT_URL);
    return () => {
      connectSeq.current++;
      void connRef.current?.close().catch(() => {});
      connRef.current = null;
    };
  }, [connect]);

  const addLine = (who: Line['who'], text: string) => setLines((ls) => [...ls.slice(-5), { id: nextId++, who, text }]);

  const showCard = useCallback(
    async (c: McpConnection, tool: string, args: Record<string, unknown>, result: ToolResult, background = false) => {
      const uri = c.uiResourceFor(tool);
      if (!uri || !result.structuredContent) return;
      // A background answer must never cover the emergency screen.
      if (background && cardRef.current?.mode === 'fullscreen') return;
      const html = await c.uiHtml(uri);
      setCard({ id: nextId++, tool, args, result, html, mode: c.wantsFullscreen(tool) ? 'fullscreen' : 'inline' });
    },
    [],
  );

  const io = useCallback(
    (c: McpConnection): DeviceIO => ({
      say(text) {
        if (!text) return;
        addLine('alexa', text);
        if (voiceRef.current) void speak(text, 'en-US', () => setLight('speaking'), () => setLight('idle'));
      },
      async tool(name, args = {}) {
        setLight('thinking');
        try {
          const result = await c.call(name, args);
          if (name === 'start_handoff' && !result.isError) setCarer(String(args.carer_name ?? ''));
          if (name === 'end_handoff' && !result.isError) setCarer(null);
          await showCard(c, name, args, result);
          return result;
        } finally {
          setLight((l) => (l === 'thinking' ? 'idle' : l));
        }
      },
      task(name, args, onDone) {
        const id = nextId++;
        setTasks((ts) => [...ts, { id, question: String(args.question ?? name), statuses: [], done: false }]);
        void (async () => {
          try {
            for await (const update of c.callTask(name, args)) {
              if (update.status) {
                setTasks((ts) =>
                  ts.map((t) => (t.id === id && t.statuses.at(-1) !== update.status ? { ...t, statuses: [...t.statuses, update.status!] } : t)),
                );
              }
              if (update.result) {
                setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true } : t)));
                await showCard(c, name, args, update.result, true);
                onDone(update.result);
              }
            }
          } catch (e) {
            setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true, statuses: [...t.statuses, `Failed: ${String(e)}`] } : t)));
          }
        })();
      },
    }),
    [showCard],
  );

  const handle = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text || !conn) return;
      stopSpeaking();
      addLine('you', text);
      try {
        await brain.current.handle(text, io(conn));
      } catch (e) {
        addLine('alexa', `Sorry, something went wrong: ${e instanceof Error ? e.message : String(e)}`);
        setLight('idle');
      }
    },
    [conn, io],
  );

  const onMic = async () => {
    if (light === 'listening') return stopListening.current();
    stopSpeaking();
    setLight('listening');
    const session = listenOnce('en-US', setInterim);
    stopListening.current = session.stop;
    const heard = await session.done;
    setInterim('');
    setLight('idle');
    if (heard) void handle(heard);
  };

  const parentUrl = (() => {
    try {
      return `${new URL(url).origin}/parent?k=${encodeURIComponent(PARENT_KEY)}`;
    } catch {
      return '#';
    }
  })();

  const fullscreen = card?.mode === 'fullscreen';
  const activeTasks = tasks.filter((t) => !t.done || t.id === tasks.at(-1)?.id);

  return (
    <div className="page">
      <section className="device" aria-label="Echo Show simulator">
        <div className="bezel">
          <div className="camera" />
          <div className={`screen ${fullscreen ? 'is-fullscreen' : ''}`}>
            {!fullscreen && (
              <header className="statusbar">
                <span className="clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <span className={`mode ${carer ? 'carer' : ''}`}>{carer ? `Sitter mode · ${carer}` : 'Parent mode'}</span>
              </header>
            )}

            <div className="stage">
              {card ? (
                <AppFrame
                  key={card.id}
                  html={card.html}
                  toolName={card.tool}
                  toolInput={card.args}
                  toolResult={card.result}
                  displayMode={card.mode}
                  onDisplayMode={(mode) => setCard((c) => (c && c.id === card.id ? { ...c, mode } : c))}
                />
              ) : (
                <div className="idle">
                  <div className="big-clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                  <p>Try “Priya is babysitting tonight”</p>
                </div>
              )}
            </div>

            {!fullscreen && (
              <footer className="captions" aria-live="polite">
                {interim ? <p className="you">{interim}…</p> : null}
                {!interim &&
                  lines.slice(-1).map((l) => (
                    <p key={l.id} className={l.who}>
                      {l.text}
                    </p>
                  ))}
              </footer>
            )}
            {fullscreen && (
              <button className="dismiss" onClick={() => setCard(null)}>
                Close
              </button>
            )}
          </div>
          <div className={`lightbar ${light}`} />
        </div>
      </section>

      <aside className="panel">
        <h1>Echo Show simulator</h1>
        <p className="muted">Stands in for Alexa+ while the real add-on toolkit is partner-only. It connects to the MCP server exactly like an MCP client.</p>

        <div className="row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="MCP server URL" />
          <button onClick={() => void connect(url)}>Connect</button>
        </div>
        <p className={`conn ${connState}`}>
          {connState === 'connected' && conn
            ? `Connected to ${conn.serverName} · ${conn.tools.length} tools · protocol ${conn.protocolVersion ?? 'unknown'}`
            : connState === 'connecting'
              ? 'Connecting…'
              : `Not connected: ${connError}`}
        </p>

        <div className="talk">
          <button className={`mic ${light === 'listening' ? 'on' : ''}`} onClick={() => void onMic()} disabled={!canListen || !conn} title={canListen ? 'Speak' : 'Speech recognition needs Chrome or Edge'}>
            {light === 'listening' ? 'Listening… tap to stop' : 'Hold a conversation 🎤'}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handle(draft);
              setDraft('');
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type what you'd say…" disabled={!conn} />
          </form>
          <label className="check">
            <input
              type="checkbox"
              checked={voiceOn}
              onChange={(e) => {
                setVoiceOn(e.target.checked);
                try {
                  localStorage.setItem('wyo.voice', e.target.checked ? 'on' : 'off');
                } catch {
                  /* storage unavailable: setting just won't persist */
                }
                if (!e.target.checked) stopSpeaking();
              }}
            />{' '}
            Speak replies
          </label>
        </div>

        <h2>Try saying</h2>
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => void handle(s)} disabled={!conn}>
              {s}
            </button>
          ))}
        </div>

        {activeTasks.length > 0 && (
          <>
            <h2>Asking the parents</h2>
            {activeTasks.map((t) => (
              <div key={t.id} className={`task ${t.done ? 'done' : ''}`}>
                <strong>“{t.question}”</strong>
                <ul>
                  {t.statuses.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        <h2>Parent's phone</h2>
        <p>
          <a href={parentUrl} target="_blank" rel="noreferrer">
            Open the parent page
          </a>{' '}
          <span className="muted">(answer questions as Mom or Dad)</span>
        </p>

        <h2>Conversation</h2>
        <div className="log">
          {lines.map((l) => (
            <p key={l.id} className={l.who}>
              <b>{l.who === 'you' ? 'You' : 'Alexa'}:</b> {l.text}
            </p>
          ))}
        </div>
        <p className="muted small">Brain: {brain.current.name}</p>
      </aside>
    </div>
  );
}
