// Every page: the current page marked in the header, the phone menu, the light bar as reading
// progress; and on the content pages (and the home page's closing section) the night: the shader
// sky, the Echo Show in the opening, things arriving as you scroll, numbers that count up, cards
// lit where the pointer is, and data moving along the wires of the drawing.
import { mountSky } from './sky';
import { mountHero } from './hero';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function siteChrome(current: string) {
  document.querySelectorAll<HTMLAnchorElement>(`.site-head nav a[data-page="${current}"]`).forEach((a) => a.setAttribute('aria-current', 'page'));
  const menu = document.querySelector<HTMLButtonElement>('.site-head .menu');
  const nav = document.getElementById('site-nav');
  menu?.addEventListener('click', () => {
    const open = !nav?.classList.contains('open');
    nav?.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
  });
  const read = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    document.documentElement.style.setProperty('--read', String(max > 0 ? Math.min(1, scrollY / max) : 0));
  };
  addEventListener('scroll', read, { passive: true });
  read();
}

function sky(host: HTMLElement, fixed: boolean) {
  const c = document.createElement('canvas');
  c.className = 'sky-bg';
  c.setAttribute('aria-hidden', 'true');
  if (fixed) document.body.prepend(c);
  else host.prepend(c);
  mountSky(c);
}

/** Things arrive as they scroll into view, one after another within a group. */
function reveal(root: ParentNode) {
  const els = root.querySelectorAll<HTMLElement>('.hero-copy > *, .sect > header, .stat, .rules li, .cards > .card, table.plain tr, .honest, .diagram, .sect > div > p, .cta-row');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  els.forEach((el) => {
    const i = [...(el.parentElement?.children ?? [])].indexOf(el);
    el.style.setProperty('--d', `${Math.min(i, 8) * 0.07}s`);
    el.classList.add('rv');
    io.observe(el);
  });
}

/** "2,000", "91%", "49 / 49", "~2 ms": every number in the text counts up from zero. */
function countUp(root: ParentNode) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target as HTMLElement;
      const text = el.textContent ?? '';
      const parts = text.split(/(\d[\d,]*(?:\.\d+)?)/);
      const nums = parts.map((p, i) => (i % 2 ? Number(p.replace(/,/g, '')) : null));
      const dur = 1400;
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        const ease = 1 - Math.pow(1 - k, 4);
        el.textContent = parts.map((p, i) => (nums[i] === null ? p : Math.round(nums[i]! * ease).toLocaleString('en-US'))).join('');
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = text;
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  root.querySelectorAll<HTMLElement>('.stat b').forEach((b) => io.observe(b));
}

/** Cards are lit where the pointer is. */
function spotlight(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.card').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const b = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - b.left}px`);
      c.style.setProperty('--my', `${e.clientY - b.top}px`);
    });
    c.addEventListener('pointerleave', () => {
      c.style.setProperty('--mx', '-200px');
      c.style.setProperty('--my', '-200px');
    });
  });
}

/** The architecture drawing: small lights travel along each wire, the way the calls do. */
function packets() {
  const svg = document.querySelector<SVGSVGElement>('.diagram');
  if (!svg) return;
  const ns = 'http://www.w3.org/2000/svg';
  svg.querySelectorAll<SVGPathElement>('path.wire').forEach((p, i) => {
    p.id ||= `wire-${i}`;
    for (let k = 0; k < 2; k++) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('r', '3.5');
      c.setAttribute('class', `packet${p.classList.contains('dash') ? ' warm' : ''}`);
      const m = document.createElementNS(ns, 'animateMotion');
      m.setAttribute('dur', `${2.2 + (i % 3) * 0.4}s`);
      m.setAttribute('repeatCount', 'indefinite');
      m.setAttribute('begin', `${(i * 0.37 + k * 1.1).toFixed(2)}s`);
      const mp = document.createElementNS(ns, 'mpath');
      mp.setAttribute('href', `#${p.id}`);
      m.append(mp);
      c.append(m);
      svg.append(c);
    }
  });
}

const page = document.body.dataset.page ?? '';
siteChrome(page);
if (document.body.classList.contains('page') && !document.body.classList.contains('game')) {
  sky(document.body, true);
  const hero = document.querySelector<HTMLElement>('.hero-device');
  if (hero) mountHero(hero, hero.dataset.script ?? page);
  if (!reduced) {
    reveal(document);
    packets();
  }
  countUp(document);
  spotlight(document);
}
const after = document.querySelector<HTMLElement>('.after');
if (after) {
  sky(after, false);
  // past the story: the header gets its glass, the clock chip goes
  const past = () => document.body.classList.toggle('past-story', after.getBoundingClientRect().top < 90);
  addEventListener('scroll', past, { passive: true });
  past();
  if (!reduced) reveal(after);
  countUp(after);
  spotlight(after);
}
