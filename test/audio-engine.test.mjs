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

test('the voice envelope ramps attack, decay and release around the note', () => {
  const { ctx, created } = fakeContext();
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  engine.unlock();
  engine.playNote(264, 4, 0.969697);
  const voice = created.gains[1];
  const kinds = voice.gain.calls.map((c) => c[0]);
  assert.deepEqual(kinds, ['set', 'linear', 'exp']);
  assert.equal(voice.gain.calls[0][1], 0.0008);
  assert.equal(voice.gain.calls[1][1], 0.3);
  assert.ok(Math.abs(voice.gain.calls[1][2] - (4 + 0.012)) < 1e-9);
  assert.equal(created.gains[2].gain.value, 0.2);
});

test('muting suppresses further notes', () => {
  const { ctx, created } = fakeContext();
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  engine.unlock();
  engine.setMuted(true);
  assert.equal(engine.playNote(220, 0, 1), null);
  assert.equal(created.oscillators.length, 0);
});

test('a non-positive frequency or duration is refused rather than scheduled', () => {
  const { ctx, created } = fakeContext();
  const engine = createAudioEngine({ ctxFactory: () => ctx });
  engine.unlock();
  assert.equal(engine.playNote(0, 0, 1), null);
  assert.equal(engine.playNote(220, 0, 0), null);
  assert.equal(created.oscillators.length, 0);
});
