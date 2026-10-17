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
  assert.throws(() => panelRects(100, 100), RangeError);
});

test('rodPixels clamps to the drawable band and never returns NaN', () => {
  const h = 300;
  assert.ok(rodPixels(0.334, h) > rodPixels(0.084, h));
  const smallest = rodPixels(0.000001, h);
  const largest = rodPixels(999, h);
  assert.ok(smallest > 0 && Number.isFinite(smallest));
  assert.ok(largest <= h && Number.isFinite(largest));
  assert.throws(() => rodPixels(NaN, h), RangeError);
  assert.throws(() => rodPixels(0.2, 0), RangeError);
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
