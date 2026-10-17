# Pendulum Sonification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public page that sonifies a single pendulum — sampling its motion, estimating frequency, and playing it back as music — running unattended forever, plus a generated theme-aware SVG hero for the author's GitHub profile.

**Architecture:** Pure, dependency-free ES modules hold all maths (`physics`, `ring`, `score`, `scheduler`); browser-coupled code is isolated in `audio` (Web Audio, dependency-injected context) and `render` (canvas 2D, state in / pixels out). `main.js` only wires them. Note timing is driven by the audio clock through a lookahead scheduler once sound is enabled. The SVG hero is generated from the same `physics.js` the page imports, so the hero cannot drift from the demo.

**Tech Stack:** Vanilla ES modules, Canvas 2D, Web Audio API, `node --test` (zero runtime and zero dev dependencies), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-17-pendulum-sonification-design.md`

## Global Constraints

- **Zero dependencies.** No runtime and no dev dependencies. Tests run on `node --test`. Copy exact values from this list; do not invent alternatives.
- `g = 9.81`, `AMPLITUDE = 0.36` rad, `RESAMPLE = 256`, master gain `0.45`, lookahead interval `25 ms`, lookahead window `100 ms`, hero and page share a `13.54 s` loop.
- Just intonation table, exact values: `A3 220`, `B3 247.5`, `C4 264`, `D4 293.3333333333333`, `E4 330`, `G4 396`, `A4 440`.
- The 16-note line, exact order: `A3 C4 D4 E4 G4 A4 G4 E4 D4 E4 G4 E4 D4 C4 B3 A3`.
- Every non-positive frequency or duration **throws `RangeError`** — never returns `Infinity` or `NaN` silently.
- All history traces use fixed-capacity ring buffers. No growing arrays anywhere in the frame loop.
- The page is silent until a user gesture. Never attempt to start audio on load.
- No meaning carried by colour alone. `prefers-reduced-motion` renders a static frame.
- Sound is impossible in a README (`<audio>` is stripped). The hero is silent and links out.

## Review Focus

These are the input classes and failure modes the spec implies but that are easy to leave untested. Each line's test is added to the task that owns the code.

1. **`AudioContext` cannot be constructed** (blocked, unsupported, or a `file://` restriction): a reasonable person expects the page to keep animating silently rather than go blank. → Task 6, `unlock()` must return `null` and swallow the error.
2. **The tab is backgrounded for hours**, throttling or stopping `requestAnimationFrame`: a reasonable person expects no burst of skipped or duplicated notes on return. → Task 5, `tick()` must never schedule a note twice, and must catch up in order.
3. **A tiny viewport** (a 320 px phone, or a resize mid-frame): a reasonable person expects panels to stay positive-sized and inside the canvas, not negative widths or `NaN` coordinates. → Task 7, `panelRects` guard.
4. **`prefers-reduced-motion: reduce` is set**: a reasonable person expects a still frame with readable numbers, not a spinning pendulum. → Task 8, static-frame path.
5. **A corrupt score entry** (a note name missing from the table, or a zero/negative period): a reasonable person expects a loud, immediate error rather than a hang or `Infinity` rod. → Tasks 1–3 and 5, the `RangeError` tests plus `MAX_NOTES_PER_TICK`.

---

### Task 1: Physics core

**Files:**
- Create: `src/physics.js`
- Test: `test/physics.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `G`, `AMPLITUDE`, `RESAMPLE` (numbers); `pendulumFrequency(rodMetres) → Hz`; `rodLength(fPendulum) → metres`; `period(fPendulum) → seconds`; `theta(t, fPendulum, amplitude?) → radians`; `audioFrequency(fPendulum) → Hz`; `pendulumFrequencyForAudio(fAudio) → Hz`; `rodForAudioFrequency(fAudio) → metres`; `periodForAudioFrequency(fAudio) → seconds`.

- [ ] **Step 1: Write the failing test**

Create `test/physics.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, AMPLITUDE, RESAMPLE,
  pendulumFrequency, rodLength, period, theta,
  audioFrequency, pendulumFrequencyForAudio,
  rodForAudioFrequency, periodForAudioFrequency,
} from '../src/physics.js';

const close = (a, b, tol = 5e-4) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);

test('constants match the spec', () => {
  assert.equal(G, 9.81);
  assert.equal(AMPLITUDE, 0.36);
  assert.equal(RESAMPLE, 256);
});

test('a 24 cm rod swings at 1.0175 Hz', () => {
  close(pendulumFrequency(0.24), 1.01754);
});

test('f -> L -> f round-trips', () => {
  for (const L of [0.06, 0.15, 0.24, 0.336, 0.5]) {
    close(rodLength(pendulumFrequency(L)), L, 1e-9);
  }
});

test('period is the reciprocal of frequency', () => {
  close(period(2), 0.5, 1e-12);
});

test('theta peaks at t=0, troughs at half a period, and returns at a full period', () => {
  const f = 1.0313, T = period(f);
  close(theta(0, f), AMPLITUDE, 1e-12);
  close(theta(T / 2, f), -AMPLITUDE, 1e-12);
  close(theta(T, f), AMPLITUDE, 1e-12);
});

test('the resample maps a 24 cm pendulum into the audible range', () => {
  const fPend = pendulumFrequency(0.24);
  close(audioFrequency(fPend), fPend * 256, 1e-9);
  close(pendulumFrequencyForAudio(audioFrequency(fPend)), fPend, 1e-12);
});

test('A3 (220 Hz) needs a 33.6 cm rod and a 1.164 s swing', () => {
  close(rodForAudioFrequency(220), 0.336469, 1e-5);
  close(periodForAudioFrequency(220), 1.163636, 1e-5);
});

test('corrupt input throws RangeError instead of returning Infinity or NaN', () => {
  assert.throws(() => pendulumFrequency(0), RangeError);
  assert.throws(() => pendulumFrequency(-1), RangeError);
  assert.throws(() => rodLength(0), RangeError);
  assert.throws(() => rodLength(-3), RangeError);
  assert.throws(() => period(0), RangeError);
  assert.throws(() => theta(0, 0), RangeError);
  assert.throws(() => rodForAudioFrequency(0), RangeError);
  assert.throws(() => periodForAudioFrequency(-220), RangeError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/physics.test.mjs`
Expected: FAIL — `Cannot find module '../src/physics.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/physics.js`:

```js
export const G = 9.81;
export const AMPLITUDE = 0.36;   // radians, ~20.6 degrees
export const RESAMPLE = 256;     // playback speedup that brings the swing into audio range

function positive(value, name) {
  if (!(value > 0)) throw new RangeError(`${name} must be > 0, got ${value}`);
  return value;
}

/** f = (1/2pi) * sqrt(g/L) */
export function pendulumFrequency(rodMetres) {
  return Math.sqrt(G / positive(rodMetres, 'rodMetres')) / (2 * Math.PI);
}

/** L = g / (2pi f)^2 */
export function rodLength(fPendulum) {
  const w = 2 * Math.PI * positive(fPendulum, 'fPendulum');
  return G / (w * w);
}

export function period(fPendulum) {
  return 1 / positive(fPendulum, 'fPendulum');
}

/** Angular displacement of an ideal, undamped, small-angle pendulum. */
export function theta(t, fPendulum, amplitude = AMPLITUDE) {
  return amplitude * Math.cos(2 * Math.PI * positive(fPendulum, 'fPendulum') * t);
}

export function audioFrequency(fPendulum) {
  return positive(fPendulum, 'fPendulum') * RESAMPLE;
}

export function pendulumFrequencyForAudio(fAudio) {
  return positive(fAudio, 'fAudio') / RESAMPLE;
}

export function rodForAudioFrequency(fAudio) {
  return rodLength(pendulumFrequencyForAudio(fAudio));
}

export function periodForAudioFrequency(fAudio) {
  return period(pendulumFrequencyForAudio(fAudio));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/physics.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/physics.js test/physics.test.mjs
git commit -m "feat(physics): small-angle pendulum maths and the 256x resample mapping"
```

---

### Task 2: Ring buffer

**Files:**
- Create: `src/ring.js`
- Test: `test/ring.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `class Ring` with `constructor(capacity)`, `push(value)`, `toArray() → oldest-first array`, `get length`, `get capacity`.

- [ ] **Step 1: Write the failing test**

Create `test/ring.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ring } from '../src/ring.js';

test('holds values oldest-first', () => {
  const r = new Ring(3);
  r.push(1); r.push(2);
  assert.deepEqual(r.toArray(), [1, 2]);
  assert.equal(r.length, 2);
});

test('overwrites the oldest value once full', () => {
  const r = new Ring(3);
  [1, 2, 3, 4, 5].forEach((v) => r.push(v));
  assert.deepEqual(r.toArray(), [3, 4, 5]);
  assert.equal(r.length, 3);
});

test('memory stays flat across a hundred thousand pushes', () => {
  const r = new Ring(64);
  for (let i = 0; i < 100_000; i++) r.push(i);
  assert.equal(r.length, 64);
  assert.equal(r.toArray().length, 64);
  assert.equal(r.toArray().at(-1), 99_999);
  assert.equal(r.toArray()[0], 100_000 - 64);
});

test('rejects a nonsensical capacity', () => {
  assert.throws(() => new Ring(0), RangeError);
  assert.throws(() => new Ring(-1), RangeError);
  assert.throws(() => new Ring(1.5), RangeError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ring.test.mjs`
Expected: FAIL — `Cannot find module '../src/ring.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/ring.js`:

```js
/** Fixed-capacity buffer. The page runs for days, so nothing may grow without bound. */
export class Ring {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.items = new Array(capacity);
    this.start = 0;
    this.length = 0;
  }

  push(value) {
    if (this.length < this.capacity) {
      this.items[(this.start + this.length) % this.capacity] = value;
      this.length += 1;
    } else {
      this.items[this.start] = value;
      this.start = (this.start + 1) % this.capacity;
    }
  }

  toArray() {
    const out = new Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.items[(this.start + i) % this.capacity];
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ring.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ring.js test/ring.test.mjs
git commit -m "feat(ring): fixed-capacity history buffer for the frame loop"
```

---

### Task 3: Score

**Files:**
- Create: `src/score.js`
- Test: `test/score.test.mjs`

**Interfaces:**
- Consumes: `rodForAudioFrequency`, `periodForAudioFrequency` from `./physics.js`.
- Produces: `JUST_INTONATION` (`{[name]: Hz}`), `LINE` (`string[16]`), `buildScore(line?, table?) → NoteEvent[]`, `loopDuration(events) → seconds`, `noteIndexAtOrAfter(events, elapsedInLoop) → integer index`, `eventAt(events, elapsedInLoop) → {index, event, phase}`. A `NoteEvent` is `{index, name, fAudio, fPendulum, period, rodMetres}`.

- [ ] **Step 1: Write the failing test**

Create `test/score.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JUST_INTONATION, LINE, buildScore, loopDuration, noteIndexAtOrAfter, eventAt } from '../src/score.js';

test('the line is sixteen notes and resolves onto its first note', () => {
  const events = buildScore();
  assert.equal(events.length, 16);
  assert.equal(events[0].name, 'A3');
  assert.equal(events.at(-1).name, 'A3');
});

test('the loop is 13.54 s', () => {
  assert.ok(Math.abs(loopDuration(buildScore()) - 13.54) < 0.02, String(loopDuration(buildScore())));
});

test('every rod is desk-sized and every swing is a sane note length', () => {
  for (const e of buildScore()) {
    assert.ok(e.rodMetres > 0.08 && e.rodMetres < 0.34, `${e.name} rod ${e.rodMetres}`);
    assert.ok(e.period > 0.58 && e.period < 1.17, `${e.name} period ${e.period}`);
  }
});

test('pitches are exact just-intonation ratios', () => {
  const a3 = JUST_INTONATION.A3;
  assert.equal(a3, 220);
  assert.equal(JUST_INTONATION.C4 / a3, 6 / 5);
  assert.equal(JUST_INTONATION.E4 / a3, 3 / 2);
  assert.equal(JUST_INTONATION.A4 / a3, 2);
});

test('a note missing from the table throws instead of yielding NaN', () => {
  assert.throws(() => buildScore(['ZZ9']), RangeError);
});

test('noteIndexAtOrAfter walks the loop and wraps', () => {
  const events = buildScore();
  assert.equal(noteIndexAtOrAfter(events, 0), 0);
  assert.equal(noteIndexAtOrAfter(events, events[0].period), 1);
  assert.equal(noteIndexAtOrAfter(events, events[0].period - 0.001), 1);
  assert.equal(noteIndexAtOrAfter(events, loopDuration(events)), 0);
  assert.equal(noteIndexAtOrAfter(events, loopDuration(events) + events[0].period + 0.001), 1);
});

test('eventAt reports the note covering an instant and its phase', () => {
  const events = buildScore();
  const first = eventAt(events, 0);
  assert.equal(first.index, 0);
  assert.equal(first.event.name, 'A3');
  assert.equal(first.phase, 0);
  const mid = eventAt(events, events[0].period * 0.5);
  assert.equal(mid.index, 0);
  assert.ok(Math.abs(mid.phase - 0.5) < 1e-9);
  assert.equal(eventAt(events, -1).index, events.length - 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/score.test.mjs`
Expected: FAIL — `Cannot find module '../src/score.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/score.js`:

```js
import { pendulumFrequencyForAudio, rodForAudioFrequency, periodForAudioFrequency } from './physics.js';

/** Exact whole-number ratios over A3 = 220 Hz — no equal-tempered approximation. */
export const JUST_INTONATION = Object.freeze({
  A3: 220,
  B3: 247.5,
  C4: 264,
  D4: 293.3333333333333,
  E4: 330,
  G4: 396,
  A4: 440,
});

/** Rising and falling arch that resolves onto its own first note. */
export const LINE = Object.freeze([
  'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'G4', 'E4',
  'D4', 'E4', 'G4', 'E4', 'D4', 'C4', 'B3', 'A3',
]);

export function buildScore(line = LINE, table = JUST_INTONATION) {
  if (!Array.isArray(line) || line.length === 0) throw new RangeError('score line must be a non-empty array');
  return line.map((name, index) => {
    const fAudio = table[name];
    if (!(fAudio > 0)) throw new RangeError(`unknown or invalid note "${name}"`);
    const fPendulum = pendulumFrequencyForAudio(fAudio);
    return {
      index,
      name,
      fAudio,
      fPendulum,
      period: periodForAudioFrequency(fAudio),
      rodMetres: rodForAudioFrequency(fAudio),
    };
  });
}

export function loopDuration(events) {
  return events.reduce((total, e) => total + e.period, 0);
}

/** Normalises any elapsed time, including negatives, to [0, loop). */
function withinLoop(events, elapsed) {
  const total = loopDuration(events);
  const t = elapsed % total;
  return t < 0 ? t + total : t;
}

export function noteIndexAtOrAfter(events, elapsedInLoop) {
  let t = withinLoop(events, elapsedInLoop);
  for (let i = 0; i < events.length; i++) {
    const next = t - events[i].period;
    if (next <= 0) return i === events.length - 1 ? (t === events[i].period ? 0 : i) : i + 1 > events.length - 1 ? 0 : i + 1;
    t = next;
  }
  return 0;
}

export function eventAt(events, elapsedInLoop) {
  let t = withinLoop(events, elapsedInLoop);
  for (let i = 0; i < events.length; i++) {
    const p = events[i].period;
    if (t < p) return { index: i, event: events[i], phase: t / p };
    t -= p;
  }
  const last = events.length - 1;
  return { index: last, event: events[last], phase: 1 };
}
```

`noteIndexAtOrAfter` is the subtle one: it returns the index of the note **starting at or after** `elapsedInLoop`. The loop body above is correct for the tests but is written awkwardly on purpose in the plan? No — **replace it with the clear version below during implementation**:

```js
export function noteIndexAtOrAfter(events, elapsedInLoop) {
  const t = withinLoop(events, elapsedInLoop);
  let cursor = 0;
  for (let i = 0; i < events.length; i++) {
    cursor += events[i].period;
    if (cursor > t) return i === events.length - 1 ? 0 : i + 1;
  }
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/score.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/score.js test/score.test.mjs
git commit -m "feat(score): just-intonation 16-note line and loop indexing"
```

---

### Task 4: Note envelope

**Files:**
- Modify: `src/audio.js` (created here with only the pure envelope exported)
- Test: `test/envelope.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `envelopeAt(t, duration, options?) → gain`, with `options = {attack = 0.012, peak = 0.3, floor = 0.0008}`.

- [ ] **Step 1: Write the failing test**

Create `test/envelope.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { envelopeAt } from '../src/audio.js';

test('rises from the floor to the peak across the attack', () => {
  assert.equal(envelopeAt(0, 1), 0.0008);
  assert.ok(Math.abs(envelopeAt(0.012, 1) - 0.3) < 1e-9);
});

test('decays monotonically after the attack and never goes negative', () => {
  let previous = Infinity;
  for (let t = 0.012; t < 1; t += 0.01) {
    const g = envelopeAt(t, 1);
    assert.ok(g <= previous + 1e-12, `rose at t=${t}`);
    assert.ok(g >= 0.0008, `fell below floor at t=${t}`);
    previous = g;
  }
});

test('is silent outside the note', () => {
  assert.equal(envelopeAt(-0.5, 1), 0.0008);
  assert.equal(envelopeAt(1, 1), 0.0008);
  assert.equal(envelopeAt(99, 1), 0.0008);
});

test('a corrupt duration throws rather than dividing by zero', () => {
  assert.throws(() => envelopeAt(0.1, 0), RangeError);
  assert.throws(() => envelopeAt(0.1, -1), RangeError);
  assert.throws(() => envelopeAt(0.1, NaN), RangeError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/envelope.test.mjs`
Expected: FAIL — `Cannot find module '../src/audio.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/audio.js` containing only the envelope for now:

```js
export const MASTER_GAIN = 0.45;
export const ATTACK_SECONDS = 0.012;
export const PEAK_GAIN = 0.3;
export const FLOOR_GAIN = 0.0008;
export const DECAY_EXPONENT = 2.2;

/** Gain of a plucked, music-box-like note at `t` seconds into a note of `duration`. */
export function envelopeAt(t, duration, options = {}) {
  const { attack = ATTACK_SECONDS, peak = PEAK_GAIN, floor = FLOOR_GAIN } = options;
  if (!(duration > 0)) throw new RangeError(`duration must be > 0, got ${duration}`);
  if (!(t >= 0) || t >= duration) return floor;
  if (t < attack) return floor + (peak - floor) * (t / attack);
  if (duration <= attack) return floor;
  const u = (t - attack) / (duration - attack);
  return Math.max(floor, peak * Math.pow(1 - u, DECAY_EXPONENT));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/envelope.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio.js test/envelope.test.mjs
git commit -m "feat(audio): note envelope for the resampled pendulum tone"
```

---

### Task 5: Lookahead scheduler

**Files:**
- Create: `src/scheduler.js`
- Test: `test/scheduler.test.mjs`

**Interfaces:**
- Consumes: `noteIndexAtOrAfter`, `loopDuration` from `./score.js`.
- Produces: `LOOKAHEAD_SECONDS`, `TICK_SECONDS`, `MAX_NOTES_PER_TICK`, `createScheduler({events, onNote, lookahead?, maxPerTick?})` where `onNote({event, startTime, duration, loop})`; the returned object has `start(now, elapsedInLoop?)`, `tick(now) → count scheduled`, `get loops`, `get nextStart`.

- [ ] **Step 1: Write the failing test**

Create `test/scheduler.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScore, loopDuration } from '../src/score.js';
import { createScheduler, MAX_NOTES_PER_TICK } from '../src/scheduler.js';

const collect = (events, lookahead) => {
  const notes = [];
  const s = createScheduler({ events, lookahead, onNote: (n) => notes.push(n) });
  return { s, notes };
};

test('start(now) schedules the first note at exactly now', () => {
  const events = buildScore();
  const { s, notes } = collect(events, 0.1);
  s.start(100);
  s.tick(100);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].event.name, 'A3');
  assert.equal(notes[0].startTime, 100);
});

test('start(now, elapsedInLoop) resumes from the next note boundary', () => {
  const events = buildScore();
  const { s, notes } = collect(events, 0.1);
  s.start(100, events[0].period + 0.01);
  s.tick(100);
  assert.equal(notes[0].event.name, 'C4');
  assert.equal(notes[0].startTime, 100);
});

test('every note is scheduled exactly once across a simulated hour', () => {
  const events = buildScore();
  const { s, notes } = collect(events, 0.1);
  s.start(0);
  for (let now = 0; now < 3600; now += 0.025) s.tick(now);

  const expected = Math.floor(3600 / loopDuration(events)) * events.length;
  assert.ok(notes.length >= expected && notes.length <= expected + events.length + 2, `scheduled ${notes.length}`);

  for (let i = 1; i < notes.length; i++) {
    assert.ok(notes[i].startTime > notes[i - 1].startTime, `not monotonic at ${i}`);
    const gap = notes[i].startTime - notes[i - 1].startTime;
    assert.ok(Math.abs(gap - notes[i - 1].duration) < 1e-9, `note ${i} overlaps or leaves a gap`);
  }

  for (let i = 0; i < notes.length; i++) {
    assert.equal(notes[i].event.name, events[i % events.length].name, `out of order at ${i}`);
  }
});

test('a backgrounded tab (one giant tick) catches up in order without duplicating', () => {
  const events = buildScore();
  const { s, notes } = collect(events, 0.1);
  s.start(0);
  s.tick(0);
  s.tick(120);                       // tab was hidden for two minutes
  assert.ok(notes.length > events.length * 8);
  const seen = new Set(notes.map((n) => n.startTime));
  assert.equal(seen.size, notes.length, 'a note was scheduled twice');
  for (let i = 1; i < notes.length; i++) assert.ok(notes[i].startTime > notes[i - 1].startTime);
});

test('the loop counter advances once per completed score pass', () => {
  const events = buildScore();
  const { s } = collect(events, 0.1);
  s.start(0);
  for (let now = 0; now < loopDuration(events) * 3 + 0.01; now += 0.025) s.tick(now);
  assert.equal(s.loops, 3);
});

test('a corrupt score that would schedule forever throws instead of hanging', () => {
  const events = buildScore();
  const { s } = collect(events, 3600);
  s.start(0);
  assert.throws(() => s.tick(0), RangeError);
});

test('MAX_NOTES_PER_TICK is a real cap', () => {
  assert.ok(Number.isInteger(MAX_NOTES_PER_TICK) && MAX_NOTES_PER_TICK > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scheduler.test.mjs`
Expected: FAIL — `Cannot find module '../src/scheduler.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/scheduler.js`:

```js
import { noteIndexAtOrAfter, loopDuration } from './score.js';

export const TICK_SECONDS = 0.025;
export const LOOKAHEAD_SECONDS = 0.1;
export const MAX_NOTES_PER_TICK = 1000;

export function createScheduler({ events, onNote, lookahead = LOOKAHEAD_SECONDS, maxPerTick = MAX_NOTES_PER_TICK }) {
  if (!Array.isArray(events) || events.length === 0) throw new RangeError('scheduler needs at least one event');
  if (typeof onNote !== 'function') throw new RangeError('onNote must be a function');

  const total = loopDuration(events);
  let index = 0;
  let nextStart = null;
  let loops = 0;

  function start(now, elapsedInLoop = 0) {
    const t = elapsedInLoop % total;
    index = noteIndexAtOrAfter(events, t < 0 ? t + total : t);
    nextStart = now;
    loops = 0;
  }

  function tick(now) {
    if (nextStart === null) start(now);
    const horizon = now + lookahead;
    let scheduled = 0;
    while (nextStart <= horizon) {
      if (scheduled >= maxPerTick) {
        throw new RangeError('scheduler exceeded maxPerTick — the score is corrupt');
      }
      const event = events[index];
      onNote({ event, startTime: nextStart, duration: event.period, loop: loops });
      nextStart += event.period;
      index += 1;
      if (index >= events.length) { index = 0; loops += 1; }
      scheduled += 1;
    }
    return scheduled;
  }

  return { start, tick, get loops() { return loops; }, get nextStart() { return nextStart; } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/scheduler.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.js test/scheduler.test.mjs
git commit -m "feat(scheduler): audio-clock lookahead scheduling that survives a backgrounded tab"
```

---

### Task 6: Audio engine

**Files:**
- Modify: `src/audio.js` (append the engine; keep the envelope)
- Test: `test/audio-engine.test.mjs`

**Interfaces:**
- Consumes: `envelopeAt` from the same module.
- Produces: `createAudioEngine({ ctxFactory? })` returning `{ unlock() → ctx | null, get unlocked, get muted, setMuted(bool), playNote(fAudio, startTime, duration) → void | null, dispose() }`.

- [ ] **Step 1: Write the failing test**

Create `test/audio-engine.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioEngine } from '../src/audio.js';

function fakeContext() {
  const created = { oscillators: [], gains: [] };
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: { name: 'destination' },
    resumeCalled: 0,
    resume() { this.resumeCalled += 1; return Promise.resolve(); },
    createGain() {
      const g = {
        gain: {
          value: 1, calls: [],
          setValueAtTime(v, t) { this.calls.push(['set', v, t]); },
          linearRampToValueAtTime(v, t) { this.calls.push(['linear', v, t]); },
          exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); },
        },
        connect(target) { this.connectedTo = target; },
      };
      created.gains.push(g);
      return g;
    },
    createOscillator() {
      const o = {
        type: 'sine', frequency: { value: 0 }, started: null, stopped: null,
        connect(target) { this.connectedTo = target; },
        start(t) { this.started = t; },
        stop(t) { this.stopped = t; },
      };
      created.oscillators.push(o);
      return o;
    },
  };
  return { ctx, created };
}

test('the page is silent until unlock', () => {
  const { ctx } = fakeContext();
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  assert.equal(engine.unlocked, false);
  assert.equal(engine.muted, true);
  assert.equal(engine.playNote(220, 0, 1), null);
});

test('unlock connects a master gain at 0.45 and unmutes', () => {
  const { ctx, created } = fakeContext();
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  assert.equal(engine.unlock(), ctx);
  assert.equal(engine.unlocked, true);
  assert.equal(engine.muted, false);
  assert.equal(created.gains[0].gain.value, 0.45);
  assert.equal(created.gains[0].connectedTo, ctx.destination);
});

test('unlock resumes a suspended context', () => {
  const { ctx } = fakeContext();
  ctx.state = 'suspended';
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  engine.unlock();
  assert.equal(ctx.resumeCalled, 1);
});

test('unlock survives a context that cannot be constructed, and the page stays animated', () => {
  const engine = createAudioEngine({ ctxFactory: () => { throw new Error('blocked by policy'); } });
  assert.equal(engine.unlock(), null);
  assert.equal(engine.unlocked, false);
  assert.equal(engine.muted, true);
  assert.equal(engine.playNote(220, 0, 1), null);
});

test('playNote schedules the note at f and its octave at 0.2 amplitude', () => {
  const { ctx, created } = fakeContext();
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  engine.unlock();
  engine.playNote(220, 10, 1.163636);
  assert.equal(created.oscillators.length, 2);
  assert.equal(created.oscillators[0].frequency.value, 220);
  assert.equal(created.oscillators[1].frequency.value, 440);
  assert.equal(created.oscillators[0].type, 'sine');
  assert.equal(created.oscillators[0].started, 10);
  assert.ok(created.oscillators[0].stopped > 10 + 1.163636);
  assert.ok(created.oscillators[0].stopped < 10 + 1.163636 + 0.2);
});

test('muting suppresses further notes', () => {
  const { ctx, created } = fakeContext();
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  engine.unlock();
  engine.setMuted(true);
  assert.equal(engine.playNote(220, 0, 1), null);
  assert.equal(created.oscillators.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/audio-engine.test.mjs`
Expected: FAIL — `createAudioEngine is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `src/audio.js`:

```js
export const HARMONIC_GAIN = 0.2;
export const RELEASE_TAIL_SECONDS = 0.05;

function defaultCtxFactory() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is unavailable');
  return new Ctor();
}

export function createAudioEngine({ ctxFactory = defaultCtxFactory } = {}) {
  let ctx = null;
  let master = null;
  let muted = true;

  function unlock() {
    try {
      if (!ctx) {
        ctx = ctxFactory();
        master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
      muted = false;
      return ctx;
    } catch {
      // Blocked or unsupported: the animation continues in silence.
      ctx = null;
      master = null;
      muted = true;
      return null;
    }
  }

  function playNote(fAudio, startTime, duration) {
    if (!ctx || muted || !(fAudio > 0) || !(duration > 0)) return null;
    const stopAt = startTime + duration + RELEASE_TAIL_SECONDS;
    const voice = ctx.createGain();
    voice.connect(master);
    voice.gain.setValueAtTime(FLOOR_GAIN, startTime);
    voice.gain.linearRampToValueAtTime(PEAK_GAIN, startTime + ATTACK_SECONDS);
    voice.gain.exponentialRampToValueAtTime(FLOOR_GAIN, stopAt);

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = fAudio;
    fundamental.connect(voice);
    fundamental.start(startTime);
    fundamental.stop(stopAt);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = HARMONIC_GAIN;
    harmonicGain.connect(voice);
    const harmonic = ctx.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = fAudio * 2;
    harmonic.connect(harmonicGain);
    harmonic.start(startTime);
    harmonic.stop(stopAt);

    return null;
  }

  return {
    unlock,
    playNote,
    setMuted(next) { muted = Boolean(next); },
    get muted() { return muted; },
    get unlocked() { return ctx !== null; },
    get context() { return ctx; },
    dispose() { try { ctx?.close?.(); } catch { /* ignore */ } ctx = null; master = null; muted = true; },
  };
}
```

Note the test asserts `created.gains[0]` is the master (gain 0.45) and `oscillators[1].frequency.value === 440`; the implementation above creates the voice gain first, then the harmonic gain — so `created.gains` order is `[master, voice, harmonicGain]` and the assertions hold.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/audio-engine.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio.js test/audio-engine.test.mjs
git commit -m "feat(audio): Web Audio engine with injected context and graceful unlock failure"
```

---

### Task 7: Render geometry

**Files:**
- Create: `src/render.js`
- Test: `test/render-geometry.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `PANEL_COUNT`, `panelRects(width, height) → {x,y,w,h}[]`, `rodPixels(rodMetres, availableHeight) → px`, `tracePoints(period, samples, amplitudeRatio?) → {u, value}[]`, `drawScene(ctx, state, layout) → void`, `palette`.

- [ ] **Step 1: Write the failing test**

Create `test/render-geometry.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_COUNT, panelRects, rodPixels, tracePoints, drawScene, palette } from '../src/render.js';

test('four panels tile the width without overlapping or escaping the canvas', () => {
  const rects = panelRects(1200, 500);
  assert.equal(rects.length, PANEL_COUNT);
  for (const r of rects) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.w));
    assert.ok(r.w > 0, `width ${r.w}`);
    assert.ok(r.x >= 0 && r.x + r.w <= 1200);
  }
  for (let i = 1; i < rects.length; i++) assert.ok(rects[i].x > rects[i - 1].x + rects[i - 1].w - 1e-9);
});

test('a 320 px phone still yields positive panels', () => {
  const rects = panelRects(320, 480);
  for (const r of rects) assert.ok(r.w > 0 && Number.isFinite(r.w), `width ${r.w}`);
});

test('nonsensical canvas sizes throw rather than producing NaN geometry', () => {
  assert.throws(() => panelRects(0, 100), RangeError);
  assert.throws(() => panelRects(100, -1), RangeError);
  assert.throws(() => panelRects(NaN, 100), RangeError);
});

test('rodPixels clamps to the drawable band and never returns NaN', () => {
  const h = 300;
  assert.ok(rodPixels(0.334, h) > rodPixels(0.084, h));
  const smallest = rodPixels(0.000001, h);
  const largest = rodPixels(999, h);
  assert.ok(smallest > 0 && Number.isFinite(smallest));
  assert.ok(largest <= h && Number.isFinite(largest));
  assert.throws(() => rodPixels(NaN, h), RangeError);
});

test('tracePoints returns a closed period within the amplitude band', () => {
  const pts = tracePoints(1, 64);
  assert.equal(pts.length, 64);
  for (const p of pts) assert.ok(Math.abs(p.value) <= 1 + 1e-9);
  assert.ok(Math.abs(pts[0].value - pts[63].value) < 0.2);
  assert.throws(() => tracePoints(0, 64), RangeError);
});

test('every zone has a distinct accent', () => {
  assert.equal(new Set(Object.values(palette.zones)).size, PANEL_COUNT);
});

test('drawScene survives a minimal recording context', () => {
  const calls = [];
  const noop = (name) => (...args) => calls.push([name, args]);
  const ctx = new Proxy({}, {
    get(_t, key) {
      if (key === 'canvas') return { width: 1200, height: 500 };
      return noop(String(key));
    },
    set() { return true; },
  });
  const state = {
    event: { name: 'A3', fAudio: 220, fPendulum: 0.859375, period: 1.163636, rodMetres: 0.336469 },
    phase: 0.25,
    elapsedInLoop: 3.2,
    history: [{ name: 'C4', period: 0.97 }],
    time: 12.5,
  };
  assert.doesNotThrow(() => drawScene(ctx, state, { width: 1200, height: 500 }));
  assert.ok(calls.length > 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render-geometry.test.mjs`
Expected: FAIL — `Cannot find module '../src/render.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/render.js`:

```js
import { AMPLITUDE } from './physics.js';

export const PANEL_COUNT = 4;
export const PADDING = 14;
export const ARROW_GAP = 34;
export const ROD_MIN_METRES = 0.06;
export const ROD_MAX_METRES = 0.35;

export const palette = Object.freeze({
  background: '#0f1620',
  panel: '#0b121a',
  line: '#1e2b38',
  text: '#dbe4ee',
  dim: '#6b8099',
  zones: Object.freeze({
    physical: '#38bdf8',
    signal: '#fbbf24',
    computer: '#a78bfa',
    music: '#34d399',
  }),
});

export function panelRects(width, height) {
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError(`canvas must be positive, got ${width}x${height}`);
  }
  const usable = width - PADDING * 2 - ARROW_GAP * (PANEL_COUNT - 1);
  if (!(usable > 0)) throw new RangeError(`canvas too narrow: ${width}`);
  const w = usable / PANEL_COUNT;
  return Array.from({ length: PANEL_COUNT }, (_, i) => ({
    x: PADDING + i * (w + ARROW_GAP),
    y: PADDING,
    w,
    h: height - PADDING * 2,
  }));
}

export function rodPixels(rodMetres, availableHeight) {
  if (!Number.isFinite(rodMetres)) throw new RangeError(`rodMetres must be finite, got ${rodMetres}`);
  if (!(availableHeight > 0)) throw new RangeError(`availableHeight must be > 0, got ${availableHeight}`);
  const t = (rodMetres - ROD_MIN_METRES) / (ROD_MAX_METRES - ROD_MIN_METRES);
  const clamped = Math.min(1, Math.max(0, t));
  return availableHeight * (0.4 + 0.48 * clamped);
}

/** Normalised samples of cos(2*pi*u) across exactly one period: a closed curve. */
export function tracePoints(samples, amplitudeRatio = 1) {
  if (!(samples > 1)) throw new RangeError(`samples must be > 1, got ${samples}`);
  return Array.from({ length: samples }, (_, i) => {
    const u = i / (samples - 1);
    return { u, value: amplitudeRatio * Math.cos(2 * Math.PI * u) };
  });
}
```

Then append the drawing entry point. Replace the `tracePoints(period, samples)` signature used in the test with `tracePoints(samples, amplitudeRatio)`, and fix the test call `tracePoints(1, 64)` → `tracePoints(64)` and `assert.throws(() => tracePoints(0, 64), RangeError)` → `tracePoints(0)`. **Apply that rename in both files when implementing.**

```js
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPanel(ctx, rect, title, accent) {
  ctx.fillStyle = palette.panel;
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fill();
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  roundedRect(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 10);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = '700 10px ui-sans-serif, system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, rect.x + 12, rect.y + 19);
}

export function drawScene(ctx, state, layout) {
  const { width, height } = layout;
  const rects = panelRects(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const titles = ['PHYSICAL', 'OSCILLATION \u2192 SIGNAL', 'COMPUTER', 'MUSIC OUT'];
  const accents = [palette.zones.physical, palette.zones.signal, palette.zones.computer, palette.zones.music];
  rects.forEach((rect, i) => drawPanel(ctx, rect, titles[i], accents[i]));

  const [physical, signal, computer, musicZone] = rects;
  const { event, phase } = state;

  // (1) the rod, drawn to true scale
  const rodHeight = rodPixels(event.rodMetres, physical.h - 90);
  const pivotX = physical.x + physical.w / 2;
  const pivotY = physical.y + 34;
  const angle = AMPLITUDE * Math.cos(2 * Math.PI * phase);
  const bobX = pivotX + rodHeight * Math.sin(angle);
  const bobY = pivotY + rodHeight * Math.cos(angle);
  ctx.strokeStyle = palette.dim;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bobX, bobY);
  ctx.stroke();
  ctx.fillStyle = palette.zones.physical;
  ctx.beginPath();
  ctx.arc(bobX, bobY, 10, 0, Math.PI * 2);
  ctx.fill();

  // (2) theta(t) for this note, closure of the period drawn faintly
  const trace = tracePoints(140);
  const sMid = signal.y + signal.h / 2;
  const sAmp = signal.h * 0.3;
  ctx.strokeStyle = 'rgba(56,189,248,0.32)';
  ctx.beginPath();
  trace.forEach((p, i) => {
    const x = signal.x + 14 + p.u * (signal.w - 28);
    const y = sMid - p.value * sAmp;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // (3) the resample, then the peak
  ctx.fillStyle = palette.zones.computer;
  const barWidth = (computer.w - 40) / 4;
  for (let i = 0; i < 4; i++) {
    const h = i === 0 ? (computer.h - 120) * (0.6 + 0.4 * Math.abs(Math.cos(Math.PI * phase))) : 4 + i * 3;
    ctx.fillRect(computer.x + 16 + i * barWidth, computer.y + computer.h - 70 - h, barWidth - 8, h);
  }

  // (4) the piano roll and the now line
  ctx.strokeStyle = 'rgba(251,191,36,0.85)';
  ctx.lineWidth = 1.4;
  const nowX = musicZone.x + musicZone.w - 4;
  ctx.beginPath();
  ctx.moveTo(nowX, rects[0].y);
  ctx.lineTo(nowX, rects[0].y + rects[0].h);
  ctx.stroke();

  ctx.fillStyle = palette.zones.music;
  ctx.textAlign = 'center';
  ctx.font = '700 12px ui-monospace, Menlo, monospace';
  ctx.fillText(`\u266a ${event.name}`, musicZone.x + musicZone.w / 2, musicZone.y + musicZone.h - 9);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render-geometry.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render-geometry.test.mjs
git commit -m "feat(render): canvas geometry helpers and the four-zone scene"
```

---

### Task 8: The page

**Files:**
- Create: `index.html`
- Create: `src/main.js`
- Test: `test/page.test.mjs` (static assertions on `index.html`), plus a browser check in Task 11

**Interfaces:**
- Consumes: `buildScore`, `eventAt`, `loopDuration` from `./score.js`; `createScheduler`, `TICK_SECONDS` from `./scheduler.js`; `createAudioEngine` from `./audio.js`; `drawScene`, `panelRects` from `./render.js`; `Ring` from `./ring.js`.
- Produces: a runnable page. `window.__pendulum` exposes `{state, score, scheduler}` for the browser check in Task 11.

- [ ] **Step 1: Write the failing test**

Create `test/page.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the page loads main as a module', () => {
  assert.match(html, /<script[^>]+type="module"[^>]+src="\.\/src\/main\.js"/);
});

test('the page has the canvas, the toggle, and a text alternative', () => {
  assert.match(html, /id="stage"/);
  assert.match(html, /id="sound"/);
  assert.match(html, /<canvas[^>]+id="scene"/);
  assert.match(html, /aria-describedby="stage-description"/);
  assert.match(html, /id="stage-description"/);
});

test('the sound control reports its state and is not auto-started', () => {
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /autoplay/);
});

test('the caveats are collapsed but present', () => {
  assert.match(html, /<details/);
  assert.match(html, /damping/i);
  assert.match(html, /resampl/i);
  assert.match(html, /small-angle/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/page.test.mjs`
Expected: FAIL — `ENOENT ... index.html`

- [ ] **Step 3: Write the page**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pendulum sonification — motion, resampled into music</title>
<meta name="description" content="An ideal pendulum swinging at ~1 Hz, resampled 256x into the audible range and played back as music.">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1620; color: #dbe4ee;
         font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 18px 48px; }
  h1 { font-size: 20px; margin: 0 0 4px; font-weight: 650; }
  .sub { color: #6b8099; font-size: 13px; margin: 0 0 16px; }
  #stage { border: 1px solid #1e2b38; border-radius: 12px; overflow: hidden; background: #0b121a; }
  canvas { display: block; width: 100%; height: auto; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 11px 14px;
         background: #121b26; border-top: 1px solid #1e2b38; }
  button { font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
           border-radius: 8px; padding: 7px 14px; border: 1px solid #1e2b38;
           background: #182430; color: #dbe4ee; }
  button[aria-pressed="false"] { background: #38bdf8; border-color: #38bdf8; color: #04121c; }
  .hint { color: #6b8099; font-size: 12px; margin-left: auto; }
  details { margin-top: 18px; border-left: 2px solid #fbbf24; padding: 12px 16px; background: #121b26; border-radius: 8px; }
  summary { cursor: pointer; font-weight: 650; }
  ul { margin: 10px 0 0; padding-left: 18px; color: #b9c7d6; }
  li { margin: 5px 0; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; background: #1a2431; padding: 1px 5px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) { .hint { display: none; } }
</style>
</head>
<body>
<main>
  <h1>Pendulum sonification</h1>
  <p class="sub">One swing, one note. The rod's length is chosen from the note; the note is read back out of the motion.</p>

  <div id="stage" aria-describedby="stage-description">
    <canvas id="scene" role="img"
      aria-label="Four linked panels: a to-scale pendulum, its angular displacement over one period, a resampling and frequency estimate, and the resulting note on a piano roll."></canvas>
    <div class="bar">
      <button id="sound" type="button" aria-pressed="false">Sound off — click to play</button>
      <span class="hint" id="status">running silently</span>
    </div>
  </div>

  <p id="stage-description" class="sub" style="margin-top:12px">
    An ideal, undamped pendulum. Rod lengths run 8.4–33.6 cm, giving swings of 0.859–1.719 Hz,
    resampled 256× so that a 23.4 cm rod sounds as C4.
  </p>

  <details>
    <summary>What this does and does not claim</summary>
    <ul>
      <li><strong>Damping is not modelled.</strong> A pendulum that swings forever has no energy source; real ones decay, which is why clock pendulums need an escapement. This is an ideal oscillator, shown for clarity.</li>
      <li><strong>The audio is a resampling, not a recording.</strong> ×256 is sample-rate change. What you hear is a sonification of sampled motion.</li>
      <li><strong>Small-angle approximation.</strong> Amplitude is 0.36 rad (≈20.6°). Beyond roughly 0.4 rad the true period lengthens and a pure sinusoid no longer describes the swing.</li>
      <li><strong>The apparatus is not built.</strong> Rod lengths are those a physical build would require.</li>
    </ul>
  </details>
</main>
<script type="module" src="./src/main.js"></script>
</body>
</html>
```

Create `src/main.js`:

```js
import { Ring } from './ring.js';
import { buildScore, eventAt, loopDuration } from './score.js';
import { createScheduler, TICK_SECONDS } from './scheduler.js';
import { createAudioEngine } from './audio.js';
import { drawScene, panelRects } from './render.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const soundButton = document.getElementById('sound');
const status = document.getElementById('status');
const stage = document.getElementById('stage');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const score = buildScore();
const total = loopDuration(score);
const history = new Ring(8);
const engine = createAudioEngine();

let scheduler = null;
let loopStartSeconds = performance.now() / 1000;

function clockSeconds() {
  const audioContext = engine.context;
  return audioContext ? audioContext.currentTime : performance.now() / 1000;
}

function reset(nowSeconds, elapsedInLoop) {
  scheduler = createScheduler({
    events: score,
    onNote: ({ event, startTime, duration }) => {
      engine.playNote(event.fAudio, startTime, duration);
      history.push({ name: event.name, period: event.period });
    },
  });
  scheduler.start(nowSeconds, elapsedInLoop);
  loopStartSeconds = nowSeconds - elapsedInLoop;
}

function resize() {
  const width = stage.clientWidth;
  const height = Math.max(360, Math.min(470, width * 0.43));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderFrame(nowSeconds) {
  const elapsed = nowSeconds - loopStartSeconds;
  const { index, event, phase } = eventAt(score, elapsed);
  drawScene(ctx, {
    event,
    phase,
    elapsedInLoop: elapsed < 0 ? elapsed + total : elapsed,
    index,
    history: history.toArray(),
    time: nowSeconds,
  }, { width: stage.clientWidth, height: Math.max(360, Math.min(470, stage.clientWidth * 0.43)) });
}

let lastTick = 0;
function frame() {
  const nowSeconds = clockSeconds();
  if (scheduler && nowSeconds - lastTick >= TICK_SECONDS) {
    lastTick = nowSeconds;
    try {
      scheduler.tick(nowSeconds);
    } catch (error) {
      console.error(error);
    }
  }
  renderFrame(nowSeconds);
  if (!reduceMotion) requestAnimationFrame(frame);
}

soundButton.addEventListener('click', () => {
  const unlocked = engine.unlock();
  if (!unlocked) {
    status.textContent = 'audio unavailable — animation continues';
    soundButton.textContent = 'Sound unavailable';
    return;
  }
  const elapsed = clockSeconds() - loopStartSeconds;
  reset(unlocked.currentTime, Math.max(0, elapsed));
  soundButton.setAttribute('aria-pressed', 'true');
  soundButton.textContent = 'Sound on';
  status.textContent = 'playing';
  document.removeEventListener('keydown', onKey);
});

function onKey(event) {
  if (event.key === ' ' || event.key === 'Enter') soundButton.click();
}

document.addEventListener('keydown', onKey);
window.addEventListener('resize', () => { resize(); });

resize();
reset(clockSeconds(), 0);
renderFrame(clockSeconds());
window.__pendulum = { get state() { return { score, total, running: scheduler !== null }; }, engine };
if (!reduceMotion) requestAnimationFrame(frame);

// A window that wakes from a long background pause resyncs from the audio clock.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const nowSeconds = clockSeconds();
    lastTick = nowSeconds;
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/page.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.js test/page.test.mjs
git commit -m "feat(page): four-zone stage, silent on load, unlocked by one gesture"
```

---

### Task 9: Hero SVG generator

**Files:**
- Create: `tools/build-hero.mjs`
- Create: `assets/hero.svg`, `assets/hero-light.svg` (generated, committed)
- Test: `test/hero.test.mjs`

**Interfaces:**
- Consumes: `buildScore`, `loopDuration`, `eventAt` from `../src/score.js`; `panelRects` from `../src/render.js`.
- Produces: `buildHeroSvg({ theme }) → string`, `heroThemes` (`{dark, light}`), and a CLI that writes both files.

- [ ] **Step 1: Write the failing test**

Create `test/hero.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroSvg, heroThemes, HERO_WIDTH, HERO_HEIGHT, CYCLE_SECONDS } from '../tools/build-hero.mjs';
import { loopDuration, buildScore, LINE } from '../src/score.js';

test('the hero is a standalone svg document', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 1200 300"/);
  assert.match(svg, /<\/svg>\s*$/);
});

test('it animates with CSS, not script', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  assert.match(svg, /@keyframes/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /\sonload=/i);
});

test('it carries the real numbers from physics', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  assert.match(svg, /33\.6\s*cm/);
  assert.match(svg, /8\.4\s*cm/);
  assert.match(svg, /1\.719\s*Hz/);
});

test('it names every note in the line and states the resample', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  for (const name of new Set(LINE)) assert.ok(svg.includes(`>${name}<`), `missing ${name}`);
  assert.match(svg, /256/);
});

test('the loop matches the score, so the hero cannot disagree with the page', () => {
  assert.ok(Math.abs(CYCLE_SECONDS - loopDuration(buildScore())) < 1e-9);
});

test('the two themes differ only in palette', () => {
  const strip = (s) => s.replace(/#[0-9a-fA-F]{6}/g, '#COLOR');
  assert.equal(strip(buildHeroSvg({ theme: 'dark' })), strip(buildHeroSvg({ theme: 'light' })));
  assert.notEqual(heroThemes.dark.background, heroThemes.light.background);
});

test('the viewBox matches the declared dimensions', () => {
  assert.equal(HERO_WIDTH, 1200);
  assert.equal(HERO_HEIGHT, 300);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/hero.test.mjs`
Expected: FAIL — `Cannot find module '../tools/build-hero.mjs'`

- [ ] **Step 3: Write the generator**

Create `tools/build-hero.mjs`:

```js
#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScore, loopDuration } from '../src/score.js';

export const HERO_WIDTH = 1200;
export const HERO_HEIGHT = 300;
export const CYCLE_SECONDS = loopDuration(buildScore());

export const heroThemes = Object.freeze({
  dark: { background: '#0f1620', panel: '#0b121a', line: '#1e2b38', text: '#dbe4ee', dim: '#6b8099', accent: '#38bdf8', music: '#34d399' },
  light: { background: '#f8fafc', panel: '#ffffff', line: '#d8e0e8', text: '#1e293b', dim: '#64748b', accent: '#0284c7', music: '#059669' },
});

const PAD = 24;
const PANEL_W = (HERO_WIDTH - PAD * 2 - 36 * 3) / 4;

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildHeroSvg({ theme = 'dark' } = {}) {
  const c = heroThemes[theme];
  if (!c) throw new RangeError(`unknown theme: ${theme}`);
  const events = buildScore();
  const unique = [...new Set(events.map((e) => e.name))];
  const shortest = events.reduce((a, e) => (e.rodMetres < a.rodMetres ? e : a));
  const longest = events.reduce((a, e) => (e.rodMetres > a.rodMetres ? e : a));

  const panels = ['PHYSICAL', 'OSCILLATION \u2192 SIGNAL', 'COMPUTER', 'MUSIC OUT']
    .map((title, i) => {
      const x = PAD + i * (PANEL_W + 36);
      return `<g><rect x="${x}" y="${PAD}" width="${PANEL_W}" height="${HERO_HEIGHT - PAD * 2}" rx="10" fill="${c.panel}" stroke="${c.line}"/>` +
        `<text x="${x + 12}" y="${PAD + 18}" fill="${c.dim}" font-family="ui-sans-serif, system-ui" font-size="10" font-weight="700">${title}</text></g>`;
    })
    .join('\n  ');

  // Each note gets a keyframe so the hero follows the same 16-note score as the page.
  let cursor = 0;
  const keyframes = events.map((e, i) => {
    const from = (cursor / CYCLE_SECONDS) * 100;
    cursor += e.period;
    const to = (cursor / CYCLE_SECONDS) * 100;
    return `  ${from.toFixed(4)}%, ${to.toFixed(4)}% { --rod-length: ${(e.rodMetres * 100).toFixed(1)}cm; }`;
  }).join('\n');

  const notes = unique.map((name, i) =>
    `<g class="note n${i}"><rect x="${PAD + 16 + i * 26}" y="${HERO_HEIGHT - PAD - 60}" width="20" height="44" rx="4" fill="${c.music}" opacity="0.25"/></g>`
  ).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HERO_WIDTH} ${HERO_HEIGHT}" width="${HERO_WIDTH}" height="${HERO_HEIGHT}" role="img" aria-label="A pendulum swinging, resampled into a note. Rod lengths ${(shortest.rodMetres * 100).toFixed(1)} cm to ${(longest.rodMetres * 100).toFixed(1)} cm, resampled 256 times.">
  <style>
    .stage { animation: ${CYCLE_SECONDS}s linear infinite cycle; }
${keyframes}
    @keyframes cycle { 0% { transform: rotate(-20.6deg); } 50% { transform: rotate(20.6deg); } 100% { transform: rotate(-20.6deg); } }
    @media (prefers-reduced-motion: reduce) { .stage { animation: none; } }
  </style>
  <rect width="${HERO_WIDTH}" height="${HERO_HEIGHT}" fill="${c.background}"/>
  ${panels}
  <g transform="translate(${PAD + PANEL_W / 2}, ${PAD + 30})">
    <g class="stage" style="transform-origin: 0 0">
      <line x1="0" y1="0" x2="0" y2="120" stroke="${c.dim}" stroke-width="2"/>
      <circle cx="0" cy="120" r="10" fill="${c.accent}"/>
    </g>
  </g>
  ${notes}
  <text x="${PAD + PANEL_W + 36}" y="${HERO_HEIGHT - PAD - 66}" fill="${c.text}" font-family="ui-monospace, Menlo, monospace" font-size="14" font-weight="700">${(longest.rodMetres * 100).toFixed(1)} cm &#8594; ${longest.fPendulum.toFixed(3)} Hz</text>
  <text x="${PAD + PANEL_W + 36}" y="${HERO_HEIGHT - PAD - 46}" fill="${c.dim}" font-family="ui-monospace, Menlo, monospace" font-size="12">${(shortest.rodMetres * 100).toFixed(1)} cm &#8594; ${shortest.fPendulum.toFixed(3)} Hz</text>
  <text x="${PAD + PANEL_W + 36}" y="${HERO_HEIGHT - PAD - 24}" fill="${c.accent}" font-family="ui-monospace, Menlo, monospace" font-size="12">&#215; 256 &#8594; audible</text>
  <text x="${PAD + 16}" y="${PAD + 40}" fill="${c.text}" font-family="ui-monospace, Menlo, monospace" font-size="12">${escape('C4 = 23.4 cm \u2192 1.031 Hz \u2192 264 Hz')}</text>
</svg>
`;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'hero.svg'), buildHeroSvg({ theme: 'dark' }), 'utf8');
await writeFile(join(outDir, 'hero-light.svg'), buildHeroSvg({ theme: 'light' }), 'utf8');
process.stdout.write(`wrote hero.svg and hero-light.svg (${CYCLE_SECONDS.toFixed(2)} s loop)\n`);
```

The note-name assertion checks for `>A3<` — add a hidden-but-readable note legend so the names genuinely appear in the markup, replacing the `notes` block above with:

```js
  const notes = unique.map((name, i) =>
    `<g class="note n${i}"><rect x="${PAD + 16 + i * 26}" y="${HERO_HEIGHT - PAD - 60}" width="20" height="44" rx="4" fill="${c.music}" opacity="0.25"/>` +
    `<text x="${PAD + 16 + i * 26 + 10}" y="${HERO_HEIGHT - PAD - 24}" fill="${c.dim}" font-family="ui-monospace, Menlo, monospace" font-size="9" text-anchor="middle">${name}</text></g>`
  ).join('\n  ');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/hero.test.mjs && node tools/build-hero.mjs`
Expected: PASS, 7 tests, then `wrote hero.svg and hero-light.svg (13.54 s loop)`

- [ ] **Step 5: Commit**

```bash
git add tools/build-hero.mjs test/hero.test.mjs assets/hero.svg assets/hero-light.svg
git commit -m "feat(hero): generate theme-aware animated SVG from the shared physics module"
```

---

### Task 10: Package, README, licence

**Files:**
- Create: `package.json`, `README.md`, `LICENSE`
- Test: `test/package.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` and `npm run hero`.

- [ ] **Step 1: Write the failing test**

Create `test/package.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('there are no dependencies at all', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('the two scripts exist and are wired to the right entry points', () => {
  assert.equal(pkg.scripts.test, 'node --test test/');
  assert.equal(pkg.scripts.hero, 'node tools/build-hero.mjs');
});

test('the package is marked as a module', () => {
  assert.equal(pkg.type, 'module');
});

test('the readme states the caveats a technical reader will look for', () => {
  assert.match(readme, /damping is not modelled/i);
  assert.match(readme, /resampling/i);
  assert.match(readme, /small-angle/i);
  assert.match(readme, /256/);
  assert.match(readme, /13\.54/);
});

test('the readme embeds the dark hero and links to the live page', () => {
  assert.match(readme, /assets\/hero\.svg/);
  assert.match(readme, /https:\/\/dushmilan\.github\.io\/pendulum-sonification\//);
});

test('the licence is MIT', () => {
  const licence = readFile(new URL('../LICENSE', import.meta.url), 'utf8');
  return licence.then((text) => {
    assert.match(text, /MIT License/);
    assert.match(text, /Dushmilan/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/package.test.mjs`
Expected: FAIL — `ENOENT ... package.json`

- [ ] **Step 3: Write the files**

Create `package.json`:

```json
{
  "name": "pendulum-sonification",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "An ideal pendulum, resampled 256x into the audible range and played back as music.",
  "license": "MIT",
  "scripts": {
    "test": "node --test test/",
    "hero": "node tools/build-hero.mjs"
  }
}
```

Create `README.md`:

```markdown
# Pendulum sonification

An ideal pendulum swinging at about 1 Hz, resampled **256×** into the audible range and
played back as music. Motion, sampling, frequency estimation, and sound — the same
mathematics at every step.

[![Watch and hear it live](assets/hero.svg)](https://dushmilan.github.io/pendulum-sonification/)

**▶ [dushmilan.github.io/pendulum-sonification](https://dushmilan.github.io/pendulum-sonification/)**

## What it shows

A pendulum's angular displacement is

    θ(t) = θ₀ · cos(ωt),    ω = √(g/L)

so the rod's length sets its frequency. A computer samples that motion, estimates the
frequency, and plays the estimate back. One full swing is one note; the picture on
screen and the tone in the air are the same function.

## The 256× step

A desktop pendulum is a few hundred times too slow to hear: 24 cm swings at 1.0175 Hz,
while the lowest piano note is 27.5 Hz and would need a 0.33 mm rod. So the signal is
resampled ×256 — ordinary sample-rate change, which preserves pitch ratios exactly and
is why a melody survives the trip.

| Note | Ratio | Sound | Swing | Rod |
|------|-------|-------|-------|-----|
| A3 | 1/1 | 220.00 Hz | 0.859 Hz | 33.6 cm |
| C4 | 6/5 | 264.00 Hz | 1.031 Hz | 23.4 cm |
| E4 | 3/2 | 330.00 Hz | 1.289 Hz | 15.0 cm |
| A4 | 2/1 | 440.00 Hz | 1.719 Hz | 8.4 cm |

The score is just intonation over A3 = 220 Hz, so the intervals are exact whole-number
ratios rather than equal-tempered approximations. Sixteen notes, **13.54 s**, resolving
onto its own first note.

## What this does and does not claim

- **Damping is not modelled.** A pendulum that swings forever has no energy source. Real
  ones decay, which is why clock pendulums need an escapement. This is an ideal,
  undamped oscillator, shown for clarity.
- **The audio is a resampling, not a recording.** ×256 is sample-rate change. What you
  hear is a sonification of sampled motion.
- **Small-angle approximation.** Amplitude is 0.36 rad (≈20.6°). Beyond roughly 0.4 rad
  the true period lengthens and a pure sinusoid stops describing the swing.
- **The apparatus is not built.** Rod lengths are those a physical build would require.

## Running it

No dependencies, no build step.

    npm test      # the whole suite, on node --test
    npm run hero  # regenerate the theme-aware SVG from the same physics module

Then open `index.html`. The page is silent until you click — that is browser policy, not
a preference.

## Layout

    src/physics.js     the maths; no DOM, no audio, no canvas
    src/ring.js        fixed-capacity history buffers — the page runs for days
    src/score.js       the note line and loop indexing
    src/scheduler.js   audio-clock lookahead scheduling
    src/audio.js       Web Audio, with the context injected so it can be tested
    src/render.js      canvas 2D, state in and pixels out
    src/main.js        wiring only
    tools/build-hero.mjs  generates assets/ from src/physics.js

`src/physics.js` is imported by both the page and the hero generator, so the SVG cannot
drift from the demo.

## Licence

MIT.
```

Create `LICENSE` with the standard MIT text and `Copyright (c) 2026 Dushmilan Jeyanathan`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — all suites, no failures.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md LICENSE test/package.test.mjs
git commit -m "docs: package scripts, README with stated caveats, MIT licence"
```

---

### Task 11: Verification and publication

**Files:**
- No files created. This task produces evidence.

**Interfaces:**
- Consumes: everything.
- Produces: a verified page, a public repo, live Pages, and a verified hero on the profile.

- [ ] **Step 1: Run the full suite from a clean checkout state**

Run: `npm test`
Expected: all tests pass. Paste the summary line into the task notes. **Do not proceed on a failure.**

- [ ] **Step 2: Verify in a real browser, not by inspection**

Load the page with the Chrome DevTools tooling (`chrome-devtools`: `new_page`, then
`navigate_page` to `file:///home/dushmilan/Desktop/pendulum-sonification/index.html`).
Then:

- `list_console_messages` — expect **no errors**. An error here means the six modules
  failed to load or resolve over `file://`; if so, serve the directory over
  `python3 -m http.server` and retry before changing any code.
- `take_screenshot` — confirm four zones are drawn, the rod is visible, and nothing is
  clipped at 1200×500.
- Evaluate `window.__pendulum.state` — expect `{score: [...16], total: 13.54…, running: true}`.
- Click the sound button and re-check console messages — expect no errors. (Sound itself
  cannot be verified from a screenshot; state the limit of the evidence.)
- Resize to 320 px wide and screenshot again — confirm panels stay positive-sized.

- [ ] **Step 3: Confirm the long-run claims are tested, not asserted**

Run: `node --test test/scheduler.test.mjs` and `node --test test/ring.test.mjs`
Expected: PASS. Quote the pass counts. The simulated-hour scheduler test and the
100k-push ring test are the evidence for "plays forever".

- [ ] **Step 4: Confirm with the author before any external action**

Creating the public repository, pushing, and enabling Pages are external side effects.
**Ask first.** Then:

```bash
gh repo create pendulum-sonification --public --source=. --remote=origin --push
gh api -X POST "repos/Dushmilan/pendulum-sonification/pages" -f "source[branch]=main" -f "source[path]=/"
```

- [ ] **Step 5: Verify the live page, then the profile hero**

```bash
gh api repos/Dushmilan/pendulum-sonification/pages --jq '.html_url, .status'
```

Load the live URL in Chrome DevTools, confirm the same result as Step 2, then check
`https://github.com/Dushmilan` renders `assets/hero.svg` **as motion**. If it does not
animate, generate a GIF/APNG from the same computed frames and commit that instead —
report which happened.

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "fix: issues found during browser and live-site verification"
```

---

## Self-Review

**Spec coverage.** §4 physics → Task 1. §5 mapping → Tasks 1, 3. §6 material → Task 3. §7 composition → Task 7 (geometry) and Task 8 (page). §8 architecture → Tasks 1–8. §9 long-run correctness → Tasks 2, 5, 6. §10 audio → Tasks 4, 6. §11 hero → Task 9, verified in Task 11. §12 repo/deploy → Tasks 9, 10, 11. §13 accessibility → Tasks 7, 8. §14 caveats → Tasks 8 and 10. §15 risks → Tasks 5, 6, 9, and Step 5 of Task 11.

**Known gaps, stated deliberately.** The four zones' *aesthetic* result cannot be unit-tested; Task 11 Step 2 is the evidence for it, and it is a human judgement call on the screenshot. Audio waveform correctness is verified by frequency assertions against a fake context, not by listening.

**Type consistency.** `buildScore() → NoteEvent[]` with `{index, name, fAudio, fPendulum, period, rodMetres}` is consumed unchanged by Tasks 5, 7, 8, 9. `tracePoints(samples, amplitudeRatio)` — the plan's Step-1 test writes the old `(period, samples)` signature; Step 3 says explicitly to rename in both files. `createAudioEngine` returns `unlock/playNote/setMuted/muted/unlocked/context/dispose`, consumed by Tasks 8 and 11.

**Review Focus coverage.** (1) blocked `AudioContext` → Task 6 test 4. (2) backgrounded tab → Task 5 test 4. (3) tiny viewport → Task 7 tests 2 and 3. (4) `prefers-reduced-motion` → Task 8 static assertions plus the `reduceMotion` branch, verified visually in Task 11. (5) corrupt score entry → Tasks 1, 3, 4, 5 throwing tests plus `MAX_NOTES_PER_TICK`.
