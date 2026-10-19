// The game's sounds, made on the spot with Web Audio: nothing is downloaded. Off until the player
// presses Start (browsers need a gesture), and one button turns it all off.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let heart = 0;
let alarm: { stop: () => void } | null = null;

export function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
  }
  void ctx.resume();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05);
}
export const isMuted = () => muted;

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; to?: number; filter?: number } = {}) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const o = ctx.createOscillator();
  const gn = ctx.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(opts.gain ?? 0.15, t + 0.012);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out: AudioNode = gn;
  if (opts.filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = opts.filter;
    gn.connect(f);
    out = f;
  }
  o.connect(gn);
  out.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; at?: number; freq?: number; q?: number } = {}) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = opts.freq ?? 400;
  f.Q.value = opts.q ?? 1;
  const gn = ctx.createGain();
  gn.gain.value = opts.gain ?? 0.4;
  src.connect(f).connect(gn).connect(master);
  src.start(t);
}

export const sfx = {
  /** Three knocks on a wooden door. */
  knock() {
    for (let i = 0; i < 3; i++) {
      noise(0.12, { at: i * 0.2, freq: 220, q: 2, gain: 1.2 });
      tone(95, 0.14, { at: i * 0.2, gain: 0.35, to: 60 });
    }
  },
  /** The Echo Show wakes: Alexa's two rising notes. */
  wake() {
    tone(659, 0.18, { gain: 0.08 });
    tone(988, 0.3, { gain: 0.08, at: 0.1 });
  },
  good() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { gain: 0.07, at: i * 0.06, type: 'triangle' }));
  },
  bad() {
    tone(180, 0.45, { type: 'sawtooth', gain: 0.09, to: 90, filter: 900 });
    noise(0.3, { freq: 120, gain: 0.5 });
  },
  tick() {
    tone(1500, 0.03, { type: 'square', gain: 0.02 });
  },
  glitch() {
    for (let i = 0; i < 6; i++) noise(0.05, { at: i * 0.07, freq: 800 + Math.random() * 3000, q: 8, gain: 0.5 });
  },
  whoosh() {
    noise(0.7, { freq: 600, q: 0.6, gain: 0.25 });
  },
  step() {
    tone(880, 0.12, { gain: 0.06, type: 'triangle' });
    tone(1320, 0.18, { gain: 0.05, at: 0.06, type: 'triangle' });
  },
  siren() {
    for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 820, 0.45, { at: i * 0.45, gain: 0.03, type: 'triangle' });
  },
  heartbeat(on: boolean) {
    clearInterval(heart);
    if (!on) return;
    const beat = () => {
      tone(58, 0.16, { gain: 0.4, to: 40 });
      tone(52, 0.16, { gain: 0.3, at: 0.22, to: 38 });
    };
    beat();
    heart = window.setInterval(beat, 900);
  },
  /** A low, pulsing tone under the emergency (quiet: it's tension, not noise). */
  alarm(on: boolean) {
    alarm?.stop();
    alarm = null;
    if (!on || !ctx || !master) return;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const gn = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 110;
    lfo.frequency.value = 1.6;
    lg.gain.value = 0.025;
    gn.gain.value = 0.03;
    lfo.connect(lg).connect(gn.gain);
    o.connect(gn).connect(master);
    o.start();
    lfo.start();
    alarm = {
      stop: () => {
        gn.gain.setTargetAtTime(0, ctx!.currentTime, 0.2);
        o.stop(ctx!.currentTime + 1);
        lfo.stop(ctx!.currentTime + 1);
      },
    };
  },
};
