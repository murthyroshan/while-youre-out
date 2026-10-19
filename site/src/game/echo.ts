// The kitchen Echo Show's screen, drawn on a canvas. The same canvas is the texture on the 3D
// screen on the kitchen wall and the device in the corner of the page, so both always agree.
// What it says comes from answers.json: the add-on's own answers, recorded from it.

export type EchoKind = '' | 'alert' | 'offline' | 'message';

const W = 1024;
const H = 640;
const COLORS: Record<EchoKind, { bar: string; top: string; bottom: string; chip: string }> = {
  '': { bar: '#1ac3eb', top: '#111a30', bottom: '#070a14', chip: 'rgba(26, 195, 235, 0.16)' },
  alert: { bar: '#ff4438', top: '#3a0c10', bottom: '#14060a', chip: 'rgba(255, 68, 56, 0.2)' },
  offline: { bar: '#ffb020', top: '#2b1a08', bottom: '#120b05', chip: 'rgba(255, 176, 32, 0.18)' },
  message: { bar: '#ff8fb1', top: '#2a1430', bottom: '#0c0812', chip: 'rgba(255, 143, 177, 0.18)' },
};

export function createEcho() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'echo-canvas';
  const g = canvas.getContext('2d')!;
  let topic = 'Tonight';
  let text = '';
  let kind: EchoKind = '';
  let clock = '';
  let started = 0;
  let shownAt = -1;
  let dirty = true;
  let listeners: Array<() => void> = [];

  const font = (px: number, weight = 500) => `${weight} ${px}px 'IBM Plex Sans', 'Segoe UI', sans-serif`;
  const wrap = (t: string, max: number) => {
    const lines: string[] = [];
    for (const para of t.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > max && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };

  function draw(now: number, shown: number, speaking: boolean) {
    const c = COLORS[kind];
    const bg = g.createLinearGradient(0, 0, W * 0.3, H);
    bg.addColorStop(0, c.top);
    bg.addColorStop(1, c.bottom);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // a soft light behind the words while it speaks
    if (speaking) {
      const r = g.createRadialGradient(W * 0.3, H * 0.55, 10, W * 0.3, H * 0.55, W * 0.7);
      r.addColorStop(0, `${c.bar}22`);
      r.addColorStop(1, `${c.bar}00`);
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
    }

    // the header: the add-on, the topic, the time
    g.fillStyle = '#e9edf5';
    g.beginPath();
    g.roundRect(56, 50, 34, 23, 5);
    g.fill();
    g.fillStyle = COLORS[''].bar;
    g.fillRect(61, 66, 24, 3);
    g.font = font(26, 500);
    g.fillStyle = '#c9d0de';
    g.textBaseline = 'middle';
    g.fillText("While You're Out", 104, 62);
    g.font = "400 24px 'IBM Plex Mono', Consolas, monospace";
    g.textAlign = 'right';
    g.fillStyle = '#8c95a8';
    g.fillText(clock, W - 56, 62);
    g.textAlign = 'left';

    g.font = font(22, 600);
    const label = topic.toUpperCase();
    const lw = g.measureText(label).width + 36;
    g.fillStyle = c.chip;
    g.beginPath();
    g.roundRect(56, 108, lw, 42, 21);
    g.fill();
    g.fillStyle = c.bar;
    g.fillText(label, 74, 130);

    // the words: as large as fits
    const body = text.slice(0, shown);
    let size = 54;
    let lines: string[] = [];
    for (; size >= 30; size -= 4) {
      g.font = font(size, 500);
      lines = wrap(text, W - 120);
      if (lines.length * size * 1.28 <= H - 290) break;
    }
    g.font = font(size, 500);
    // lay out the full text (so words don't jump as they type), then draw only what's been said
    let left = body.length;
    let y = 196 + size * 0.5;
    for (const line of lines) {
      if (left <= 0) break;
      const part = line.slice(0, left);
      g.fillStyle = '#f4f6fb';
      g.fillText(part, 60, y);
      left -= line.length + 1;
      y += size * 1.28;
    }

    // a goodnight message: a heart and a voice
    if (kind === 'message') {
      const cx = W - 170;
      const cy = H - 190;
      const beat = 1 + Math.sin(now / 260) * 0.06;
      g.save();
      g.translate(cx, cy);
      g.scale(beat, beat);
      g.fillStyle = '#ff8fb1';
      g.beginPath();
      g.moveTo(0, 30);
      g.bezierCurveTo(-70, -20, -30, -70, 0, -38);
      g.bezierCurveTo(30, -70, 70, -20, 0, 30);
      g.fill();
      g.restore();
      for (let i = 0; i < 28; i++) {
        const h = 10 + Math.abs(Math.sin(now / 180 + i * 0.7) * Math.sin(i * 1.3)) * 60;
        g.fillStyle = 'rgba(255, 143, 177, 0.75)';
        g.fillRect(60 + i * 16, H - 120 - h / 2, 8, h);
      }
    }

    // Alexa's light bar along the bottom: it moves while the device speaks
    const by = H - 34;
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, by, W, 34);
    if (speaking) {
      const x = ((now / 4) % (W + 400)) - 200;
      const lg = g.createLinearGradient(x - 300, 0, x + 300, 0);
      lg.addColorStop(0, `${c.bar}00`);
      lg.addColorStop(0.5, c.bar);
      lg.addColorStop(1, `${c.bar}00`);
      g.fillStyle = `${c.bar}88`;
      g.fillRect(0, by + 10, W, 14);
      g.fillStyle = lg;
      g.fillRect(0, by + 6, W, 22);
    } else {
      g.fillStyle = `${c.bar}55`;
      g.fillRect(W * 0.35, by + 14, W * 0.3, 6);
    }
  }

  return {
    canvas,
    /** Says something: it types out on the screen, the light bar moving while it does. */
    say(t: string, words: string, k: EchoKind = '') {
      topic = t;
      text = words;
      kind = k;
      started = performance.now();
      shownAt = -1;
      dirty = true;
      listeners.forEach((l) => l());
    },
    setClock(c: string) {
      if (c !== clock) {
        clock = c;
        dirty = true;
      }
    },
    /** Redraws if anything changed; returns true when the canvas is new. */
    update(now: number, instant = false) {
      const shown = instant ? text.length : Math.min(text.length, Math.floor((now - started) * 0.075));
      const speaking = now - started < (text.length / 0.075) + 900;
      if (!dirty && shown === shownAt && !speaking && kind !== 'message') return false;
      draw(now, shown, speaking);
      shownAt = shown;
      dirty = false;
      return true;
    },
    onSay(fn: () => void) {
      listeners.push(fn);
    },
    get text() {
      return text;
    },
    get topic() {
      return topic;
    },
    get kind() {
      return kind;
    },
    reset() {
      listeners = [];
    },
  };
}

export type Echo = ReturnType<typeof createEcho>;
