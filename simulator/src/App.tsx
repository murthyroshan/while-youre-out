import { useCallback, useEffect, useRef, useState } from 'react';
import { McpConnection, textOf, type ElicitationHandlers, type ToolResult } from './mcp';
import { GUIDE, HIGHLIGHTS, MOMENTS, type TourAction } from './guide';
import { Elicit } from './Elicit';
import { PhoneFrame } from './PhoneFrame';
import { House } from './House';
import { Qr } from './Qr';
import { Icon, LogoMark, Segmented, Switch } from './ui';
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
// ?embed=1: only the Echo Show's screen, edge to edge, for the website's 3D house. It talks to the
// page that embeds it (only the project's own site, or a local one) through postMessage.
const EMBED = new URLSearchParams(location.search).has('embed');
const FILM = new URLSearchParams(location.search).has('film') || EMBED;
const EMBEDDER = (() => {
  if (!EMBED) return null;
  try {
    const origin = new URL(document.referrer).origin;
    return /^https:\/\/murthyroshan\.github\.io$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) ? origin : null;
  } catch {
    return null;
  }
})();
/** Tells the embedding page what happened (a tool ran, Alexa said something). */
const tellEmbedder = (msg: Record<string, unknown>) => {
  if (EMBEDDER) window.parent.postMessage({ source: 'wyo', ...msg }, EMBEDDER);
};
// ?moment=door (see MOMENTS in guide.ts): skip ahead to that part of the evening and play from
// there, for links straight to a highlight; ?moment=highlights plays just the highlights.
const momentAsked = new URLSearchParams(location.search).get('moment') ?? '';
const MOMENT = momentAsked === 'highlights' ? 0 : GUIDE.findIndex((g) => g.title === MOMENTS[momentAsked]);
const MOMENT_ONLY = momentAsked === 'highlights' ? HIGHLIGHTS : undefined;
// ?phone=0 hides Mom's phone (it shows beside the Echo Show on wide screens).
const PHONE_PARAM = new URLSearchParams(location.search).get('phone');
const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not persisted */
  }
};
type DeviceSize = '15' | '10' | '8';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** "18:00" -> "6:00 pm" */
const clockLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const DEVICE_NAMES: Record<DeviceSize, string> = { '15': 'Echo Show 15', '10': 'Echo Show 10', '8': 'Echo Show 8' };
// The screen's own resolution: cards lay out exactly as on the device, then the screen is scaled.
const SCREEN: Record<DeviceSize, { w: number; h: number }> = { '15': { w: 1280, h: 720 }, '10': { w: 1280, h: 800 }, '8': { w: 1280, h: 800 } };
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
  const lightRef = useRef(light);
  const lastSaid = useRef('');
  lightRef.current = light;
  // Mom's phone beside the Echo Show; the pay page opens in it.
  const [phoneOn, setPhoneOn] = useState(() => PHONE_PARAM !== '0' && stored('wyo.phone') !== 'off' && window.innerWidth >= 1100);
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);
  const [phoneRev, setPhoneRev] = useState(0);
  // Cards are tested in both themes, as the Alexa+ design guide asks.
  const [cardTheme, setCardTheme] = useState<'light' | 'dark'>(() => (stored('wyo.theme') === 'light' ? 'light' : 'dark'));
  const [deviceSize, setDeviceSize] = useState<DeviceSize>(() => (stored('wyo.size') === '8' || stored('wyo.size') === '10' ? (stored('wyo.size') as DeviceSize) : '15'));
  // "Watch the evening": the whole story plays by itself.
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [chapter, setChapter] = useState<{ time: string | null; title: string; note: string } | null>(null);
  const [welcome, setWelcome] = useState(() => !FILM && MOMENT < 0 && !stored('wyo.welcomed'));
  // While the evening skips ahead to a moment: what it is skipping to.
  const [skipping, setSkipping] = useState<{ time: string | null; title: string } | null>(null);
  const hushRef = useRef(false);
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
  // Mom's side of the evening, from the guided demo: what she tells her Bee, the door from her phone.
  const tellBee = async (text: string) => {
    const first = ((home?.result.structuredContent?.parents as Array<{ name: string }> | undefined) ?? [])[0]?.name ?? 'Mom';
    await fetch(`${serverOrigin}/demo/bee`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, by: first }) }).catch(() => null);
  };
  const unlockFromPhone = async () => {
    const first = ((home?.result.structuredContent?.parents as Array<{ name: string }> | undefined) ?? [])[0]?.name ?? 'Mom';
    let k = PARENT_KEY;
    try {
      k = new URL(parentUrl).searchParams.get('k') ?? k;
    } catch {}
    await fetch(`${serverOrigin}/parent/api/door`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, action: 'unlock', by: first }) }).catch(() => null);
  };
  const approveFromPhone = async () => {
    const first = ((home?.result.structuredContent?.parents as Array<{ name: string }> | undefined) ?? [])[0]?.name ?? 'Mom';
    let k = PARENT_KEY;
    try {
      k = new URL(parentUrl).searchParams.get('k') ?? k;
    } catch {}
    const s = await fetch(`${serverOrigin}/parent/api/state?k=${encodeURIComponent(k)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!s?.order?.id || s.order.status !== 'pending') return;
    await fetch(`${serverOrigin}/parent/api/order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, id: s.order.id, action: 'approve', by: first }) }).catch(() => null);
  };
  /** Mom pastes her message on her phone, then confirms each rule it found (the phone beside the Echo Show shows it). */
  const pasteFromPhone = async (text: string) => {
    const first = ((home?.result.structuredContent?.parents as Array<{ name: string }> | undefined) ?? [])[0]?.name ?? 'Mom';
    let k = PARENT_KEY;
    try {
      k = new URL(parentUrl).searchParams.get('k') ?? k;
    } catch {}
    const post = (path: string, body: Record<string, unknown>) =>
      fetch(`${serverOrigin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, by: first, ...body }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const out = await post('/parent/api/import/text', { text, label: 'WhatsApp message' });
    const found = ((out?.proposals as Array<{ id: number; import_id: number }> | undefined) ?? []).filter((p) => p.import_id === out?.import_id || out?.import_id === undefined);
    await wait(playingRef.current ? 2500 : 300); // long enough to see the rules arrive on her phone
    for (const p of found) await post(`/parent/api/proposals/${p.id}`, { action: 'accept', resolution: 'keep_both' });
  };
  const runAction = async (a: TourAction) => {
    if ('paste' in a) return pasteFromPhone(a.paste);
    if ('ring' in a) return ringDoorbell(a.ring);
    if ('approve' in a) return approveFromPhone();
    if ('bee' in a) return tellBee(a.bee);
    if ('door' in a) return unlockFromPhone();
    return handle(a.say);
  };

  const ringDoorbell = async (who: string) => {
    const r = await fetch(`${serverOrigin}/demo/ring`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who }) }).catch(() => null);
    if (!r?.ok) return;
    const ev = await r.json();
    chime();
    setRing({ snapshot: `${serverOrigin}${ev.snapshot_url}`, label: ev.label, time: ev.time });
    addLine('alexa', 'Someone is at the front door.');
    if (voiceRef.current && !hushRef.current) void speak('Someone is at the front door.', 'en-US', () => setLight('speaking'), () => setLight('idle'));
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
        lastSaid.current = text;
        // A late reply to something said before an emergency began is never spoken over the guide.
        if (emergencyRef.current && turn < emergencyTurnRef.current) return;
        addLine('alexa', text);
        tellEmbedder({ type: 'said', text });
        armCardTimer();
        // Non-English replies are translated by the server; speak them with a voice for that language.
        const lang = /[^ -ɏ]/.test(text) || langRef.current !== 'en-US' ? langRef.current : 'en-US';
        if (voiceRef.current && !hushRef.current) void speak(text, lang, () => setLight('speaking'), () => setLight('idle'));
      },
      async tool(name, args = {}) {
        setLight('thinking');
        try {
          const result = await c.call(name, args);
          tellEmbedder({ type: 'tool', name, args, isError: Boolean(result.isError), view: result.structuredContent?.view ?? null });
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
      // A full-screen card from before (the goodnight message, a summary) gives way to what's next;
      // the emergency guide stays until it is over.
      setCard((c) => (c && c.mode === 'fullscreen' && c.tool !== 'emergency' && c.tool !== 'emergency_step' ? null : c));
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

  // A reload mid-emergency: the server still has it, so the guide comes back on screen and the
  // device listens for "done" and "it's over" again (not for house questions).
  useEffect(() => {
    if (!conn) return;
    let stopped = false;
    void (async () => {
      try {
        const r = await conn.call('emergency_status', { announce: false });
        if (stopped || !r.structuredContent?.active) return;
        emergencyRef.current = true;
        setEmergencyOn(true);
        rules.current.resumeEmergency();
        await showCard(conn, 'emergency_status', { announce: false }, r);
      } catch {
        // no emergency to resume
      }
    })();
    return () => {
      stopped = true;
    };
  }, [conn, showCard]);

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

  const checkReminders = useRef<() => Promise<void>>(async () => {});
  // While someone is babysitting, the device reminds them when a step of tonight's plan comes due.
  useEffect(() => {
    if (!conn || !carer) return;
    let stopped = false;
    const tick = async (now = false) => {
      // Taking an announcement marks it said, so only ask when the device is free to say it.
      if (!now && Date.now() - lastActivity.current < 8000) return;
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
    checkReminders.current = () => tick(true);
    const t = setInterval(tick, 15_000);
    return () => {
      stopped = true;
      clearInterval(t);
      checkReminders.current = async () => {};
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
  const embedHandle = useRef(handle);
  embedHandle.current = handle;
  const embedRing = useRef(ringDoorbell);
  embedRing.current = ringDoorbell;
  useEffect(() => {
    if (!EMBEDDER) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== EMBEDDER || e.data?.target !== 'wyo') return;
      if (e.data.type === 'say' && typeof e.data.text === 'string') void embedHandle.current(e.data.text.slice(0, 300));
      if (e.data.type === 'ring' && typeof e.data.who === 'string') void embedRing.current(e.data.who);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (connState === 'connected' && parentUrl !== '#') tellEmbedder({ type: 'ready', parentUrl });
  }, [connState, parentUrl]);
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
      await runAction(nextAction);
      setTour([tourStep, tourAt + 1]);
    } finally {
      setTourBusy(false);
    }
  };
  // ---------- "Watch the evening": the guided demo plays itself, and Mom answers on her phone ----------
  const parentKey = (() => {
    try {
      return new URL(parentUrl).searchParams.get('k') ?? PARENT_KEY;
    } catch {
      return PARENT_KEY;
    }
  })();
  /** Until Alexa has finished talking (and thinking), within limits. */
  const quiet = async (min = 900, max = 14_000) => {
    const started = Date.now();
    await wait(min);
    while (playingRef.current && Date.now() - started < max && (window.speechSynthesis?.speaking || lightRef.current === 'thinking' || lightRef.current === 'speaking')) await wait(250);
    await wait(500);
  };
  const pendingQuestions = async () => {
    const s = await fetch(`${serverOrigin}/parent/api/state?k=${encodeURIComponent(parentKey)}`).then((x) => x.json()).catch(() => null);
    return (s?.questions as Array<{ id: number; text: string }> | undefined) ?? null;
  };
  /** What Mom would tap on her phone; the phone beside the Echo Show shows it happen. When the
   *  visitor's own phone is connected, they answer it there; Mom only steps in if they don't. */
  const answerAsMom = async (match: RegExp, answer: string, fast = false) => {
    for (let i = 0; i < 24 && playingRef.current; i++) {
      const q = (await pendingQuestions())?.find((x) => match.test(x.text));
      if (q) {
        if (phonesRef.current > 0 && !fast) {
          setChapter((c) => (c ? { ...c, note: 'Check your phone: Priya is asking you. Answer it there.' } : c));
          for (let t = 0; t < 45 && playingRef.current; t++) {
            await wait(1000);
            const still = await pendingQuestions();
            if (still && !still.some((x) => x.id === q.id)) return quiet(1500);
          }
          if (!playingRef.current) return;
        }
        if (!fast) await wait(3000); // long enough to see it arrive on the phone
        await fetch(`${serverOrigin}/parent/api/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ k: parentKey, id: q.id, answer, by: 'Anita', scope: 'tonight' }),
        }).catch(() => null);
        return fast ? undefined : quiet(1500);
      }
      await wait(fast ? 200 : 500);
    }
  };
  const directions: Record<string, (fast: boolean) => Promise<unknown>> = {
    // Keyed by the step's title, not its number: steps can be added without breaking these.
    'The evening goes on:We ran out of diapers': (fast) => answerAsMom(/shopping list/i, 'Yes, add it to the list.', fast),
    "A knock at the door:Someone's knocking, should I open the door?": (fast) => answerAsMom(/front door/i, "Don't open the door. I'll call you.", fast),
    'Ask a parent:Yes': (fast) => answerAsMom(/sleep in your bed/i, "Yes, that's fine.", fast),
    'Emergency:I gave the EpiPen': async (fast) => {
      if (!fast) await wait(1500);
      await fetch(`${serverOrigin}/parent/api/incident`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ k: parentKey, action: 'on_the_way', minutes: 10, by: 'Anita' }),
      }).catch(() => null);
      if (!fast) await quiet(2500);
    },
    'Lights out:Maya misses her mom': async (fast) => {
      if (!fast) await wait(6000); // the message plays
      await checkReminders.current(); // lights out: the house gets ready for bed
      if (!fast) await quiet(1500);
    },
  };
  const stopPlaying = () => {
    playingRef.current = false;
    setPlaying(false);
    setChapter(null);
    stopSpeaking();
  };
  /** Plays the evening from chapter `from`; the chapters before it happen first, silently and fast.
   *  With `only` (the highlights), just those chapters play; the rest happen silently, and it ends
   *  after the last of them. */
  const playEvening = async (from = 0, only?: string[]) => {
    if (playingRef.current || !conn) return;
    const pick = only ? new Set(only) : null;
    const first = pick ? Math.max(0, GUIDE.findIndex((g) => pick.has(g.title))) : from;
    const last = pick ? Math.max(...GUIDE.map((g, i) => (pick.has(g.title) ? i : -1))) : GUIDE.length - 1;
    playingRef.current = true;
    setPlaying(true);
    setWelcome(false);
    store('wyo.welcomed', '1');
    try {
      for (let si = 0; si <= last && playingRef.current; si++) {
        const g = GUIDE[si];
        const fast = si < first || (pick !== null && !pick.has(g.title));
        setTour([si, 0]);
        if (fast) {
          const next = GUIDE.findIndex((x, i) => i > si && (!pick || pick.has(x.title)));
          const upto = next < 0 ? first : next;
          const target = GUIDE.slice(0, upto + 1).reverse().find((x) => x.clock);
          setSkipping({ time: target?.clock ? clockLabel(target.clock[1]) : null, title: GUIDE[upto].title });
          hushRef.current = true;
        } else if (hushRef.current) {
          // Late replies from the skipped part land behind the curtain, then the stage is cleared.
          await wait(900);
          hushRef.current = false;
          brain.current = pickBrain(brainKind);
          stopSpeaking();
          setCard(null);
          setRing(null);
          setSkipping(null);
        }
        if (!fast) setChapter({ time: g.clock ? clockLabel(g.clock[1]) : null, title: g.title, note: g.note });
        if (si === 0) await resetDemo();
        // While skipping, the rules answer: they know every line of the tour, and answer at once.
        if (fast) brain.current = rules.current;
        if (g.clock && demoTime) await setClock(g.clock[1], g.clock[0]);
        if (!fast) await wait(1800);
        for (let ai = 0; ai < g.actions.length && playingRef.current; ai++) {
          const a = g.actions[ai];
          lastSaid.current = '';
          await runAction(a);
          setTour([si, ai + 1]);
          if (fast) setRing(null);
          const words = lastSaid.current.split(/\s+/).filter(Boolean).length;
          if (!fast) await quiet(Math.min(9000, Math.max(2200, words * 330)));
          if ('say' in a) await directions[`${g.title}:${a.say}`]?.(fast);
        }
        if (!fast) await wait(1200);
      }
    } finally {
      if (hushRef.current) brain.current = pickBrain(brainKind);
      hushRef.current = false;
      setSkipping(null);
      playingRef.current = false;
      setPlaying(false);
      setChapter(null);
    }
  };
  // A link to a moment plays from there as soon as the house is connected.
  const momentStarted = useRef(false);
  useEffect(() => {
    if (MOMENT < 0 || momentStarted.current || connState !== 'connected' || !conn || demoTime === null) return;
    momentStarted.current = true;
    void playEvening(MOMENT, MOMENT_ONLY);
  });

  // The keyboard drives the tour too (Space or →), unless someone is typing.
  const runTourRef = useRef(runTour);
  runTourRef.current = runTour;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing || playingRef.current) return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        void runTourRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!ask || !playing || ask.params.mode !== 'url') return;
    const url = String((ask.params as { url?: string }).url ?? '');
    ask.resolve({ action: 'accept' });
    setAsk(null);
    setPhoneUrl(url);
    void (async () => {
      await wait(4500);
      await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pay', tip: 1000 }) }).catch(() => null);
      setPhoneRev((v) => v + 1);
      await wait(6000);
      setPhoneUrl(null);
    })();
  }, [ask, playing]);
  const showPhone = phoneOn && connState === 'connected' && parentUrl !== '#';
  // Real phones with this house's parent page open ("Use your own phone").
  const [phones, setPhones] = useState(0);
  const [scan, setScan] = useState(false);
  const closeScan = useCallback(() => setScan(false), []);
  const phonesRef = useRef(0);
  phonesRef.current = phones;
  useEffect(() => {
    if (connState !== 'connected' || !serverOrigin) return;
    let alive = true;
    const check = () =>
      fetch(`${serverOrigin}/parent/api/presence?k=${encodeURIComponent(parentKey)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => alive && setPhones(typeof p?.phones === 'number' ? p.phones : 0))
        .catch(() => null);
    void check();
    const t = setInterval(check, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [connState, serverOrigin, parentKey]);
  // A phone can only open the hosted demo (a laptop's 127.0.0.1 means nothing to it).
  // (In development it shows anyway, so the layout can be checked.)
  const qrUrl = /^https:\/\//.test(parentUrl) || /^http:\/\/(?!127\.|localhost)/.test(parentUrl) || import.meta.env.DEV ? parentUrl : undefined;
  // Scale the device's screen to the space it has.
  const fitRef = useRef<HTMLDivElement>(null);
  const [screenScale, setScreenScale] = useState(0.5);
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const fit = () => setScreenScale(el.clientWidth / SCREEN[deviceSize].w || 0.5);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [deviceSize]);
  // A new card starts at the top of the screen.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stageRef.current) stageRef.current.scrollTop = 0;
  }, [card?.id]);
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
    theme: cardTheme,
    deviceClass: `echo-show-${deviceSize}`,
  });

  // The room's light follows the device: Alexa's cyan while she listens or speaks, red in an
  // emergency, a warm dim glow after lights out.
  const night = Boolean(home?.result.structuredContent?.night);
  const ambient = emergencyOn ? 'alert' : light !== 'idle' ? light : night ? 'night' : carer ? 'evening' : 'idle';
  const houseTime = demoTime ? `${demoTime.slice(0, 3)} ${clockText.toLowerCase()}` : clockText;

  return (
    <div className={`page ${FILM ? 'film' : ''} ${EMBED ? 'embed' : ''} amb-${ambient}`}>
      <section className={`wall ${showPhone ? 'with-phone' : ''} ${chapter ? 'playing' : ''}`} aria-label="Echo Show simulator">
        <div className="scene" aria-hidden="true">
          <i className="scene-lamp" />
          <i className="scene-counter" />
        </div>
        <div className="ambient" aria-hidden="true" />

        {!FILM && (
          <header className="stage-top">
            <div className="brand">
              <LogoMark size={34} />
              <span>
                <b>While You’re Out</b>
                <small>Alexa+ add-on · live demo</small>
              </span>
            </div>
            <div className="stage-chips">
              <span className="chip">
                <Icon name="clock" size={14} /> {houseTime}
              </span>
              <span className={`chip conn-chip ${connState}`}>
                <i className="live-dot" /> {connState === 'connected' ? 'Your own demo house' : connState === 'connecting' ? 'Connecting…' : 'Offline'}
              </span>
              {showPhone && qrUrl && (
                <button className={`chip scan-pill ${phones > 0 ? 'joined' : ''}`} onClick={() => setScan((v) => !v)} aria-expanded={scan}>
                  {phones > 0 ? 'Your phone is connected' : 'Use your own phone'}
                </button>
              )}
            </div>
          </header>
        )}

        {chapter && (
          <div className="chapter" aria-live="polite" key={chapter.title}>
            <span className="chapter-step">
              {tourStep + 1}/{GUIDE.length}
            </span>
            {chapter.time && <span className="chapter-time">{chapter.time}</span>}
            <b>{chapter.title}</b>
            <span className="chapter-note">{chapter.note}</span>
            <i className="chapter-progress" style={{ transform: `scaleX(${(tourStep + 1) / GUIDE.length})` }} />
          </div>
        )}

        <div className="stage-row">
          <div className={`device size-${deviceSize}`}>
            <div className="bezel">
              <div className="camera" />
              <div className="screen-fit" ref={fitRef}>
                <div
                  className={`screen ${fullscreen || showingHome ? 'is-fullscreen' : ''}`}
                  style={{ width: SCREEN[deviceSize].w, height: SCREEN[deviceSize].h, transform: `scale(${screenScale})` }}
                >
                  {!fullscreen && !showingHome && (
                    <header className="statusbar">
                      <span className="clock">{clockText}</span>
                      <span className={`mode ${carer ? 'carer' : ''}`}>{carer ? `Sitter mode · ${carer}` : 'Parent mode'}</span>
                    </header>
                  )}

                  <div className="stage" ref={stageRef}>
                    {home && (
                      <div className={`home-layer ${showingHome ? '' : 'hidden'}`}>
                        <AppFrame key={home.id} {...cardProps(home)} displayMode="fullscreen" />
                      </div>
                    )}
                    {card && (
                      <AppFrame
                        key="card"
                        resetKey={card.id}
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
                    <div className={`caption ${interim ? 'you' : caption?.who}`} aria-live="polite" key={interim ? 'interim' : caption?.id}>
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
                      <div className="ring-top">
                        <i className="live-dot" /> Front door · {ring.time}
                      </div>
                      <div className="ring-bottom">
                        <b>Someone is at the front door.</b> Ask “Should I open the door?”
                      </div>
                    </div>
                  )}
                  {ask && !(playing && ask.params.mode === 'url') && (
                    <Elicit
                      params={ask.params}
                      openUrl={showPhone ? (u) => setPhoneUrl(u) : undefined}
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
                      <p>
                        {call.relation ? `${call.relation} · ` : ''}
                        {call.connected ? 'Connected (simulated Alexa call)' : 'Alexa calling'}
                      </p>
                      <button className="hangup" onClick={() => setCall(null)} aria-label="End call">
                        End call
                      </button>
                    </div>
                  )}
                  <div className={`glow ${light}`} />
                  <i className="glass" aria-hidden="true" />
                </div>
              </div>
            </div>
            <p className="device-label">{DEVICE_NAMES[deviceSize]} · simulated</p>
          </div>
          {showPhone && (
            <PhoneFrame
              key={`${phoneUrl ?? parentUrl}#${phoneRev}`}
              src={phoneUrl ?? parentUrl}
              time={clockText.replace(/\s?[AP]M$/i, '')}
              showHome={Boolean(phoneUrl)}
              onHome={() => setPhoneUrl(null)}
              qrUrl={qrUrl}
              phones={phones}
              scan={scan}
              onScanClose={closeScan}
            />
          )}
        </div>
        {/* The rest of the house: the TV, the child's room, the front door and Mom's Bee. */}
        {!EMBED && connState === 'connected' && (
          <House
            serverOrigin={serverOrigin}
            active={connState === 'connected'}
            parentName={((home?.result.structuredContent?.parents as Array<{ name: string }> | undefined) ?? [])[0]?.name ?? 'Mom'}
          />
        )}

        {skipping && (
          <div className="skipping" role="status" aria-live="polite">
            <div className="skip-card">
              <span className="skip-spin" aria-hidden="true" />
              <small>Skipping ahead{skipping.time ? ` to ${skipping.time}` : ''}</small>
              <b>{skipping.title}</b>
            </div>
          </div>
        )}

        {welcome && connState === 'connected' && (
          <div className="welcome" role="dialog" aria-label="Welcome">
            <div className="welcome-card">
              <LogoMark size={52} />
              <p className="welcome-eyebrow">An Alexa+ add-on for Echo Show</p>
              <h2>Tonight, Priya is babysitting Maya.</h2>
              <p>
                The Echo Show in the kitchen becomes her guide.{' '}
                {showPhone ? 'Mom’s phone, on the right, is how the parents stay in the loop.' : 'Mom’s phone stays in the loop (open it from the demo controls).'} Watch the highlights, or try it
                yourself.
              </p>
              {qrUrl && showPhone && (
                <div className="welcome-scan">
                  <Qr text={qrUrl} label="QR code that opens Anita’s parent page on your phone" />
                  <p>
                    <b>{phones > 0 ? 'Your phone is connected.' : 'Got your phone? Be Mom.'}</b>
                    {phones > 0 ? ' Priya’s questions will arrive on it while the evening plays.' : ' Scan this and Priya’s questions arrive on your phone. Your answer reaches the kitchen.'}
                  </p>
                </div>
              )}
              <div className="welcome-btns">
                <button className="primary" onClick={() => void playEvening(0, HIGHLIGHTS)}>
                  <Icon name="play" /> Watch the highlights <small>2½ min</small>
                </button>
                <button onClick={() => void playEvening()}>
                  The whole evening <small>5 min</small>
                </button>
                <button
                  onClick={() => {
                    setWelcome(false);
                    store('wyo.welcomed', '1');
                  }}
                >
                  Try it myself
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {!FILM && (
        <aside className={`panel ${welcome && connState === 'connected' ? 'behind' : ''}`}>
          <header className="panel-head">
            <div>
              <p className="eyebrow">Demo controls</p>
              <h1>Try the evening</h1>
              <p>This page plays Alexa. Watch it all, tap a line below, or type and speak like Priya would.</p>
            </div>
          </header>

          <button className={`watch ${playing ? 'on' : ''}`} onClick={() => (playing ? stopPlaying() : void playEvening(0, HIGHLIGHTS))} disabled={!conn}>
            <span className="watch-icon">
              <Icon name={playing ? 'stop' : 'play'} size={20} />
            </span>
            <span className="watch-text">
              <b>{playing ? 'Stop watching' : 'Watch the highlights'}</b>
              <small>{playing ? `${GUIDE[tourStep].title} · ${tourStep + 1} of ${GUIDE.length}` : '2½ min · hands-free · Mom answers on her phone'}</small>
            </span>
            {playing && <i className="watch-progress" style={{ transform: `scaleX(${(tourStep + 1) / GUIDE.length})` }} />}
          </button>
          {!playing && (
            <button className="watch-short" onClick={() => void playEvening()} disabled={!conn}>
              <Icon name="play" size={14} /> The whole evening <small>About 5 min: from the handover to the parents coming home</small>
            </button>
          )}

          <section className={`timeline ${playing ? 'auto' : ''}`} aria-label="The evening, step by step">
            <div className="timeline-head">
              <span>The evening, step by step</span>
              <span className="tab">
                {tourStep + 1}/{GUIDE.length}
              </span>
            </div>
            <ol>
              {GUIDE.map((g, i) => (
                <li key={g.title} className={`chap ${i < tourStep ? 'done' : i === tourStep ? 'now' : ''}`}>
                  <button className="chap-row" onClick={() => setTour([i, 0])} disabled={playing} aria-current={i === tourStep ? 'step' : undefined}>
                    <span className="chap-dot">{i < tourStep ? <Icon name="check" size={13} /> : i + 1}</span>
                    <span className="chap-title">{g.title}</span>
                    {g.clock && <span className="chap-time tab">{clockLabel(g.clock[1])}</span>}
                  </button>
                  {i === tourStep && (
                    <div className="chap-body">
                      <p className="chap-note">{g.note}</p>
                      <ol className="tour-lines">
                        {g.actions.map((a, j) => (
                          <li key={j} className={j < tourAt ? 'done' : j === tourAt ? 'now' : ''}>
                            {'ring' in a ? (
                              <>
                                <Icon name="bell" size={14} /> The doorbell rings
                              </>
                            ) : 'bee' in a ? (
                              <>
                                <Icon name="spark" size={14} /> Mom tells her Bee: “{a.bee}”
                              </>
                            ) : 'door' in a ? (
                              <>
                                <Icon name="phone" size={14} /> Mom unlocks the front door from her phone
                              </>
                            ) : 'approve' in a ? (
                              <>
                                <Icon name="phone" size={14} /> Mom approves the order on her phone
                              </>
                            ) : 'paste' in a ? (
                              <>
                                <Icon name="phone" size={14} /> Mom pastes her WhatsApp message and confirms it
                              </>
                            ) : (
                              `“${a.say}”`
                            )}
                          </li>
                        ))}
                      </ol>
                      {nextAction ? (
                        <button className="tour-go" onClick={() => void runTour()} disabled={!conn || tourBusy || playing}>
                          <Icon name={tourBusy ? 'spark' : 'ring' in nextAction ? 'bell' : 'bee' in nextAction ? 'spark' : 'door' in nextAction || 'approve' in nextAction || 'paste' in nextAction ? 'phone' : 'play'} size={16} />
                          <span>
                            {tourBusy
                              ? 'Alexa is answering…'
                              : 'ring' in nextAction
                                ? 'Ring the doorbell'
                                : 'bee' in nextAction
                                  ? 'Tell Mom’s Bee'
                                  : 'door' in nextAction
                                    ? 'Unlock it from Mom’s phone'
                                    : 'approve' in nextAction
                                      ? 'Approve it on Mom’s phone'
                                      : 'paste' in nextAction
                                        ? 'Paste Mom’s message on her phone'
                                        : `Say “${nextAction.say}”`}
                          </span>
                        </button>
                      ) : (
                        <button className="tour-go next" onClick={() => setTour([tourStep < GUIDE.length - 1 ? tourStep + 1 : 0, 0])} disabled={playing}>
                          <span>{tourStep < GUIDE.length - 1 ? `Next: ${GUIDE[tourStep + 1].title}` : 'Start over'}</span>
                          <Icon name="send" size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <form
            className="composer talk"
            onSubmit={(e) => {
              e.preventDefault();
              void handle(draft);
              setDraft('');
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type anything Priya would say…" disabled={!conn} aria-label="What you would say" />
            <button type="button" className={`mic ${light === 'listening' ? 'on' : ''}`} onClick={() => void onMic()} disabled={!canListen || !conn} title={canListen ? 'Speak' : 'Speech recognition needs Chrome or Edge'} aria-label="Talk to Alexa">
              <Icon name={light === 'listening' ? 'stop' : 'mic'} />
            </button>
            <button type="submit" className="send" disabled={!conn || !draft.trim()} aria-label="Send">
              <Icon name="send" />
            </button>
          </form>

          {activeTasks.length > 0 && (
            <section className="waiting">
              <h2>Waiting on the parents</h2>
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

          <details className="drawer">
            <summary>
              <Icon name="chat" size={16} /> Conversation <span className="count">{lines.length}</span>
            </summary>
            <div className="log chat">
              {lines.length ? (
                lines.map((l) => (
                  <p key={l.id} className={l.who}>
                    <b>{l.who === 'you' ? 'You' : 'Alexa'}:</b> {l.text}
                  </p>
                ))
              ) : (
                <p className="empty">Nothing yet. Say something to the Echo Show.</p>
              )}
            </div>
          </details>

          <details className="drawer">
            <summary>
              <Icon name="gear" size={16} /> Settings
            </summary>
            <div className="settings">
              <Switch
                label="Speak replies out loud"
                checked={voiceOn}
                onChange={(on) => {
                  setVoiceOn(on);
                  store('wyo.voice', on ? 'on' : 'off');
                  if (!on) stopSpeaking();
                }}
              />
              <Switch
                label="Mom’s phone beside the Echo Show"
                hint="The live parent page, so you see both sides"
                checked={phoneOn}
                onChange={(on) => {
                  setPhoneOn(on);
                  store('wyo.phone', on ? 'on' : 'off');
                }}
              />
              <Segmented<DeviceSize>
                label="Device"
                value={deviceSize}
                options={[
                  ['8', 'Show 8'],
                  ['10', 'Show 10'],
                  ['15', 'Show 15'],
                ]}
                onChange={(v) => {
                  setDeviceSize(v);
                  store('wyo.size', v);
                }}
              />
              <Segmented<'light' | 'dark'>
                label="Theme"
                value={cardTheme}
                options={[
                  ['dark', 'Dark'],
                  ['light', 'Light'],
                ]}
                onChange={(v) => {
                  setCardTheme(v);
                  store('wyo.theme', v);
                }}
              />
              <Segmented<BrainKind>
                label="Understanding"
                value={brainKind}
                options={[
                  ['hybrid', 'Rules + AI'],
                  ['rules', 'Rules'],
                  ['gemini', 'AI only'],
                ]}
                onChange={(v) => {
                  setBrainKind(v);
                  store('wyo.brain3', v);
                }}
              />
              {demoTime && (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void setClock(demoInput, demoDay);
                  }}
                >
                  <span className="seg-label">House clock</span>
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
                <button type="button" onClick={() => void connect(url)}>
                  Connect
                </button>
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

          <a className="parent-link" href={parentUrl} target="_blank" rel="noreferrer">
            <Icon name="phone" size={16} /> Open Mom’s phone in a new tab <Icon name="external" size={14} />
          </a>
        </aside>
      )}
    </div>
  );
}
