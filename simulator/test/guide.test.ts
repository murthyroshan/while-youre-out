// The guided evening: what Mom does on her phone during "Watch the evening" is keyed by a step's
// title and a line said in it. If a step is renamed or a line changes, Mom would silently stop
// answering in the demo; this catches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE, HIGHLIGHTS, MOMENTS } from '../src/guide';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const block = app.slice(app.indexOf('const directions'), app.indexOf('const stopPlaying'));
const keys = [...block.matchAll(/^\s*['"](.+?:.+?)['"]: (?:async )?\(fast\)/gm)].map((m) => m[1]);

test("every one of Mom's demo answers points at a real step and a real line", () => {
  assert.ok(keys.length >= 5, `found ${keys.length} keys`);
  for (const key of keys) {
    const [title, ...rest] = key.split(':');
    const said = rest.join(':');
    const step = GUIDE.find((g) => g.title === title);
    assert.ok(step, `no step titled "${title}"`);
    assert.ok(step.actions.some((a) => 'say' in a && a.say === said), `"${title}" never says "${said}"`);
  }
});

test('the highlights are real steps, in the order of the evening', () => {
  const at = HIGHLIGHTS.map((t) => GUIDE.findIndex((g) => g.title === t));
  assert.ok(at.every((i) => i >= 0), `unknown highlight in ${HIGHLIGHTS.join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test('every ?moment= link opens on the step it names', () => {
  for (const [name, title] of Object.entries(MOMENTS)) assert.ok(GUIDE.some((g) => g.title === title), `?moment=${name} points at "${title}", which is not a step`);
  assert.equal(GUIDE[GUIDE.findIndex((g) => g.title === MOMENTS.door)].title, 'A knock at the door');
});
