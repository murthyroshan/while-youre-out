import { useCallback, useEffect, useRef, useState } from 'react';
import { McpConnection, textOf, type ToolResult } from './mcp';
import { AppFrame } from './AppFrame';
import { RuleBrain } from './brain/rules';
import { GeminiBrain } from './brain/gemini';
import type { Brain, DeviceIO } from './brain/types';
import { canListen, listenOnce, speak, stopSpeaking } from './voice';
import { grab, openCamera, samplePhoto, type Shot } from './camera';

// Served by the MCP server itself (the hosted demo): talk to that server. In development: the local one.
const DEFAULT_URL = import.meta.env.VITE_MCP_URL ?? (location.port === '5173' ? 'http://127.0.0.1:8787/mcp' : `${location.origin}/mcp`);
const PARENT_KEY = import.meta.env.VITE_PARENT_KEY ?? 'demo-parent-key';
/** An answer card goes back to the Tonight screen after this long without anyone talking. */
const CARD_TIMEOUT_MS = 40_000;

type Light = 'idle' | 'listening' | 'thinking' | 'speaking';
type Mode = 'inline' | 'fullscreen';
interface Card {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
  html: string;
  mode: Mode;
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
interface CameraView {
  stream: MediaStream | null;
  count: number;
  still: string | null;
  /** Waiting for the camera (or the browser's permission prompt). */
  opening?: boolean;
}
interface Ring {
  snapshot: string;
  label: string;
  time: string;
}
const RINGERS: Array<[string, string]> = [
  ['delivery', '📦 Delivery driver'],
  ['stranger', '❓ Someone unknown'],
  ['grandma', '👵 Nani with soup'],
];

/** A two-tone doorbell chime (Web Audio, no file needed). */
function chime() {
  try {
    const ctx = new AudioContext();
    [659.25, 523.25].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.45);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.45 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.45 + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.45);
      o.stop(ctx.currentTime + i * 0.45 + 1.2);
    });
    setTimeout(() => void ctx.close(), 2500);
  } catch {
    // no audio: the screen still shows it
  }
}

interface Call {
  name: string;
  relation: string;
  connected: boolean;
}

// The demo, in the order a judge would try it (and the video tells it).
const GUIDE: Array<{ title: string; lines: string[]; note?: string; clock?: [string, string]; ring?: boolean }> = [
  { title: '1 · The parents hand over', clock: ['Sat', '18:00'], lines: ['Priya is babysitting tonight', 'Peanuts', 'In the kitchen drawer by the stove', 'Anita'], note: 'The Tonight screen appears, then a 3-question handover check.' },
  { title: '2 · Questions, in the parents’ words', lines: ['Can Maya have the cookies on the counter?', "Where's the EpiPen?", 'Can she watch another episode?'], note: 'Food always gets a guard; Shadow Parent says how the parents usually answer.' },
  { title: '3 · The evening goes on', clock: ['Sat', '18:40'], lines: ['She napped till 5', "What's next?", 'Send Mom a photo saying good night'], note: 'Late nap moves bedtime by the parents’ own rule.' },
  { title: '4 · Someone at the door', clock: ['Sat', '18:50'], ring: true, lines: ["Someone's knocking, should I open the door?"], note: 'Ring the bell first. Unknown visitor: don’t open, and the photo goes to the parents’ lock screen.' },
  { title: '5 · Ask a parent', lines: ['Can she sleep in your bed?', 'Yes'], note: 'Answer it on the parent page: the device announces the reply.' },
  { title: '6 · Emergency', lines: ["Her lips are swelling and she can't breathe"], note: 'Fixed script, no AI. Every parent phone buzzes.' },
  { title: '7 · Lights out', clock: ['Sat', '20:15'], lines: ['She fell asleep at 8:10'], note: 'The screen goes dim and warm.' },
  { title: '8 · Morning', lines: ["We're back", 'Yes'], note: 'The debrief lands on the parent page.' },
  { title: 'Another language', lines: ['Dadi is babysitting tonight in Hindi', 'क्या माया कुकीज़ खा सकती है?'], note: 'Needs the Gemini brain for free speech.' },
];

let nextId = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [conn, setConn] = useState<McpConnection | null>(null);
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [connError, setConnError] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const [home, setHome] = useState<Card | null>(null);
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
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [ring, setRing] = useState<Ring | null>(null);
  const [emergencyOn, setEmergencyOn] = useState(false);
  const [caption, setCaption] = useState<Line | null>(null);
  const rules = useRef(new RuleBrain());
  const [brainKind, setBrainKind] = useState<'gemini' | 'rules'>(() => {
    try {
      return localStorage.getItem('wyo.brain') === 'rules' ? 'rules' : 'gemini';
    } catch {
      return 'gemini';
    }
  });
  const gemini = useRef<GeminiBrain | null>(null);
  const brain = useRef<Brain>(rules.current);
  // Read through refs so replies from long-running tasks respect the current state.
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  // The carer's language: replies are spoken with a matching voice.
  const langRef = useRef('en-US');
  const stopListening = useRef<() => void>(() => {});
  const cardRef = useRef<Card | null>(null);
  cardRef.current = card;
  const homeRef = useRef<Card | null>(null);
  homeRef.current = home;
  const connRef = useRef<McpConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const connectSeq = useRef(0);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When someone last spoke or was answered: reminders wait so they never talk over a reply.
  const lastActivity = useRef(0);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (videoRef.current && camera?.stream) videoRef.current.srcObject = camera.stream;
  }, [camera?.stream]);

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

  const serverOrigin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    if (!conn || !serverOrigin) return;
    gemini.current = new GeminiBrain({
      serverOrigin,
      tools: () => connRef.current?.tools ?? [],
      instructions: () => connRef.current?.instructions,
      fallback: rules.current,
    });
  }, [conn, serverOrigin]);
  brain.current = brainKind === 'gemini' && gemini.current ? gemini.current : rules.current;

  const addLine = (who: Line['who'], text: string) => {
    const line = { id: nextId++, who, text };
    setLines((ls) => [...ls.slice(-40), line]);
    setCaption(line);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(null), who === 'alexa' ? 9_000 : 5_000);
  };

  // ---------- the Tonight screen (home) ----------
  const refreshHome = useCallback(async (c: McpConnection) => {
    if (!c.tools.some((t) => t.name === 'home_screen')) return;
    try {
      const result = await c.call('home_screen');
      const uri = c.uiResourceFor('home_screen');
      if (!uri || !result.structuredContent) return;
      const html = await c.uiHtml(uri);
      const s = result.structuredContent;
      setCarer(s.mode === 'carer' ? String(s.carer ?? '') : null);
      // Keep the same frame (it refreshes itself); replace it only when the data changed.
      setHome((old) => (old && JSON.stringify(old.result.structuredContent) === JSON.stringify(s) ? old : { id: old?.id ?? nextId++, tool: 'home_screen', args: {}, result, html, mode: 'fullscreen' }));
    } catch {
      // the screen keeps what it had
    }
  }, []);
  useEffect(() => {
    if (conn) void refreshHome(conn);
  }, [conn, refreshHome]);

  // An answer card stays a while, then the device goes back to the Tonight screen (like an Echo Show).
  const armCardTimer = useCallback(() => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = setTimeout(() => {
      setCard((c) => (c && c.mode === 'inline' ? null : c));
    }, CARD_TIMEOUT_MS);
  }, []);

  // ---------- demo clock (only when the server runs with WYO_DEMO=1) ----------
  const [demoTime, setDemoTime] = useState<string | null>(null);
  const [demoInput, setDemoInput] = useState('19:10');
  const [demoDay, setDemoDay] = useState('Sat');
  // The demo server tells the simulator where the parent page is (its key isn't baked into the build).
  const [demoParentPath, setDemoParentPath] = useState<string | null>(null);
  useEffect(() => {
    if (connState !== 'connected' || !serverOrigin) return;
    fetch(`${serverOrigin}/demo/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setDemoParentPath(typeof c?.parent_url === 'string' ? c.parent_url : null))
      .catch(() => setDemoParentPath(null));
  }, [connState, serverOrigin]);
  const refreshDemoClock = useCallback(async () => {
    try {
      const r = await fetch(`${serverOrigin}/demo/clock`);
      const t = r.ok ? await r.json() : null;
      setDemoTime(t ? `${t.weekday} ${t.hhmm}` : null);
    } catch {
      setDemoTime(null);
    }
  }, [serverOrigin]);
  useEffect(() => {
    if (connState !== 'connected') return;
    void refreshDemoClock();
    const t = setInterval(() => void refreshDemoClock(), 15_000);
    return () => clearInterval(t);
  }, [connState, refreshDemoClock]);
  const setClock = async (time: string, day: string) => {
    const r = await fetch(`${serverOrigin}/demo/clock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ time, day }) });
    if (r.ok) {
      const t = await r.json();
      setDemoTime(`${t.weekday} ${t.hhmm}`);
      setDemoInput(time);
      setDemoDay(day);
      if (connRef.current) void refreshHome(connRef.current);
    }
  };

  // Ring announces the doorbell on Echo devices by itself; this stands in for that alert.
  const ringDoorbell = async (who: string) => {
    const r = await fetch(`${serverOrigin}/demo/ring`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who }) }).catch(() => null);
    if (!r?.ok) return;
    const ev = await r.json();
    chime();
    setRing({ snapshot: `${serverOrigin}${ev.snapshot_url}`, label: ev.label, time: ev.time });
    addLine('alexa', 'Someone is at the front door.');
    if (voiceRef.current) void speak('Someone is at the front door.', 'en-US', () => setLight('speaking'), () => setLight('idle'));
    setTimeout(() => setRing((x) => (x?.snapshot.endsWith(ev.snapshot_url) ? null : x)), 9000);
    if (connRef.current) void refreshHome(connRef.current);
  };

  const showCard = useCallback(
    async (c: McpConnection, tool: string, args: Record<string, unknown>, result: ToolResult, background = false) => {
      const uri = c.uiResourceFor(tool);
      if (!uri || !result.structuredContent) return;
      // A background answer must never cover the emergency screen.
      if (background && cardRef.current?.mode === 'fullscreen') return;
      // The next step of the emergency guide updates the screen that's already up (no reload, no flash).
      const open = cardRef.current;
      if (tool === 'emergency_step' && open && (open.tool === 'emergency' || open.tool === 'emergency_step')) {
        setCard({ ...open, args, result });
        armCardTimer();
        return;
      }
      const html = await c.uiHtml(uri);
      setCard({ id: nextId++, tool, args, result, html, mode: c.wantsFullscreen(tool) ? 'fullscreen' : 'inline' });
      armCardTimer();
    },
    [armCardTimer],
  );

  const takePhoto = async (): Promise<Shot> => {
    // Like a real Echo Show: a live preview, a 3-2-1 countdown, then the photo on screen.
    setCamera({ stream: null, count: 0, still: null, opening: true });
    const stream = await openCamera();
    for (const n of [3, 2, 1]) {
      setCamera({ stream, count: n, still: null });
      await sleep(900);
    }
    const shot: Shot = (stream && videoRef.current && grab(videoRef.current)) || samplePhoto();
    stream?.getTracks().forEach((t) => t.stop());
    setCamera({ stream: null, count: 0, still: `data:${shot.mime};base64,${shot.data}` });
    setTimeout(() => setCamera((cv) => (cv?.still ? null : cv)), 2500);
    return shot;
  };

  const io = useCallback(
    (c: McpConnection): DeviceIO => ({
      say(text) {
        if (!text) return;
        addLine('alexa', text);
        armCardTimer();
        // Non-English replies are translated by the server; speak them with a voice for that language.
        const lang = /[^ -ɏ]/.test(text) || langRef.current !== 'en-US' ? langRef.current : 'en-US';
        if (voiceRef.current) void speak(text, lang, () => setLight('speaking'), () => setLight('idle'));
      },
      async tool(name, args = {}) {
        setLight('thinking');
        try {
          const result = await c.call(name, args);
          if (name === 'start_handoff' && !result.isError) langRef.current = typeof args.language === 'string' ? args.language : 'en-US';
          if (name === 'end_handoff' && !result.isError) langRef.current = 'en-US';
          if (name === 'set_carer_language' && !result.isError && typeof args.language === 'string') langRef.current = args.language;
          if (name === 'emergency' || name === 'emergency_step') setEmergencyOn(!result.structuredContent?.resolved);
          if (name === 'home_screen') {
            setCard(null);
            void refreshHome(c);
          } else {
            await showCard(c, name, args, result);
            void refreshHome(c);
          }
          return result;
        } finally {
          setLight((l) => (l === 'thinking' ? 'idle' : l));
        }
      },
      task(name, args, onDone) {
        const id = nextId++;
        setTasks((ts) => [...ts, { id, question: String(args.question ?? name), statuses: [], done: false }]);
        // While it waits, the screen shows who was asked ("Asking Anita…"), like the task's status.
        const waiting = (asked: string) =>
          showCard(c, name, args, { content: [], structuredContent: { view: 'question', text: String(args.question ?? ''), status: 'pending', asked } }, true);
        // A door question keeps the door card (photo, "don't open") on screen instead.
        const door = Boolean(args.door_event_id);
        if (!door) void waiting('a parent');
        void (async () => {
          try {
            for await (const update of c.callTask(name, args)) {
              const asked = update.status && /^Asked (.+)$/.exec(update.status);
              if (asked && !door && cardRef.current?.tool === name && cardRef.current.result.structuredContent?.status === 'pending') void waiting(asked[1]);
              if (update.status) {
                setTasks((ts) => ts.map((t) => (t.id === id && t.statuses.at(-1) !== update.status ? { ...t, statuses: [...t.statuses, update.status!] } : t)));
              }
              if (update.result) {
                setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true } : t)));
                await showCard(c, name, args, update.result, true);
                void refreshHome(c);
                onDone(update.result);
              }
            }
          } catch (e) {
            setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true, statuses: [...t.statuses, `Failed: ${String(e)}`] } : t)));
          }
        })();
      },
      capture: takePhoto,
      async call(who) {
        // Alexa calling, simulated: find the contact on the Tonight screen ("Mom" finds Anita).
        const parents = (homeRef.current?.result.structuredContent?.parents as Array<{ name: string; relation: string }> | undefined) ?? [];
        const w = who.toLowerCase().replace(/^(my |the )/, '');
        const match =
          parents.find((p) => p.name.toLowerCase() === w) ??
          parents.find((p) => (/^(mom|mum|mommy|mummy|mother|mama)$/.test(w) && /mom|mum|mother/i.test(p.relation)) || (/^(dad|daddy|father|papa)$/.test(w) && /dad|father/i.test(p.relation))) ??
          (/(parent|them|someone)/.test(w) ? parents[0] : undefined);
        const name = match?.name ?? who.replace(/^./, (ch) => ch.toUpperCase());
        setCall({ name, relation: match?.relation ?? '', connected: false });
        setTimeout(() => setCall((cl) => (cl && cl.name === name ? { ...cl, connected: true } : cl)), 2500);
        return name;
      },
    }),
    [showCard, refreshHome, armCardTimer],
  );

  const handle = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text || !conn) return;
      stopSpeaking();
      addLine('you', text);
      armCardTimer();
      lastActivity.current = Date.now();
      try {
        await brain.current.handle(text, io(conn));
        lastActivity.current = Date.now();
      } catch (e) {
        addLine('alexa', `Sorry, something went wrong: ${e instanceof Error ? e.message : String(e)}`);
        setLight('idle');
      }
    },
    [conn, io, armCardTimer],
  );

  // During an emergency the device says the plan's timers out loud ("One minute left on the EpiPen timer").
  useEffect(() => {
    if (!conn || !emergencyOn) return;
    const t = setInterval(async () => {
      try {
        const r = await conn.call('emergency_status', { announce: true });
        const s = r.structuredContent ?? {};
        if (!s.active) return setEmergencyOn(false);
        if ((s.announce as string[] | undefined)?.length) {
          setCard((c) => (c?.tool === 'emergency' || c?.tool === 'emergency_step' ? { ...c, result: r } : c));
          io(conn).say((s.announce as string[]).join(' '));
        }
      } catch {
        // retried on the next tick
      }
    }, 4000);
    return () => clearInterval(t);
  }, [conn, emergencyOn, io]);

  // While someone is babysitting, the device reminds them when a step of tonight's plan comes due.
  useEffect(() => {
    if (!conn || !carer) return;
    let stopped = false;
    const tick = async () => {
      // Taking an announcement marks it said, so only ask when the device is free to say it.
      if (Date.now() - lastActivity.current < 8000) return;
      const started = Date.now();
      try {
        const r = await conn.call('tonight_plan', { announce: true });
        if (stopped || !(r.structuredContent?.due as string[] | undefined)?.length) return;
        // Someone spoke meanwhile: say the reminder, but don't cover their answer with an older card.
        if (lastActivity.current < started) await showCard(conn, 'tonight_plan', { announce: true }, r, true);
        void refreshHome(conn);
        io(conn).say(textOf(r));
      } catch {
        // a missed reminder check is retried on the next tick
      }
    };
    void tick();
    const t = setInterval(tick, 15_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [conn, carer, io, showCard, refreshHome, demoTime]);

  const onMic = async () => {
    if (light === 'listening') return stopListening.current();
    stopSpeaking();
    setLight('listening');
    const session = listenOnce(langRef.current, setInterim);
    stopListening.current = session.stop;
    const heard = await session.done;
    setInterim('');
    setLight('idle');
    if (heard) void handle(heard);
  };

  const parentUrl = serverOrigin ? `${serverOrigin}${demoParentPath ?? `/parent?k=${encodeURIComponent(PARENT_KEY)}`}` : '#';
  const clockText = (() => {
    const m = demoTime ? /(\d{2}):(\d{2})$/.exec(demoTime) : null;
    if (!m) return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const h = Number(m[1]);
    return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  })();
  const fullscreen = card?.mode === 'fullscreen';
  const showingHome = !card && Boolean(home);
  const activeTasks = tasks.filter((t) => !t.done || t.id === tasks.at(-1)?.id);
  const cardProps = (c: Card) => ({
    html: c.html,
    toolName: c.tool,
    toolInput: c.args,
    toolResult: c.result,
    onToolCall: (name: string, args: Record<string, unknown>) => {
      const cn = connRef.current;
      if (!cn) return Promise.reject(new Error('Not connected'));
      // Cards may only call tools the server marked as callable from its UI.
      if (!cn.appCallable(name)) return Promise.reject(new Error(`${name} can't be called from a card`));
      return cn.call(name, args);
    },
    onUserMessage: (text: string) => void handle(text),
  });

  return (
    <div className="page">
      <section className="wall" aria-label="Echo Show simulator">
        <div className="device">
          <div className="bezel">
            <div className="camera" />
            <div className={`screen ${fullscreen || showingHome ? 'is-fullscreen' : ''}`}>
              {!fullscreen && !showingHome && (
                <header className="statusbar">
                  <span className="clock">{clockText}</span>
                  <span className={`mode ${carer ? 'carer' : ''}`}>{carer ? `Sitter mode · ${carer}` : 'Parent mode'}</span>
                </header>
              )}

              <div className="stage">
                {home && (
                  <div className={`home-layer ${showingHome ? '' : 'hidden'}`}>
                    <AppFrame key={home.id} {...cardProps(home)} displayMode="fullscreen" />
                  </div>
                )}
                {card && (
                  <AppFrame
                    key={card.id}
                    {...cardProps(card)}
                    displayMode={card.mode}
                    onDisplayMode={(mode) => setCard((c) => (c && c.id === card.id ? { ...c, mode } : c))}
                  />
                )}
                {!card && !home && (
                  <div className="idle">
                    <div className="big-clock">{clockText}</div>
                    <p>{connState === 'connected' ? 'Try “Priya is babysitting tonight”' : connState === 'connecting' ? 'Connecting…' : 'Not connected'}</p>
                  </div>
                )}
              </div>

              {(interim || caption) && !fullscreen && (
                <div className={`caption ${interim ? 'you' : caption?.who}`} aria-live="polite">
                  {interim ? `${interim}…` : caption?.text}
                </div>
              )}
              {card && (
                <button className="dismiss" onClick={() => setCard(null)} aria-label="Back to the Tonight screen">
                  {fullscreen ? 'Close' : '✕'}
                </button>
              )}

              {camera && (
                <div className="overlay camera-view" aria-live="polite">
                  {camera.still ? (
                    <img src={camera.still} alt="The photo that was sent" />
                  ) : camera.stream ? (
                    <video ref={videoRef} autoPlay muted playsInline />
                  ) : camera.opening ? (
                    <div className="no-camera">Opening the camera…</div>
                  ) : (
                    <div className="no-camera">No camera found: sending a sample photo</div>
                  )}
                  {camera.count > 0 && <div className="countdown">{camera.count}</div>}
                  {camera.still && <div className="sent">📷 Sending to the parents</div>}
                </div>
              )}

              {ring && (
                <div className="overlay ring-view" onClick={() => setRing(null)} role="alert">
                  <img src={ring.snapshot} alt={`Doorbell camera: ${ring.label}`} />
                  <div className="ring-top">🔔 Front Door · {ring.time}</div>
                  <div className="ring-bottom">Someone is at the front door. Ask “Should I open the door?”</div>
                </div>
              )}
              {call && (
                <div className="overlay call-view" role="dialog" aria-label={`Calling ${call.name}`}>
                  <div className={`call-avatar ${call.connected ? '' : 'ringing'}`}>{call.name.charAt(0)}</div>
                  <h2>{call.connected ? call.name : `Calling ${call.name}…`}</h2>
                  <p>{call.relation ? `${call.relation} · ` : ''}{call.connected ? 'Connected (simulated Alexa call)' : 'Alexa calling'}</p>
                  <button className="hangup" onClick={() => setCall(null)} aria-label="End call">
                    End call
                  </button>
                </div>
              )}
              <div className={`glow ${light}`} />
            </div>
          </div>
          <p className="device-label">Echo Show 15 · simulated</p>
        </div>
      </section>

      <aside className="panel">
        <header className="panel-head">
          <h1>While You’re Out</h1>
          <p className="muted">An Alexa+ add-on for whoever looks after your kids and home. Real Alexa+ access is partner-only, so this simulator plays Alexa: it connects to the add-on’s MCP server like Alexa+ would.</p>
        </header>

        <div className="talk">
          <button className={`mic ${light === 'listening' ? 'on' : ''}`} onClick={() => void onMic()} disabled={!canListen || !conn} title={canListen ? 'Speak' : 'Speech recognition needs Chrome or Edge'}>
            {light === 'listening' ? 'Listening… tap to stop' : '🎤  Talk to Alexa'}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handle(draft);
              setDraft('');
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="…or type what you’d say" disabled={!conn} aria-label="What you would say" />
          </form>
          <div className="toggles">
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
            <label className="check">
              Brain{' '}
              <select
                value={brainKind}
                onChange={(e) => {
                  const v = e.target.value === 'rules' ? 'rules' : 'gemini';
                  setBrainKind(v);
                  try {
                    localStorage.setItem('wyo.brain', v);
                  } catch {
                    /* not persisted */
                  }
                }}
              >
                <option value="gemini">Gemini (free speech, any language)</option>
                <option value="rules">Rules (no AI, demo phrases)</option>
              </select>
            </label>
          </div>
        </div>

        <a className="parent-link" href={parentUrl} target="_blank" rel="noreferrer">
          <span>📱</span>
          <span>
            <b>Open the parent’s phone</b>
            <small>Answer questions, get alerts, see photos</small>
          </span>
        </a>

        {activeTasks.length > 0 && (
          <section>
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
          </section>
        )}

        <section>
          <h2>Guided demo</h2>
          <ol className="guide">
            {GUIDE.map((g) => (
              <li key={g.title}>
                <div className="guide-head">
                  <b>{g.title}</b>
                  {g.clock && demoTime && (
                    <button className="clock-chip" onClick={() => void setClock(g.clock![1], g.clock![0])} title="Move the house clock">
                      🕒 {g.clock[0]} {g.clock[1]}
                    </button>
                  )}
                </div>
                <div className="chips">
                  {g.lines.map((s) => (
                    <button key={s} className="chip" onClick={() => void handle(s)} disabled={!conn}>
                      {s}
                    </button>
                  ))}
                </div>
                {g.ring && demoTime && (
                  <div className="chips ring-chips">
                    {RINGERS.map(([who, label]) => (
                      <button key={who} className="chip ring" onClick={() => void ringDoorbell(who)} title="Simulate the Ring doorbell">
                        🔔 {label}
                      </button>
                    ))}
                  </div>
                )}
                {g.note && <p className="muted small">{g.note}</p>}
              </li>
            ))}
          </ol>
        </section>

        {demoTime && (
          <section>
            <h2>House clock</h2>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void setClock(demoInput, demoDay);
              }}
            >
              <select value={demoDay} onChange={(e) => setDemoDay(e.target.value)} aria-label="Demo day">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <input type="time" value={demoInput} onChange={(e) => setDemoInput(e.target.value)} aria-label="Demo time" />
              <button type="submit">Set</button>
            </form>
            <p className="muted small">Now: {demoTime}. Reminders fire as the plan’s steps come due.</p>
          </section>
        )}

        <details>
          <summary>Conversation</summary>
          <div className="log">
            {lines.length ? (
              lines.map((l) => (
                <p key={l.id} className={l.who}>
                  <b>{l.who === 'you' ? 'You' : 'Alexa'}:</b> {l.text}
                </p>
              ))
            ) : (
              <p className="muted">Nothing yet.</p>
            )}
          </div>
        </details>

        <details>
          <summary>Connection</summary>
          <div className="row">
            <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="MCP server URL" />
            <button onClick={() => void connect(url)}>Connect</button>
          </div>
          <p className={`conn ${connState}`}>
            {connState === 'connected' && conn
              ? `Connected to ${conn.serverName} · ${conn.tools.length} tools · MCP ${conn.protocolVersion ?? 'unknown'}`
              : connState === 'connecting'
                ? 'Connecting…'
                : `Not connected: ${connError}`}
          </p>
        </details>
      </aside>
    </div>
  );
}
