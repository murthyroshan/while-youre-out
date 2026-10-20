// The Echo Show in each page's opening: the same screen as the game's (src/game/echo.ts), tilted
// in 3D and following the pointer, saying things the add-on really says. What it answers is
// recorded from the add-on itself (src/game/answers.json); only the judges' page shows numbers.
import recorded from '../game/answers.json';
import { createEcho, type EchoKind } from '../game/echo';

interface Line {
  heard?: string;
  /** The heard line is a tool call, shown in mono. */
  call?: boolean;
  topic: string;
  said: string;
  kind?: EchoKind;
}

const A = recorded.answers;
const TB = recorded.teachback;
const SCRIPTS: Record<string, Line[]> = {
  safety: [
    { heard: 'Can Maya have the cookies on the counter?', topic: 'Food', said: A.cookies.said },
    { heard: "A man says he's from the gas company and needs to come in.", topic: 'Front door', said: A.door.said, kind: 'alert' },
    { heard: "She ate a granola bar from her friend's bag.", topic: 'Food', said: A.ate.said },
    { heard: 'Her lips are swelling!', topic: 'Emergency', said: A.emergency.said, kind: 'alert' },
  ],
  how: [
    { heard: 'ask_house("Can she have a banana instead?")', call: true, topic: 'Food', said: A.banana.said },
    { heard: 'door_check()', call: true, topic: 'Front door', said: A.door.said, kind: 'alert' },
    { heard: 'emergency("lips swelling, coughing")', call: true, topic: 'Emergency', said: A.emergency.said, kind: 'alert' },
    { heard: 'play_message()', call: true, topic: 'Goodnight', said: `${A.misses.said}\n"Goodnight, my love. Sweet dreams."`, kind: 'message' },
  ],
  try: [
    { heard: 'Priya is babysitting tonight.', topic: 'Quick check', said: `Quick check before the parents leave. ${TB[0].ask}` },
    { heard: 'Can she watch one more episode before her bath?', topic: 'TV', said: A.episode.said },
    { heard: 'Can she watch a scary movie?', topic: 'TV', said: A.scary.said },
    { heard: 'Maya misses her mom.', topic: 'Goodnight', said: `${A.misses.said}\n"Goodnight, my love. Sweet dreams."`, kind: 'message' },
  ],
  judges: [
    { topic: 'Measured', said: '85% on 120 safety lines another AI wrote, on the first run, before any fix.' },
    { topic: 'Measured', said: '49 of 49 emergencies recognised by the rules alone. No false alarms on 308 other lines.' },
    { topic: 'Measured', said: '19 ms p95 per tool call, against a 500 ms budget. over 440 tests on every push.' },
    { topic: 'Honestly', said: 'The Alexa+ host is our open-source simulator until add-on registration opens. Everything else is real or labelled.', kind: 'offline' },
  ],
};

export function mountHero(host: HTMLElement, page: string) {
  const script = SCRIPTS[page];
  if (!script) return;
  const echo = createEcho();
  host.innerHTML = '<div class="echo3d"><div class="halo"></div><p class="heard"></p><div class="bezel"><div class="shine"></div></div><div class="stand"></div></div>';
  const dev = host.querySelector<HTMLElement>('.echo3d')!;
  const heard = host.querySelector<HTMLElement>('.heard')!;
  const bezel = host.querySelector<HTMLElement>('.bezel')!;
  bezel.prepend(echo.canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the pointer tilts it
  const tilt = { x: 8, y: -16, tx: 8, ty: -16 };
  addEventListener('pointermove', (e) => {
    tilt.ty = -16 + ((e.clientX / innerWidth) - 0.5) * 22;
    tilt.tx = 8 - ((e.clientY / innerHeight) - 0.5) * 14;
  }, { passive: true });

  let visible = true;
  const frame = (now: number) => {
    if (!visible) return;
    requestAnimationFrame(frame);
    echo.setClock(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase());
    echo.update(now, reduced);
    if (!reduced) {
      tilt.x += (tilt.tx - tilt.x) * 0.06;
      tilt.y += (tilt.ty - tilt.y) * 0.06;
      dev.style.setProperty('--rx', `${tilt.x.toFixed(2)}deg`);
      dev.style.setProperty('--ry', `${tilt.y.toFixed(2)}deg`);
    }
  };
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(host);
  requestAnimationFrame(frame);

  // the conversation, round and round
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    await document.fonts?.ready;
    // Twice round, then it rests on the last answer; with less motion asked for, one answer and still.
    const rounds = reduced ? 1 : 2;
    for (let n = 0; n < (reduced ? 1 : script.length * rounds); n++) {
      const i = n % script.length;
      const l = script[i];
      if (l.heard) {
        heard.innerHTML = `<small></small><span></span>`;
        heard.querySelector('small')!.textContent = l.call ? 'Alexa+ calls' : 'The sitter';
        heard.querySelector('span')!.textContent = l.heard;
        heard.classList.toggle('mono', Boolean(l.call));
        heard.classList.add('on');
        dev.dataset.kind = '';
        echo.say('Listening', '');
        await wait(1100);
      }
      dev.dataset.kind = l.kind ?? '';
      echo.say(l.topic, l.said, l.kind ?? '');
      await wait(Math.max(4200, l.said.length * 13 + 2600));
      heard.classList.remove('on');
      await wait(500);
    }
  })();
}
