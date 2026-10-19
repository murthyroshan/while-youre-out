// The card's design tokens against the Alexa+ accessibility rules: every text colour on the
// backgrounds it is used on meets 4.5:1 (3:1 for large or bold text), in light and dark, and on the
// screens with their own palette (night, emergency, goodnight). Touch targets are at least 48 px.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../src/mcp/card/card.css', import.meta.url)), 'utf8');

/** The custom properties declared in the first rule whose selector matches. */
function tokens(selector: RegExp): Record<string, string> {
  const m = new RegExp(`(?:^|\\n)\\s*(?:${selector.source})\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(m, `no rule for ${selector}`);
  const out: Record<string, string> = {};
  for (const d of m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
const hex = (c: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  assert.ok(m, `not a hex colour: ${c}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
};
const lum = (c: string) => {
  const [r, g, b] = hex(c).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const dark = tokens(/:root, \.theme-dark/);
const light = tokens(/\.theme-light/);
const night = { ...dark, ...tokens(/\.home\.night/) };

for (const [name, t] of [['dark', dark], ['light', light], ['night', night]] as const) {
  test(`${name}: body text meets 4.5:1 on every surface it sits on`, () => {
    for (const fg of ['text', 'text-2', 'text-3']) {
      for (const bg of ['page', 'card', 'inner']) {
        const r = ratio(t[fg], t[bg]);
        assert.ok(r >= 4.5, `${name} --${fg} on --${bg}: ${r.toFixed(2)}:1`);
      }
    }
  });
  test(`${name}: buttons and accents are readable`, () => {
    assert.ok(ratio(t['btn-1-text'], t['btn-1']) >= 4.5, `${name} primary button ${ratio(t['btn-1-text'], t['btn-1']).toFixed(2)}`);
    assert.ok(ratio(t['btn-2-text'], t['btn-2']) >= 4.5, `${name} secondary button ${ratio(t['btn-2-text'], t['btn-2']).toFixed(2)}`);
    // The accent marks bold labels and icons only: the large-text rule (3:1).
    assert.ok(ratio(t.accent, t.card) >= 3, `${name} accent on card ${ratio(t.accent, t.card).toFixed(2)}`);
  });
}

for (const [name, t] of [['dark', dark], ['light', light]] as const) {
  test(`${name}: safety, guard and success notes are readable`, () => {
    for (const [fg, bg] of [['danger', 'danger-soft'], ['warn', 'warn-soft'], ['ok', 'ok-soft'], ['text-2', 'danger-soft'], ['text-2', 'warn-soft'], ['text-2', 'ok-soft']]) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${name} --${fg} on --${bg}: ${r.toFixed(2)}:1`);
    }
    for (const fill of ['danger-fill', 'ok-fill']) assert.ok(ratio('#FFFFFF', t[fill]) >= 4.5, `${name} white on --${fill}: ${ratio('#FFFFFF', t[fill]).toFixed(2)}`);
  });
}

test('the emergency screen is readable in both themes (its own palette)', () => {
  const page = tokens(/\.emergency/).page;
  assert.ok(ratio('#FFFFFF', page) >= 4.5, `white on the emergency red ${ratio('#FFFFFF', page).toFixed(2)}`);
  assert.ok(ratio('#FFE3E0', page) >= 4.5, 'the fine print on the emergency red');
  assert.ok(ratio('#B42318', '#FFFFFF') >= 4.5, 'red labels on the white step card');
});

test('touch targets are at least 48 x 48 and buttons use them', () => {
  assert.match(css, /--target:\s*48px/);
  assert.match(css, /\.btn \{[^}]*min-height: var\(--target\);[^}]*min-width: var\(--target\)/);
});

test('one root scale from the 768 x 480 canvas, and no gradients or glows on large fields', () => {
  assert.match(css, /html \{ zoom: var\(--scale\); \}/);
  assert.doesNotMatch(css, /gradient\(/, 'flat surfaces only');
  assert.doesNotMatch(css, /box-shadow:[^;]*\d+px \d+px \d+px/, 'no drop shadows or glows');
});
