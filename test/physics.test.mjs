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

test('the resample puts every rod in the score into the audible range', () => {
  const fPend = pendulumFrequency(0.24);
  close(audioFrequency(fPend), fPend * 256, 1e-9);
  close(pendulumFrequencyForAudio(audioFrequency(fPend)), fPend, 1e-12);
  for (const rod of [0.084, 0.15, 0.234, 0.336]) {
    const audible = audioFrequency(pendulumFrequency(rod));
    assert.ok(audible >= 20 && audible <= 20000, `${rod} m sounds at ${audible.toFixed(1)} Hz, outside hearing`);
  }
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
