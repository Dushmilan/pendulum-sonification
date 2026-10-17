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
