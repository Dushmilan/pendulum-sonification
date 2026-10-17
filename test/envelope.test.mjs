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
