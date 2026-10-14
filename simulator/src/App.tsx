import { useCallback, useEffect, useRef, useState } from 'react';
import { McpConnection, textOf, type ElicitationHandlers, type ToolResult } from './mcp';
import { GUIDE } from './guide';
import { Elicit } from './Elicit';
import type { ElicitRequest, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import { AppFrame } from './AppFrame';
import { RuleBrain } from './brain/rules';
import { GeminiBrain } from './brain/gemini';
import { HybridBrain } from './brain/hybrid';
import type { Brain, DeviceIO } from './brain/types';
import { canListen, listenOnce, speak, stopSpeaking } from './voice';

// Served by the MCP server itself (the hosted demo): talk to that server. In development: the local one.
// Each browser gets its own demo house on the server (/h/<id>), so visitors never share an evening.
function houseId(): string {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    const saved = localStorage.getItem('wyo.house');
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const id = make();
    localStorage.setItem('wyo.house', id);
    return id;
  } catch {
    return make();
  }
}
// ?film=1: only the Echo Show, for recording the video. Space or → says the next tour line.
const FILM = new URLSearchParams(location.search).has('film');
const SERVER = location.port === '5173' ? 'http://127.0.0.1:8787' : location.origin;
const DEFAULT_URL = import.meta.env.VITE_MCP_URL ?? `${SERVER}/h/${houseId()}/mcp`;
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
interface Ring {
  snapshot: string;
  label: string;
  time: string;
}

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


type BrainKind = 'hybrid' | 'rules' | 'gemini';

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
  const [call, setCall] = useState<Call | null>(null);
  const [ring, setRing] = useState<Ring | null>(null);
  const [emergencyOn, setEmergencyOn] = useState(false);
  // Each thing said is a turn; replies are tied to the turn that asked for them.
  const turnRef = useRef(0);
  const emergencyRef = useRef(false);
  const emergencyTurnRef = useRef(0);
  const [caption, setCaption] = useState<Line | null>(null);
  const rules = useRef(new RuleBrain());
  // Rules first, Gemini only when the rules don't understand: instant, and the free key lasts.
  const [brainKind, setBrainKind] = useState<BrainKind>(() => {
    try {
      const saved = localStorage.getItem('wyo.brain3');
      return saved === 'gemini' || saved === 'rules' ? saved : 'hybrid';
    } catch {
      return 'hybrid';
    }
  });
  const [tour, setTour] = useState<[number, number]>([0, 0]);
  const [tourBusy, setTourBusy] = useState(false);
  const gemini = useRef<GeminiBrain | null>(null);
  const hybrid = useRef<HybridBrain | null>(null);
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
  const connectSeq = useRef(0);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When someone last spoke or was answered: reminders wait so they never talk over a reply.
  const lastActivity = useRef(0);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  // The add-on asking the person in front of the screen (MCP elicitation): a form, or a link for their phone.
  const [ask, setAsk] = useState<{ params: ElicitRequest['params']; resolve: (r: ElicitResult) => void } | null>(null);
  const onElicitComplete = useRef<(id: string) => void>(() => {});
  const elicitation = useRef<ElicitationHandlers>({
    elicit: (params) => new Promise<ElicitResult>((resolve) => setAsk({ params, resolve })),
    complete: (id) => onElicitComplete.current(id),
  }).current;

  const connect = useCallback(async (target: string) => {
    // Only the latest connect attempt wins; older sessions are closed, not leaked.
    const seq = ++connectSeq.current;
    setConnState('connecting');
    setConnError('');
    const previous = connRef.current;
    connRef.current = null;
    void previous?.close().catch(() => {});
    try {
      const c = await McpConnection.connect(target, elicitation);
      if (seq !== connectSeq.current) return void c.close().catch(() => {});
      connRef.current = c;
      setConn(c);
      setConnState('connected');
    } catch (e) {
      if (seq !== connectSeq.current) return;
      setConn(null);
      setConnState('error');
      const message = e instanceof Error ? e.message : String(e);
      setConnError(/failed to fetch|networkerror|load failed/i.test(message) ? `Can't reach the add-on at ${(() => { try { return new URL(target).host; } catch { return target; } })()}. Is the server running?` : message);
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

  // Where the server's other routes are: the MCP URL without /mcp (it includes the house).
  const serverOrigin = (() => {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname.replace(/\/mcp\/?$/, '')}`.replace(/\/$/, '');
    } catch {
      return '';
    }
  })();

  const makeModelBrains = useCallback(() => {
    gemini.current = new GeminiBrain({
      serverOrigin,
      tools: () => connRef.current?.tools ?? [],
      instructions: () => connRef.current?.instructions,
      fallback: rules.current,
    });
    hybrid.current = new HybridBrain(rules.current, gemini.current);
  }, [serverOrigin]);
  useEffect(() => {
    if (conn && serverOrigin) makeModelBrains();
  }, [conn, serverOrigin, makeModelBrains]);
  const pickBrain = (kind: BrainKind): Brain => (kind === 'gemini' ? gemini.current : kind === 'hybrid' ? hybrid.current : null) ?? rules.current;
  brain.current = pickBrain(brainKind);

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
      const parents = (s.parents as Array<{ name: string }> | undefined) ?? [];
      rules.current.sync({ carer: s.mode === 'carer' ? String(s.carer ?? '') : null, firstContact: parents[0]?.name ?? null, busyUntil: (s.busy_until as string | null) ?? null });
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

  const io = useCallback(
    (c: McpConnection, turn = turnRef.current): DeviceIO => ({
      say(text) {
        if (!text) return;
        // A late reply to something said before an emergency began is never spoken over the guide.
        if (emergencyRef.current && turn < emergencyTurnRef.current) return;
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
          if (name === 'emergency' || name === 'emergency_step') {
            emergencyRef.current = !result.structuredContent?.resolved;
            if (name === 'emergency') emergencyTurnRef.current = turn;
            setEmergencyOn(emergencyRef.current);
          }
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
                const closed = Boolean(update.result.structuredContent?.closed);
                const outcome = closed ? 'Closed: the evening ended.' : textOf(update.result);
                setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true, statuses: [...t.statuses, outcome] } : t)));
                void refreshHome(c);
                if (closed) continue;
                await showCard(c, name, args, update.result, true);
                onDone(update.result);
              }
            }
          } catch (e) {
            setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true, statuses: [...t.statuses, `Failed: ${String(e)}`] } : t)));
          }
        })();
      },
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

  // The payment page on the phone finished (notifications/elicitation/complete): say so here.
  useEffect(() => {
    onElicitComplete.current = async () => {
      const c = connRef.current;
      if (!c) return;
      const s = cardRef.current?.result.structuredContent;
      if (s?.view !== 'pay' || typeof s.id !== 'number') return io(c).say('Done.');
      const r = await c.call('payment_status', { id: s.id });
      await showCard(c, 'payment_status', { id: s.id }, r);
      io(c).say(textOf(r));
    };
  }, [io, showCard]);

  const handle = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text || !conn) return;
      stopSpeaking();
      // Whoever spoke has seen the doorbell photo; the answer must not hide behind it.
      setRing(null);
      addLine('you', text);
      armCardTimer();
      lastActivity.current = Date.now();
      setLight('thinking');
      const turn = ++turnRef.current;
      try {
        await brain.current.handle(text, io(conn, turn));
        lastActivity.current = Date.now();
        setLight((l) => (l === 'thinking' ? 'idle' : l));
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
        if (!s.active) {
          emergencyRef.current = false;
          return setEmergencyOn(false);
        }
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

  // Tonight can change from the parent's phone (busy mode, a new rule): keep what the device knows fresh.
  useEffect(() => {
    if (!conn) return;
    const t = setInterval(() => void refreshHome(conn), 20_000);
    return () => clearInterval(t);
  }, [conn, refreshHome]);

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
  const [tourStep, tourAt] = tour;
  const step = GUIDE[tourStep];
  const nextAction = step.actions[tourAt];
  // A reload mid-demo keeps the server's house as it was; the tour's first step starts it afresh.
  const resetDemo = async () => {
    stopSpeaking();
    await fetch(`${serverOrigin}/demo/reset`, { method: 'POST' }).catch(() => null);
    rules.current = new RuleBrain();
    makeModelBrains();
    brain.current = pickBrain(brainKind);
    emergencyRef.current = false;
    setEmergencyOn(false);
    setCard(null);
    setTasks([]);
    setCarer(null);
    if (connRef.current) await refreshHome(connRef.current);
  };
  const runTour = async () => {
    if (tourBusy) return;
    if (!nextAction) return setTour([tourStep < GUIDE.length - 1 ? tourStep + 1 : 0, 0]);
    setTourBusy(true);
    try {
      if (tourStep === 0 && tourAt === 0 && demoTime) await resetDemo();
      if (tourAt === 0 && step.clock && demoTime) await setClock(step.clock[1], step.clock[0]);
      if ('ring' in nextAction) await ringDoorbell(nextAction.ring);
      else await handle(nextAction.say);
      setTour([tourStep, tourAt + 1]);
    } finally {
      setTourBusy(false);
    }
  };
  // Filming: the keyboard drives the tour, since the panel is hidden.
  const runTourRef = useRef(runTour);
  runTourRef.current = runTour;
  useEffect(() => {
    if (!FILM) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        void runTourRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
    <div className={`page ${FILM ? 'film' : ''}`}>
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

              {ring && (
                <div className="overlay ring-view" onClick={() => setRing(null)} role="alert">
                  <img src={ring.snapshot} alt={`Doorbell camera: ${ring.label}`} />
                  <div className="ring-top">🔔 Front Door · {ring.time}</div>
                  <div className="ring-bottom">Someone is at the front door. Ask “Should I open the door?”</div>
                </div>
              )}
              {ask && (
                <Elicit
                  params={ask.params}
                  onDone={(r) => {
                    ask.resolve(r);
                    setAsk(null);
                  }}
                />
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

      {!FILM && (
      <aside className="panel">
        <header className="panel-head">
          <h1>While You’re Out</h1>
          <p className="muted">An Alexa+ add-on that turns the Echo Show into a guide for whoever is babysitting. This page plays Alexa.</p>
        </header>

        <section className="tour" aria-label="Guided demo">
          <div className="tour-top">
            <span>
              Step {tourStep + 1} of {GUIDE.length}
            </span>
            <div className="dots">
              {GUIDE.map((g, i) => (
                <button key={g.title} className={`dot ${i === tourStep ? 'on' : i < tourStep ? 'past' : ''}`} onClick={() => setTour([i, 0])} aria-label={`Step ${i + 1}: ${g.title}`} title={g.title} />
              ))}
            </div>
          </div>
          <h2 className="tour-title">{step.title}</h2>
          <p className="tour-note">{step.note}</p>
          <ol className="tour-lines">
            {step.actions.map((a, i) => (
              <li key={i} className={i < tourAt ? 'done' : i === tourAt ? 'now' : ''}>
                {'ring' in a ? '🔔 The doorbell rings' : `“${a.say}”`}
              </li>
            ))}
          </ol>
          {nextAction ? (
            <button className="tour-go" onClick={() => void runTour()} disabled={!conn || tourBusy}>
              {tourBusy ? 'Alexa is answering…' : 'ring' in nextAction ? '🔔  Ring the doorbell' : `▶  Say “${nextAction.say}”`}
            </button>
          ) : (
            <button className="tour-go next" onClick={() => setTour([tourStep < GUIDE.length - 1 ? tourStep + 1 : 0, 0])}>
              {tourStep < GUIDE.length - 1 ? `Next: ${GUIDE[tourStep + 1].title}  →` : 'Start over'}
            </button>
          )}
        </section>

        <div className="talk">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handle(draft);
              setDraft('');
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type anything Priya would say…" disabled={!conn} aria-label="What you would say" />
          </form>
          <button className={`mic ${light === 'listening' ? 'on' : ''}`} onClick={() => void onMic()} disabled={!canListen || !conn} title={canListen ? 'Speak' : 'Speech recognition needs Chrome or Edge'} aria-label="Talk to Alexa">
            {light === 'listening' ? '■' : '🎤'}
          </button>
        </div>

        <a className="parent-link" href={parentUrl} target="_blank" rel="noreferrer">
          <span>📱</span>
          <span>
            <b>Open the parent’s phone</b>
            <small>Answer questions, get alerts</small>
          </span>
        </a>

        {activeTasks.length > 0 && (
          <section>
            <h2>Asking the parents</h2>
            {activeTasks.map((t) => (
              <div key={t.id} className={`task ${t.done ? 'done' : ''}`}>
                <strong>“{t.question}”</strong>
                <ul>
                  {t.statuses.map((st, i) => (
                    <li key={i}>{st}</li>
                  ))}
                </ul>
              </div>
            ))}
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
          <summary>Settings</summary>
          <div className="settings">
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
              Speak replies out loud
            </label>
            <label className="check">
              Understanding{' '}
              <select
                value={brainKind}
                onChange={(e) => {
                  const v: BrainKind = e.target.value === 'gemini' || e.target.value === 'rules' ? e.target.value : 'hybrid';
                  setBrainKind(v);
                  try {
                    localStorage.setItem('wyo.brain3', v);
                  } catch {
                    /* not persisted */
                  }
                }}
              >
                <option value="hybrid">Rules first, Gemini when needed (recommended)</option>
                <option value="rules">Built-in rules only (instant, English)</option>
                <option value="gemini">Gemini for everything (slower, uses the daily quota)</option>
              </select>
            </label>
            {demoTime && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void setClock(demoInput, demoDay);
                }}
              >
                <span className="check">House clock</span>
                <select value={demoDay} onChange={(e) => setDemoDay(e.target.value)} aria-label="Demo day">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <input type="time" value={demoInput} onChange={(e) => setDemoInput(e.target.value)} aria-label="Demo time" />
                <button type="submit">Set</button>
              </form>
            )}
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
          </div>
        </details>
      </aside>
      )}
    </div>
  );
}
