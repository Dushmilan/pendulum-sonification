import test from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_COUNT, panelRects, rodPixels, tracePoints, drawScene, palette, historyRows, historyAges, rulerTicks, MIN_CANVAS_WIDTH, ROD_MAX_METRES } from '../src/render.js';

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
  assert.throws(() => panelRects(100, 100), RangeError);
});

test('rodPixels is proportional to the real rod length, not merely monotonic', () => {
  const h = 300;
  const small = rodPixels(0.084, h);
  const big = rodPixels(0.336, h);
  assert.ok(Math.abs(big / small - 4) < 1e-9, `a 4x longer rod must draw 4x longer, got ${big / small}`);
  assert.ok(Math.abs(rodPixels(ROD_MAX_METRES, h) - h) < 1e-9, 'the axis maximum fills the band');
  assert.ok(Math.abs(rodPixels(ROD_MAX_METRES / 2, h) - h / 2) < 1e-9, 'half the length is half the band');
  assert.ok(Math.abs(rodPixels(0, h)) < 1e-9, 'zero length is zero pixels');
  assert.throws(() => rodPixels(NaN, h), RangeError);
  assert.throws(() => rodPixels(-0.1, h), RangeError);
  assert.throws(() => rodPixels(0.2, 0), RangeError);
});

test('rulerTicks marks true centimetres on the same scale as the rod', () => {
  const h = 300;
  const ticks = rulerTicks(h, 35, 5);
  assert.equal(ticks.length, 8);
  assert.equal(ticks[0].cm, 0);
  assert.equal(ticks.at(-1).cm, 35);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i].y > ticks[i - 1].y);
  assert.ok(Math.abs(ticks.at(-1).y - h) < 1e-9, 'the 35 cm mark is the bottom of the band');
  assert.ok(Math.abs(rodPixels(0.336, h) - rulerTicks(h, 35, 5).find((t) => t.cm === 35).y * (0.336 / 0.35)) < 1e-6);
  assert.throws(() => rulerTicks(0), RangeError);
  assert.throws(() => rulerTicks(h, 0, 5), RangeError);
  assert.throws(() => rulerTicks(h, 35, 0), RangeError);
});

test('historyAges offsets each past note by its own swing, with the newest at zero', () => {
  const past = [
    { name: 'A3', period: 1.0 },
    { name: 'C4', period: 0.5 },
    { name: 'E4', period: 0.25 },
  ];
  assert.deepEqual(historyAges(past), [0.75, 0.25, 0]);
  assert.deepEqual(historyAges([]), []);
  assert.deepEqual(historyAges([{ name: 'A3', period: 2 }]), [0]);
});

test('tracePoints returns a closed period within the amplitude band', () => {
  const pts = tracePoints(64);
  assert.equal(pts.length, 64);
  for (const p of pts) assert.ok(Math.abs(p.value) <= 1 + 1e-9);
  assert.ok(Math.abs(pts[0].value - pts[63].value) < 0.2);
  assert.throws(() => tracePoints(0), RangeError);
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

test('the transport strip draws when the score is supplied and is skipped without it', () => {
  const calls = [];
  const noop = (name) => (...args) => calls.push([name, args]);
  const ctx = new Proxy({}, { get: (_t, k) => noop(String(k)), set: () => true });
  const events = [
    { index: 0, name: 'A3', fAudio: 220, fPendulum: 0.859375, period: 1.163636, rodMetres: 0.336469 },
    { index: 1, name: 'C4', fAudio: 264, fPendulum: 1.03125, period: 0.969697, rodMetres: 0.233766 },
  ];
  const base = { event: events[0], phase: 0.5, elapsedInLoop: 1.2, history: [], time: 1 };
  const without = calls.length;
  assert.doesNotThrow(() => drawScene(ctx, base, { width: 1200, height: 500 }));
  const afterPlain = calls.length;
  assert.doesNotThrow(() => drawScene(ctx, { ...base, events, loopSeconds: 2.133333 }, { width: 1200, height: 500 }));
  assert.ok(calls.length > afterPlain, 'the transport drew something');
  assert.ok(afterPlain > without);
  assert.throws(() => drawScene(ctx, { ...base, events: [] }, { width: 0, height: 500 }), RangeError);
});

test('tracePoints can draw many cycles, which is how the 256x resample reads as dense', () => {
  const one = tracePoints(9, 1, 1);
  const two = tracePoints(9, 1, 2);
  assert.ok(Math.abs(one[2].value) < 1e-9, `one cycle at u=0.25 should be a zero crossing, got ${one[2].value}`);
  assert.ok(Math.abs(two[2].value + 1) < 1e-9, `two cycles at u=0.25 should be a trough, got ${two[2].value}`);
  assert.ok(Math.abs(two[6].value + 1) < 1e-9);
  const crossings = (pts) => pts.reduce((n, p, i) => (i && Math.sign(p.value) !== Math.sign(pts[i - 1].value) ? n + 1 : n), 0);
  assert.ok(crossings(tracePoints(401, 1, 8)) > crossings(tracePoints(401, 1, 1)) * 5);
  assert.throws(() => tracePoints(64, 1, 0), RangeError);
});

test('historyRows stacks the pitch history without overlapping or escaping the band', () => {
  const rows = historyRows(5, 12, 13);
  assert.equal(rows.length, 5);
  assert.equal(rows[0], 12);
  assert.equal(rows.at(-1), 12 + 4 * 13);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i] > rows[i - 1]);
  for (const y of rows) assert.ok(Number.isFinite(y));
  assert.deepEqual(historyRows(0, 12, 13), []);
  assert.throws(() => historyRows(3, 12, 0), RangeError);
  assert.throws(() => historyRows(-1, 12, 13), RangeError);
  assert.throws(() => historyRows(3, 12, 13, 30), RangeError);
});

test('the canvas has a legibility floor, not just panels wider than zero', () => {
  assert.ok(Number.isFinite(MIN_CANVAS_WIDTH));
  assert.ok(MIN_CANVAS_WIDTH >= 720, `floor too small: ${MIN_CANVAS_WIDTH}`);
  const rects = panelRects(MIN_CANVAS_WIDTH, 430);
  for (const r of rects) {
    assert.ok(r.w >= 140, `panel too narrow to carry its labels at the floor: ${r.w}`);
  }
});
