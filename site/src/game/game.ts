// "Play the evening": you're the sitter, in the Sharma house (the home page's 3D house). Seven
// moments from 6 pm to bedtime, some against the clock. At any choice you can ask the kitchen Echo
// Show, and what it says is the add-on's own answer, recorded from it (answers.json, by
// server/eval/record-game.ts). At the end, what you did is set beside what While You're Out does.
import '../pages/page';
import recorded from './answers.json';
import { createEcho, type EchoKind } from './echo';
import { createWorld, type Shot, type World } from './world';
import { isMuted, setMuted, sfx, unlock } from './sound';

type Meter = 'safety' | 'rules' | 'mood';
type Effect = Partial<Record<Meter, number>>;
interface Choice {
  label: string;
  effect: Effect;
  /** What happens, said back to you. */
  then: string;
  best?: boolean;
  /** What the house does. */
  act?: (w: World) => void | Promise<void>;
}
interface Moment {
  when: string;
  hour: number;
  shot: Shot;
  title: string;
  story: string;
  ask: keyof typeof recorded.answers;
  setup?: (w: World) => void;
  /** Runs while the choice is open (the knocking at the door). Returns a stop function. */
  during?: (w: World) => () => void;
  /** Seconds to choose; running out picks `timeout`. */
  seconds?: number;
  timeout?: Choice;
  choices: Choice[];
  cleanup?: (w: World) => void;
  /** What the add-on does here, for the review at the end. */
  addon: string;
}

const A = recorded.answers;
const TB = recorded.teachback;
const PLAN = A.emergency.facts.slice(0, 5);
// the tiles are short; the Echo Show reads each step in the parents' full words
const PLAN_SHORT = ['EpiPen, outer thigh', 'Call 911', 'Lay her down flat', 'Second EpiPen after 5 min', 'Call Mom, then Dad'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 300) : ms));

// ---------- the page ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = { status: $('g-status'), clock: $('g-clock'), when: $('g-when'), title: $('g-title'), story: $('g-story'), choices: $('g-choices'), note: $('g-note'), timer: $('g-timer'), panel: $('g-panel'), device: $('g-device'), said: $('g-said'), sound: $<HTMLButtonElement>('g-sound') };

const echo = createEcho();
el.device.append(echo.canvas);
let world: World | null = null;
try {
  world = createWorld($<HTMLCanvasElement>('g-canvas'), echo);
} catch (err) {
  console.warn('No WebGL: the game runs without the house.', err);
  document.body.classList.add('no-gl');
}
const W = world;
// Leaving for another page: stop the 3D at once, so the click isn't kept waiting on a frame
const leave = () => {
  W?.stop();
  sfx.alarm(false);
  sfx.heartbeat(false);
};
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
  if (a && !a.target && !e.metaKey && !e.ctrlKey && !e.shiftKey) leave();
});
addEventListener('pagehide', leave);

/** The Echo Show speaks: on the 3D screen, on the device in the corner, and to screen readers. */
function say(topic: string, text: string, kind: EchoKind = '') {
  echo.say(topic, text, kind);
  el.said.textContent = text;
  el.device.dataset.kind = kind;
  el.device.classList.remove('speaking');
  void el.device.offsetWidth;
  el.device.classList.add('speaking');
}

// the clock, the page's night, and the screen when there's no 3D
const clockText = (h: number) => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 || hh >= 24 ? 'am' : 'pm'}`;
};
let fallbackHour = 17.9;
(function loop(now: number) {
  const h = W ? W.hour() : fallbackHour;
  const c = clockText(h);
  if (el.clock.textContent !== c) el.clock.textContent = c;
  echo.setClock(c);
  document.documentElement.style.setProperty('--night', String(Math.min(1, Math.max(0, (h - 18.6) / 1.2))));
  if (!W) echo.update(now, reduced);
  requestAnimationFrame(loop);
})(performance.now());

// ---------- meters ----------
const meters: Record<Meter, number> = { safety: 100, rules: 100, mood: 70 };
function setMeters(e: Effect = {}) {
  for (const k of Object.keys(meters) as Meter[]) {
    meters[k] = Math.max(0, Math.min(100, meters[k] + (e[k] ?? 0)));
    const m = document.querySelector<HTMLElement>(`.meter[data-meter="${k}"]`)!;
    m.style.setProperty('--v', String(meters[k] / 100));
    m.querySelector('em')!.textContent = String(meters[k]);
    m.classList.toggle('low', meters[k] < 45);
    if (e[k]) {
      m.classList.remove('hit', 'gain');
      void m.offsetWidth;
      m.classList.add(e[k]! < 0 ? 'hit' : 'gain');
    }
  }
}

// ---------- the panel ----------
function scene(when: string, title: string, story: string) {
  el.when.textContent = when;
  el.title.textContent = title;
  el.story.textContent = story;
  el.note.hidden = true;
  el.panel.querySelectorAll('.next').forEach((n) => n.remove());
  el.choices.replaceChildren();
  el.choices.classList.remove('chosen', 'grid');
  el.panel.classList.remove('in');
  void el.panel.offsetWidth;
  el.panel.classList.add('in');
  el.status.textContent = `${when}. ${title} ${story}`;
}

function button(label: string, onPick: () => void, cls = '', key?: string) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `choice ${cls}`;
  const n = el.choices.querySelectorAll('button.choice:not(.ask)').length + 1;
  b.innerHTML = `<kbd aria-hidden="true"></kbd><span></span>`;
  b.querySelector('kbd')!.textContent = key ?? String(n);
  if (/^[1-9A]$/.test(key ?? String(n))) b.setAttribute('aria-keyshortcuts', key ?? String(n));
  b.querySelector('span')!.textContent = label;
  b.addEventListener('click', onPick);
  el.choices.append(b);
  return b;
}

function nextButton(label = 'Carry on') {
  return new Promise<void>((resolve) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'next';
    b.innerHTML = `<span></span><kbd aria-hidden="true">↵</kbd>`;
    b.querySelector('span')!.textContent = label;
    b.addEventListener('click', () => {
      sfx.whoosh();
      resolve();
    });
    el.panel.append(b);
    b.focus({ preventScroll: true });
    el.panel.scrollTo({ top: el.panel.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  });
}

// Keys: 1-5 pick a choice, A asks the Echo Show, Enter carries on.
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement;
  if (target instanceof HTMLInputElement) return;
  if (!(el.panel.contains(target) || target === document.body)) return;
  if (/^[1-9]$/.test(e.key)) {
    const b = [...el.choices.querySelectorAll<HTMLButtonElement>('button.choice:not(.ask):not(:disabled)')].find((x) => x.querySelector('kbd')?.textContent === e.key);
    b?.click();
  }
  if (e.key.toLowerCase() === 'a') el.choices.querySelector<HTMLButtonElement>('button.ask:not(:disabled)')?.click();
  if (e.key === 'Enter' && target.tagName !== 'BUTTON') el.panel.querySelector<HTMLButtonElement>('.next, .start')?.click();
});

let relaxed = new URLSearchParams(location.search).get('timer') === 'off';
/** A countdown on the panel; calls `done` if it runs out. Returns a stop function. */
function countdown(seconds: number, done: () => void) {
  if (relaxed) return () => {};
  el.timer.hidden = false;
  const bar = el.timer.querySelector('b')!;
  const label = el.timer.querySelector('span')!;
  const end = performance.now() + seconds * 1000;
  let raf = 0;
  let lastSec = -1;
  const tick = () => {
    const left = Math.max(0, end - performance.now());
    bar.style.transform = `scaleX(${left / (seconds * 1000)})`;
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      label.textContent = `${sec}s`;
      if (sec <= 4 && sec > 0) sfx.tick();
    }
    el.timer.classList.toggle('late', left < 4000);
    if (left <= 0) {
      el.timer.hidden = true;
      done();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    el.timer.hidden = true;
  };
}

function flash() {
  const f = $('g-flash');
  f.classList.remove('on');
  void f.offsetWidth;
  f.classList.add('on');
}

// ---------- the evening ----------
const log: Array<{ title: string; picked: string; best: boolean; asked: boolean; addon: string }> = [];

const MOMENTS: Moment[] = [
  {
    when: '6:40 pm · the kitchen',
    hour: 18.67,
    shot: 'kitchen',
    title: '"Can I have a cookie? Pleeease?"',
    story: "A plate of cookies on the counter. A neighbour baked them; there's no label. Maya has had her dinner.",
    ask: 'cookies',
    setup: (w) => {
      w.hideAll();
      w.show.cookies(true);
      w.cast.maya.place(10.0, 4.3).faceTo(9.6, 0.6);
      w.cast.priya.place(11.6, 4.5).faceTo(10.0, 4.3);
    },
    choices: [
      { label: "Give her one. They're just cookies.", effect: { safety: -40, rules: -15, mood: 10 }, then: "Homemade, no label, and Maya is allergic to peanuts: nobody can tell what's in them. And no sweets after 6." },
      {
        label: 'Not tonight. Offer her a banana instead.',
        effect: { mood: -2 },
        best: true,
        then: 'Right on both counts: no unlabelled food, no sweets after 6, and a banana is what Anita said she can have.',
        act: (w) => {
          w.show.banana(true);
          w.cast.maya.hop();
          w.burstAt(10.3, 1.0, 3.15, '#ffd84a', 50);
        },
      },
      { label: 'Give her half a cookie, as a treat.', effect: { safety: -30, rules: -10, mood: 5 }, then: 'Half of an unknown cookie is still an unknown cookie.' },
    ],
    cleanup: (w) => {
      w.show.cookies(false);
      w.show.banana(false);
    },
    addon: A.cookies.said,
  },
  {
    when: '7:10 pm · the living room',
    hour: 19.17,
    shot: 'living',
    title: '"One more episode! Then bath. Promise."',
    story: "She's watched cartoons for an hour. Bath is at 7:15, lights out at 8. Now she wants a scary film.",
    ask: 'scary',
    setup: (w) => {
      w.hideAll();
      w.setTv(true);
      w.setMode('tv');
      w.cast.maya.place(4.9, 3.0, -Math.PI / 2);
      w.cast.priya.place(7.4, 3.9).faceTo(4.9, 3.0);
    },
    choices: [
      { label: 'Fine, one more episode.', effect: { rules: -10, mood: 6 }, then: 'An hour is the limit, and bath is in five minutes. Not dangerous, but the evening runs late.', act: (w) => w.cast.maya.hop() },
      {
        label: 'Bath time, as planned. Cartoons tomorrow.',
        effect: { mood: -3 },
        best: true,
        then: 'The routine holds, and bedtime stays on time.',
        act: (w) => {
          w.setTv(false);
          w.setMode('calm');
          void w.cast.maya.walk([[6.4, 4.4], [8.8, 4.6]]);
        },
      },
      {
        label: 'Put on the scary film. She begged.',
        effect: { rules: -25, mood: -10 },
        then: '"Gentle cartoons only, nothing scary." And a scary film before bed means a long night.',
        act: (w) => {
          w.setTv(true, true);
          w.cast.maya.shiver();
        },
      },
    ],
    cleanup: (w) => {
      w.setTv(false);
      w.setMode('calm');
    },
    addon: A.scary.said,
  },
  {
    when: '8:10 pm · the front door',
    hour: 20.17,
    shot: 'hall',
    title: 'Knock knock knock.',
    story: "A man at the door says he's from the gas company: \"There's a leak on the street, I need to check your meter. It's urgent.\" Nobody mentioned a visit.",
    ask: 'door',
    seconds: 14,
    setup: (w) => {
      w.hideAll();
      w.cast.priya.place(1.4, 3.1, -Math.PI / 2);
      w.cast.maya.place(2.5, 4.5).faceTo(0.2, 2.9);
      w.cast.stranger.place(-1.3, 2.95, Math.PI / 2);
      w.setTorch(true);
    },
    during: (w) => {
      const knock = () => {
        sfx.knock();
        w.knock();
      };
      knock();
      w.setDolly(true);
      const id = setInterval(knock, 4200);
      return () => {
        clearInterval(id);
        w.setDolly(false);
      };
    },
    timeout: {
      label: '(You froze.)',
      effect: { safety: -5 },
      then: 'He waits, shrugs and leaves. Next time, keep it shut and say so through the door.',
      act: async (w) => {
        await w.cast.stranger.walk([[-2.4, 3.8], [-7, 4.4]]);
        w.setTorch(false);
      },
    },
    choices: [
      {
        label: 'Open it. A gas leak sounds urgent.',
        effect: { safety: -45 },
        then: "Anyone can say \"gas company\". Real gas staff don't need to come in for a street leak, and they can wait for the parents.",
        act: (w) => {
          w.setDoor(-1.35);
          void w.cast.stranger.walk([[0.5, 2.95]], 0.9);
        },
      },
      {
        label: 'Keep it shut. Talk through the door, and tell the parents.',
        effect: {},
        best: true,
        then: "Exactly the parents' rule: don't open to anyone you don't know. The photo is on Anita's phone. If he's real, he can come back.",
        act: async (w) => {
          await wait(500);
          await w.cast.stranger.walk([[-2.4, 3.8], [-7, 4.4]]);
          w.setTorch(false);
        },
      },
      {
        label: 'Open it a crack to see his ID.',
        effect: { safety: -30 },
        then: 'An open door is an open door. You can see him through the window, and the doorbell camera already did.',
        act: (w) => w.setDoor(-0.38),
      },
    ],
    cleanup: (w) => {
      w.setTorch(false);
      w.setDoor(0);
      w.setDolly(false);
    },
    addon: A.door.said,
  },
  {
    when: '8:20 pm · the kitchen',
    hour: 20.33,
    shot: 'island',
    title: '"My mouth feels a bit funny."',
    story: "Maya says she ate a granola bar from her friend Zoe's bag at pickup. She seems fine, just quiet.",
    ask: 'ate',
    setup: (w) => {
      w.hideAll();
      w.show.bar(true);
      w.cast.maya.place(10.1, 4.15).faceTo(10.6, 7);
      w.cast.priya.place(11.2, 4.35).faceTo(10.1, 4.15);
    },
    during: () => {
      sfx.heartbeat(true);
      return () => sfx.heartbeat(false);
    },
    choices: [
      { label: "It's probably nothing. Send her to brush her teeth.", effect: { safety: -35 }, then: 'A funny mouth after unknown food, in a child with a nut allergy, is a sign to watch closely, not to send away.' },
      { label: 'Keep her with you, watch her closely, and message Anita.', effect: { mood: 2 }, best: true, then: 'Watching for swelling, hives, vomiting or trouble breathing is exactly right. And then…' },
      { label: 'Give her some water and an allergy pill from the cabinet.', effect: { safety: -25, rules: -15 }, then: "No medicine unless a parent says so on the phone. And a pill doesn't stop a severe reaction: the EpiPen does." },
    ],
    addon: A.ate.said,
  },
];

const BEDTIME: Moment = {
  when: '8:40 pm · Maya’s room',
  hour: 20.67,
  shot: 'maya',
  title: '"I want Mummy."',
  story: "The paramedics checked her and she's fine now, but she's tired and teary, and Anita is on her way home.",
  ask: 'misses',
  setup: (w) => {
    w.hideAll();
    w.cast.maya.place(14.45, 1.7, 0);
    w.cast.maya.setLying(true, 0.56, true);
    w.cast.priya.place(13.55, 2.7).faceTo(14.45, 1.4);
    w.setMotes(true);
  },
  choices: [
    {
      label: 'Play the goodnight message Anita recorded for her.',
      effect: { mood: 15 },
      best: true,
      then: 'Mom\'s own voice: "Goodnight, my love." She\'s asleep before the end.',
      act: async (w) => {
        say('Goodnight', 'Anita left a message for Maya.\n"Goodnight, my love. Sweet dreams. I\'ll see you at breakfast."', 'message');
        w.setMode('echo');
        document.body.classList.add('at-echo');
        await w.go('echo', undefined, 1.4);
        await wait(3800);
        document.body.classList.remove('at-echo');
        w.setMode('calm');
        await w.go('maya', undefined, 1.6);
        w.burstAt(14.45, 0.9, 0.7, '#ff8fb1', 60);
      },
    },
    { label: "Tell her big girls don't cry.", effect: { mood: -20 }, then: "She cries harder. It's been a big night.", act: (w) => w.cast.maya.shiver() },
    { label: 'Let her stay up until Mom gets home.', effect: { rules: -10, mood: 5 }, then: "Kind, but she's exhausted, and lights out was at 8." },
  ],
  addon: A.misses.said,
};

async function play(m: Moment) {
  if (W) {
    m.setup?.(W);
    await W.go(m.shot, m.hour, 2.2);
  } else fallbackHour = m.hour;
  scene(m.when, m.title, m.story);
  say('Tonight', "Ask me anything about tonight. I answer in the parents' own words.");
  let asked = false;
  let stopTimer = () => {};
  const stopDuring = W && m.during ? m.during(W) : () => {};
  let done = false;
  const picked = await new Promise<Choice>((resolve) => {
    const finish = (c: Choice) => {
      if (done) return;
      done = true;
      stopTimer();
      stopDuring();
      resolve(c);
    };
    const ask = button(
      'Ask the Echo Show first',
      async () => {
        asked = true;
        ask.disabled = true;
        sfx.wake();
        const a = A[m.ask];
        say(a.topic ?? 'Tonight', a.said, m.ask === 'door' ? 'alert' : '');
        if (W) {
          // the camera goes to the kitchen wall to read it, then back
          W.setMode('echo');
          document.body.classList.add('at-echo');
          await W.go('echo', undefined, 1.1);
          await wait(Math.min(5200, 1400 + a.said.length * 22));
          document.body.classList.remove('at-echo');
          if (!done) {
            W.setMode(m.ask === 'scary' ? 'tv' : 'calm');
            await W.go(m.shot, undefined, 1.2);
          }
        }
      },
      'ask',
      'A',
    );
    m.choices.forEach((c) => button(c.label, () => finish(c)));
    if (m.seconds && m.timeout) stopTimer = countdown(m.seconds, () => finish(m.timeout!));
    el.choices.querySelector<HTMLButtonElement>('button.choice:not(.ask)')?.focus({ preventScroll: true });
  });
  el.choices.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
  el.choices.classList.add('chosen');
  document.body.classList.remove('at-echo');
  el.choices.querySelectorAll('button.choice:not(.ask)').forEach((b) => {
    if (b.querySelector('span')?.textContent === picked.label) b.classList.add('picked');
  });
  if (W) {
    W.setMode(m.shot === 'living' ? 'tv' : 'calm'); // the bath choice switches the TV off itself
    void W.go(m.shot, undefined, 0.8);
  }
  setMeters(picked.effect);
  const bad = !picked.best && (picked.effect.safety ?? 0) < -20;
  if (picked.best) {
    sfx.good();
    W?.good();
  } else if (bad) {
    sfx.bad();
    W?.bad(Math.min(1.3, -(picked.effect.safety ?? 0) / 35));
    flash();
  } else {
    sfx.bad();
    W?.bad(0.35);
  }
  log.push({ title: m.title, picked: picked.label, best: Boolean(picked.best), asked, addon: m.addon });
  el.note.hidden = false;
  el.note.className = `note ${picked.best ? 'good' : bad ? 'bad' : 'meh'}`;
  el.note.textContent = picked.then;
  el.status.textContent = picked.then;
  el.note.focus({ preventScroll: true });
  el.panel.scrollTo({ top: el.panel.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  if (W && picked.act) await Promise.race([picked.act(W), wait(2600)]);
  await nextButton();
  if (W) m.cleanup?.(W);
}

/** The handover: three questions before the parents leave, from the add-on's own teach-back. */
async function handover() {
  if (W) {
    W.hideAll();
    W.cast.anita.place(0.9, 3.5).faceTo(2.4, 3.3);
    W.cast.rahul.place(1.3, 4.3).faceTo(2.4, 3.3);
    W.cast.priya.place(2.4, 3.3).faceTo(1.0, 3.8);
    W.cast.maya.place(2.7, 4.6).faceTo(1.0, 3.8);
    await W.go('hall', 18.0, 3.2);
  } else fallbackHour = 18;
  scene('6:00 pm · the front hall', 'Anita and Rahul are heading out.', '"Priya is babysitting tonight." Before they go, the Echo Show checks you know the three things that matter. Ten seconds each.');
  sfx.wake();
  say('Quick check', `Quick check before the parents leave: ${TB.length} questions.`);
  const options = [
    ['Peanuts', 'Strawberries', 'Dairy'],
    ['Kitchen drawer, left of the stove', 'The bathroom cabinet', "Anita's handbag"],
    ['Anita (Mom)', 'Mrs. Lee next door', 'Rahul (Dad)'],
  ];
  let right = 0;
  for (let q = 0; q < TB.length; q++) {
    await new Promise<void>((resolve) => {
      el.choices.replaceChildren();
      el.story.textContent = `${q + 1} of ${TB.length}. ${TB[q].ask}`;
      const order = [...options[q]].sort(() => Math.random() - 0.5);
      let stop = () => {};
      let done = false;
      const pick = (o: string | null) => {
        if (done) return;
        done = true;
        stop();
        el.choices.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
        const ok = o === options[q][0];
        if (ok) {
          right++;
          sfx.step();
          W?.good(W.cast.priya, '#7fe3ff');
        } else {
          setMeters({ safety: -8 });
          sfx.bad();
          W?.bad(0.4);
        }
        say('Quick check', ok ? "That's right." : `Not quite. The parents said: "${TB[q].answer}"`, ok ? '' : 'alert');
        setTimeout(resolve, reduced ? 300 : ok ? 1100 : 2600);
      };
      order.forEach((o) => button(o, () => pick(o)));
      el.choices.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      stop = countdown(10, () => pick(null));
    });
  }
  log.push({ title: 'The handover check', picked: `${right} of ${TB.length} right`, best: right === TB.length, asked: true, addon: 'Asks these three questions before the parents leave, and shows the parents the result on their phones.' });
  say('Quick check', right === TB.length ? 'All 3 right. The parents can see the handover is confirmed.' : `${right} of 3. I've shown you the right answers, and the parents can see it.`);
  el.choices.replaceChildren();
  el.story.textContent = right === TB.length ? 'All three right. Anita and Rahul wave goodbye.' : 'The Echo Show filled in what you missed. Anita and Rahul wave goodbye.';
  if (W) {
    W.setDoor(-1.35);
    const a = W.cast.anita.walk([[0.5, 2.9], [-1.4, 2.9], [-7.5, 3.2]]);
    await wait(700);
    const r = W.cast.rahul.walk([[0.6, 3.0], [-1.4, 3.0], [-7.5, 3.4]]);
    await wait(2600);
    W.setDoor(0);
    await Promise.race([Promise.all([a, r]), wait(5000)]);
  }
  await nextButton('The evening begins');
}

/** The emergency: the parents' plan, in order, against the clock; the Wi-Fi drops halfway. */
async function emergency() {
  if (W) {
    W.show.bar(true);
    // lying down, her head goes toward the living room, clear of the island
    W.cast.maya.place(9.7, 4.3, Math.PI / 2);
    W.cast.priya.place(11.0, 4.6).faceTo(9.7, 4.3);
    W.setRed(true);
    W.setMode('emergency');
    W.shake(0.7);
    void W.go('kitchen', 20.37, 0.9);
  }
  sfx.bad();
  sfx.alarm(true);
  flash();
  document.body.classList.add('red');
  scene('8:22 pm · the kitchen', '"My lips feel big."', "Maya's lips are swelling and she's coughing. Do the parents' plan, in order. Tap the steps.");
  say('Emergency', A.emergency.said, 'alert');
  const steps = PLAN.map((_, i) => ({ t: PLAN_SHORT[i], i })).sort(() => Math.random() - 0.5);
  el.choices.classList.add('grid');
  let next = 0;
  let mistakes = 0;
  const started = performance.now();
  const wifiAt = 2;
  await new Promise<void>((resolve) => {
    let stop = () => {};
    steps.forEach((s, k) => {
      const b = button(
        s.t,
        () => {
          if (s.i !== next) {
            mistakes++;
            setMeters({ safety: -6 });
            sfx.bad();
            W?.bad(0.5);
            b.classList.remove('wrong');
            void b.offsetWidth;
            b.classList.add('wrong');
            say('Emergency', `Not yet. The plan says first: ${PLAN[next]}`, 'alert');
            return;
          }
          b.disabled = true;
          b.classList.add('done');
          b.querySelector('kbd')!.textContent = '✓';
          next++;
          sfx.step();
          if (W) {
            if (s.i === 0) {
              W.setDrawer(true);
              void W.go('drawer', undefined, 0.8)
                .then(() => wait(1200))
                .then(() => W.go('kitchen', undefined, 0.9));
              setTimeout(() => W.burstAt(10.55, 0.85, 1.0, '#ff7a3d', 50), 700);
            }
            if (s.i === 1 || s.i === 4) W.setPhone(true);
            if (s.i === 2) W.cast.maya.setLying(true);
            if (s.i === 3) W.good(W.cast.priya, '#ff9a5c');
          }
          if (next === PLAN.length) {
            stop();
            resolve();
          } else if (next === wifiAt) {
            W?.glitch(1100);
            sfx.glitch();
            say('No connection', `The Wi-Fi dropped. The steps are saved on this screen: carry on. Step ${next + 1} of ${PLAN.length}: ${PLAN[next]}`, 'offline');
          } else say(next > wifiAt ? 'Offline · emergency' : 'Emergency', `Step ${next + 1} of ${PLAN.length}: ${PLAN[next]}`, next > wifiAt ? 'offline' : 'alert');
        },
        'step',
        String(k + 1),
      );
    });
    stop = countdown(60, () => {
      setMeters({ safety: -25 });
      resolve();
    });
  });
  const secs = Math.round((performance.now() - started) / 1000);
  document.body.classList.remove('red');
  sfx.alarm(false);
  log.push({ title: 'The allergic reaction', picked: next === PLAN.length ? `All ${PLAN.length} steps in ${secs} s, ${mistakes} out of order` : `${next} of ${PLAN.length} steps before time ran out`, best: next === PLAN.length && mistakes === 0, asked: true, addon: "Reads the parents' plan one step at a time, starts the 5-minute timer for the second EpiPen, alerts both parents, and keeps going when the internet drops." });
  el.choices.replaceChildren();
  if (W) {
    W.setRed(false);
    W.setMode('siren');
    sfx.siren();
    void W.go('path', undefined, 2.2);
  }
  el.note.hidden = false;
  el.note.className = `note ${mistakes === 0 && next === PLAN.length ? 'good' : 'meh'}`;
  el.note.textContent = next === PLAN.length ? `Done in ${secs} seconds. The paramedics are at the door at 8:31, and Maya is going to be fine. The Wi-Fi dropped at step 2; the guide kept going.` : 'The paramedics arrive and take over. Maya is going to be fine.';
  say('Emergency over', 'Help has taken over. Both parents have been told. Say "emergency" again if anything changes.');
  await nextButton();
  if (W) {
    W.setMode('calm');
    W.setDrawer(false);
    W.setPhone(false);
    W.show.bar(false);
  }
}

function grade() {
  const total = Math.round(meters.safety * 0.6 + meters.rules * 0.25 + meters.mood * 0.15);
  const [name, line] =
    meters.safety >= 90 && total >= 85
      ? ['Trusted sitter', 'Anita is booking you for next Saturday.']
      : meters.safety >= 70
        ? ['Good, with a wobble', 'Maya is fine. A couple of moments could have gone wrong.']
        : ['A close call', 'Tonight could have ended very differently. This is why the rules live in code.'];
  return { total, name, line };
}

async function review() {
  if (W) {
    W.setMotes(false);
    W.hideAll();
    W.cast.anita.place(-8, 3.0);
    W.cast.rahul.place(-8.6, 3.4);
    await W.go('house', 23.0, 3.4);
    W.setDoor(-1.35);
    void W.cast.anita.walk([[-0.6, 2.9], [1.4, 3.3]]);
    void W.cast.rahul.walk([[-0.6, 3.1], [1.8, 3.9]]);
  } else fallbackHour = 23;
  const g = grade();
  document.body.classList.add('ended');
  scene('11:00 pm · home', `${g.name}.`, g.line);
  say('The evening', 'The parents are home. They have a summary of the evening, and Priya was paid from their phone.');
  if (g.total >= 85) {
    sfx.good();
    W?.burstAt(1.6, 2.2, 3.4, '#ffd27a', 120);
  }
  const score = document.createElement('div');
  score.className = 'score';
  score.innerHTML = `<div class="big"><b>${g.total}</b><span>of 100</span></div>${(['safety', 'rules', 'mood'] as Meter[]).map((k) => `<div><b>${meters[k]}</b><span>${k === 'rules' ? 'House rules' : k === 'mood' ? 'Maya' : 'Safety'}</span></div>`).join('')}`;
  const list = document.createElement('ol');
  list.className = 'review';
  log.forEach((r) => {
    const li = document.createElement('li');
    li.className = r.best ? 'good' : 'meh';
    li.innerHTML = `<p class="t"></p><p class="you"><b>You</b><span></span></p><p class="addon"><b>The Echo Show</b><span></span></p>`;
    li.querySelector('.t')!.textContent = r.title;
    li.querySelector('.you span')!.textContent = r.picked + (r.asked ? ' (you asked the Echo Show)' : '');
    li.querySelector('.addon span')!.textContent = r.addon;
    list.append(li);
  });
  const row = document.createElement('div');
  row.className = 'cta-row';
  row.innerHTML = '<a class="btn primary" href="/while-youre-out/try.html">Try the real add-on</a><a class="btn" href="/while-youre-out/safety.html">How the safety works</a><button class="btn" type="button" id="again">Play again</button>';
  el.choices.replaceChildren(score, list, row);
  document.getElementById('again')!.addEventListener('click', () => location.reload());
}

// ---------- start ----------
setMeters();
W?.setHourNow(19.55); // the title: blue hour, the house lit; Start rewinds to 6 pm
say('Tonight', "Ask me anything about tonight. I answer in the parents' own words.");
el.sound.addEventListener('click', () => {
  unlock();
  setMuted(!isMuted());
  el.sound.setAttribute('aria-pressed', String(isMuted()));
});
el.story.textContent = "Maya is 6 and allergic to peanuts. Bruno the dog is asleep in his bed. You have the parents' notes, and a kitchen Echo Show that knows them too. Get through the evening.";
const relax = document.createElement('button');
relax.type = 'button';
relax.className = 'relax';
relax.setAttribute('aria-pressed', String(relaxed));
relax.textContent = 'No timers';
relax.addEventListener('click', () => {
  relaxed = !relaxed;
  relax.setAttribute('aria-pressed', String(relaxed));
});
const start = button(
  'Start the evening',
  async () => {
    start.disabled = true;
    unlock();
    sfx.whoosh();
    document.body.classList.remove('intro');
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // ?from=door (or cookies, tv, ate, emergency, bedtime, end) starts there: for filming
    const evening: Array<[string, () => Promise<void>]> = [
      ['handover', handover],
      ['cookies', () => play(MOMENTS[0])],
      ['tv', () => play(MOMENTS[1])],
      ['door', () => play(MOMENTS[2])],
      ['ate', () => play(MOMENTS[3])],
      ['emergency', emergency],
      ['bedtime', () => play(BEDTIME)],
      ['end', review],
    ];
    const from = Math.max(0, evening.findIndex(([k]) => k === new URLSearchParams(location.search).get('from')));
    for (const [, step] of evening.slice(from)) await step();
  },
  'start',
  '↵',
);
el.choices.append(relax);
start.focus({ preventScroll: true });
