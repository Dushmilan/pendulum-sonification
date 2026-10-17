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

test('start(now, elapsedInLoop) resumes from the nearest note boundary', () => {
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
  s.tick(120);
  assert.ok(notes.length > events.length * 8, `scheduled ${notes.length}`);
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

test('the scheduler refuses an empty score', () => {
  assert.throws(() => createScheduler({ events: [], onNote: () => {} }), RangeError);
  assert.throws(() => createScheduler({ events: buildScore(), onNote: null }), RangeError);
});

test('MAX_NOTES_PER_TICK is a real cap', () => {
  assert.ok(Number.isInteger(MAX_NOTES_PER_TICK) && MAX_NOTES_PER_TICK > 0);
});
