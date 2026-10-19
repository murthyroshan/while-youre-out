// The homepage: the opening drawing, then the evening as you scroll.
import * as THREE from 'three';
import { createScene, VIEWS, v, type View } from './scene';
import { phaseName } from './sky';
import { mountLiveScreen } from './livescreen';
import '../pages/page';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const planSvg = document.querySelector<SVGSVGElement>('#plan')!;
const stage = createScene(canvas);

// ---------- 1. the ink drawing ----------
function drawPlan() {
  const { rects, openings, w, h } = stage.planOnScreen();
  planSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const ns = 'http://www.w3.org/2000/svg';
  planSvg.replaceChildren();
  const rectPath = (a: readonly [number, number], b: readonly [number, number]) => `M${a[0]} ${a[1]}H${b[0]}V${b[1]}H${a[0]}Z`;
  rects.forEach(([a, b], i) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', rectPath(a, b));
    p.setAttribute('class', 'wall');
    p.style.animationDelay = `${0.15 + i * 0.09}s`;
    planSvg.append(p);
  });
  openings.forEach(([a, b], i) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', rectPath(a, b));
    p.setAttribute('class', 'opening');
    p.style.animationDelay = `${0.9 + i * 0.06}s`;
    planSvg.append(p);
  });
  // a scale bar and the drawing's title block, as on an architect's sheet
  const [[a]] = rects;
  const unit = Math.abs(rects[0][1][0] - rects[0][0][0]) / 16; // the back wall is 16 m
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'sheet');
  g.innerHTML = `<path d="M${a[0]} ${h - 40}h${unit * 5}" /><text x="${a[0]}" y="${h - 50}">0</text><text x="${a[0] + unit * 5}" y="${h - 50}">5 m</text><text class="title" x="${w - 40}" y="${h - 40}" text-anchor="end">The Sharma house · plan 1:100 · tonight</text>`;
  planSvg.append(g);
}

// ---------- the live Echo Show on the kitchen wall ----------
const house = stage.house;
let focus: { view: View; until: number } | null = null; // a moment the scene plays out (the drawer opening)
let focusBeat = -1;
let lastFocus: View | null = null; // kept while the camera blends back
const drawerHome = house.drawer.position.z;
let drawerOpen = 0;
const ECHO_AT = new THREE.Vector3(9.72, 1.47, 0.4);
const live = mountLiveScreen(house.echo.screen, house.echo.width, house.echo.height, stage.camera, {
  onTool: (name, args) => {
    // "where_is EpiPen": the camera goes to the drawer by the stove, and it slides open
    if (name === 'where_is' && /epi/i.test(String(args.item ?? ''))) {
      focus = { view: { pos: v(10.05, 1.75, 2.35), target: v(10.12, 0.8, 0.95), fov: 34 }, until: performance.now() + 9000 };
      lastFocus = focus.view;
      focusBeat = progress().i;
    }
  },
  onSaid: (text) => {
    const cap = document.querySelector('#caption');
    if (cap) {
      cap.textContent = text;
      cap.classList.add('on');
      clearTimeout((cap as HTMLElement & { t?: number }).t);
      (cap as HTMLElement & { t?: number }).t = window.setTimeout(() => cap.classList.remove('on'), 7000);
    }
  },
});
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-say]')) b.addEventListener('click', () => live.say(b.dataset.say!));
document.querySelector<HTMLFormElement>('#ask-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = (e.currentTarget as HTMLFormElement).querySelector('input')!;
  if (input.value.trim()) live.say(input.value.trim());
  input.value = '';
});

/** Frame-rate independent easing toward a value (rate per second). */
const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

// ---------- 2. the story, scroll by scroll ----------
interface Beat {
  hour: number;
  view: View;
}
const BEATS: Beat[] = [
  { hour: 17.6, view: VIEWS.hero },
  { hour: 18.0, view: { pos: v(11.2, 2.9, 10.5), target: v(10.6, 1.25, 1.6), fov: 32 } },
  { hour: 18.7, view: { pos: v(9.4, 1.52, 1.6), target: v(9.22, 1.42, 0.4), fov: 34 } },
  { hour: 20.15, view: { pos: v(3.4, 2.0, 8.2), target: v(0.6, 1.15, 3.0), fov: 34 } },
  { hour: 20.62, view: { pos: v(14.6, 1.9, 7.4), target: v(14.6, 0.75, 1.4), fov: 34 } },
  { hour: 22.6, view: { pos: v(8, 6.2, 22), target: v(8, 1.6, 2.0), fov: 30 } },
];

const sections = [...document.querySelectorAll<HTMLElement>('[data-beat]')];
let storyOn = false;

/** Where the reader is in the story: the beat and how far toward the next one. */
function progress() {
  const mid = window.innerHeight * 0.55;
  let i = 0;
  for (let k = 0; k < sections.length; k++) if (sections[k].getBoundingClientRect().top <= mid) i = k;
  const cur = sections[i].getBoundingClientRect();
  const next = sections[i + 1]?.getBoundingClientRect();
  const t = next ? Math.min(1, Math.max(0, (mid - cur.top) / (next.top - cur.top))) : 0;
  return { i, t };
}

// The camera follows the scroll through a spring, so a mouse wheel's steps become one glide.
let along = -1; // where the camera is in the story: beat index + progress toward the next
let shownBeat = -1;
let shownNight = -1;
let shownClock = '';
let focusBlend = 0;
const clockEl = document.querySelector('#clock');
const fromView = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };

function story(dt: number) {
  const { i: beat, t } = progress();
  const goal = beat + t;
  along = along < 0 ? goal : approach(along, goal, 7, dt);
  if (Math.abs(along - goal) < 0.0005) along = goal;
  const i = Math.min(Math.floor(along), BEATS.length - 1);
  const a = BEATS[i];
  const b = BEATS[Math.min(i + 1, BEATS.length - 1)];
  // the camera holds on each beat, then travels in the last part of the scroll toward the next
  const travel = Math.min(1, Math.max(0, (along - i - 0.45) / 0.55));
  if (focus && (performance.now() > focus.until || beat !== focusBeat)) focus = null;
  // a moment playing out (the drawer) blends the camera away from the story and back
  focusBlend = approach(focusBlend, focus ? 1 : 0, 2.6, dt);
  if (focusBlend < 0.001) focusBlend = 0;
  if (focusBlend > 0.999) focusBlend = 1;
  stage.between(a.view, b.view, travel);
  if (focusBlend > 0 && lastFocus) {
    fromView.pos.copy(stage.camera.position);
    fromView.target.copy(stage.target);
    fromView.fov = stage.camera.fov;
    stage.between(fromView, lastFocus, focusBlend);
  }
  // the drawer slides open while the EpiPen moment plays
  drawerOpen = approach(drawerOpen, focus ? 1 : 0, 4, dt);
  if (drawerOpen < 0.001) drawerOpen = 0;
  house.drawer.position.z = drawerHome + drawerOpen * 0.42;
  house.pouch.visible = drawerOpen > 0.05;
  // the live screen is readable only up close; from afar the wall shows a dark screen
  const near = stage.camera.position.distanceTo(ECHO_AT);
  live.setVisible(Math.min(1, Math.max(0, (4.2 - near) / 1.4)));
  if (beat >= 1) live.load();
  const hour = a.hour + (b.hour - a.hour) * travel;
  stage.setHour(hour);
  // the page's colours follow the evening; only touched when they change (it restyles the page)
  const night = Math.round(Math.min(1, Math.max(0, (hour - 19.2) / 1.2)) * 100) / 100;
  if (night !== shownNight) document.documentElement.style.setProperty('--night', String((shownNight = night)));
  const clock = formatHour(hour);
  if (clockEl && clock !== shownClock) clockEl.textContent = shownClock = clock;
  if (beat !== shownBeat) {
    shownBeat = beat;
    sections.forEach((s, k) => s.classList.toggle('on', k === beat));
  }
}

const formatHour = (h: number) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};

// ---------- the moon note: today's real moon ----------
const moonNote = document.querySelector('#moon-note');
if (moonNote) moonNote.textContent = `Tonight's ${phaseName(stage.sky.phase)}, as it really is.`;

// ---------- run ----------
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.add('drawing');
drawPlan();
// compile every shader while the ink drawing plays, so the rise doesn't stutter
requestAnimationFrame(() => stage.warm());
setTimeout(
  () => {
    document.body.classList.remove('drawing');
    document.body.classList.add('rising');
    stage.startRise();
  },
  reduced ? 0 : 1900,
);

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!storyOn) {
    if (stage.stepOpening(now)) {
      storyOn = true;
      stage.settle();
      document.body.classList.remove('rising');
      document.body.classList.add('ready');
    }
  } else story(dt);
  if (stage.tick(now, dt)) live.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  if (!storyOn) drawPlan();
});

if (import.meta.env.DEV) Object.assign(window, { __wyo: { stage, live } });
