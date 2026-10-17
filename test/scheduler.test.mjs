import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScore, loopDuration } from '../src/score.js';
import { createScheduler, MAX_NOTES_PER_TICK, LOOKAHEAD_SECONDS } from '../src/scheduler.js';

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
  assert.equal(notes[0].duration, events[0].period);
});

test('start(now, elapsedInLoop) starts the note already sounding, trimmed to its remainder', () => {
  const events = buildScore();
  const { s, notes } = collect(events, 2);
  const position = events[0].period + 0.01;
  s.start(100, position);
  s.tick(100);
  assert.equal(notes[0].event.name, 'C4');
  assert.equal(notes[0].startTime, 100);
  assert.ok(Math.abs(notes[0].duration - (events[1].period - 0.01)) < 1e-9, String(notes[0].duration));
  assert.equal(notes[1].event.name, 'D4');
  assert.ok(Math.abs(notes[1].startTime - (100 + notes[0].duration)) < 1e-9, 'the next note lands on the true loop boundary');
});

test('every note is scheduled exactly once across a simulated hour', () => {
  const events = buildScore();
  const { s, notes } = collect(events, LOOKAHEAD_SECONDS);
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

test('no note is ever handed a start time that has already passed', () => {
  const events = buildScore();
  const notes = [];
  let currentTick = 0;
  const s = createScheduler({ events, onNote: (n) => notes.push({ ...n, tickAt: currentTick }) });
  s.start(0);
  for (let now = 0; now <= 600; now += 0.025) {
    currentTick = now;
    s.tick(now);
  }
  assert.ok(notes.length > 400, `scheduled ${notes.length}`);
  for (const note of notes) {
    assert.ok(
      note.startTime >= note.tickAt - 1e-9,
      `start ${note.startTime} was already in the past when scheduled at ${note.tickAt}`,
    );
  }
});

test('a backgrounded tab resumes at the present instead of replaying the gap as a burst', () => {
  const events = buildScore();
  const { s, notes } = collect(events, LOOKAHEAD_SECONDS);
  s.start(0);
  s.tick(0);
  const beforeGap = notes.length;
  s.tick(120);
  const replayed = notes.filter((n) => n.startTime > LOOKAHEAD_SECONDS && n.startTime < 119.5);
  assert.equal(replayed.length, 0, `replayed ${replayed.length} notes from a two minute gap`);
  assert.ok(notes.length - beforeGap <= events.length, `burst of ${notes.length - beforeGap} notes`);
});

test('an hour hidden still resumes without throwing or bursting', () => {
  const events = buildScore();
  const { s, notes } = collect(events, LOOKAHEAD_SECONDS);
  s.start(0);
  s.tick(0);
  const beforeGap = notes.length;
  assert.doesNotThrow(() => s.tick(3600));
  assert.ok(notes.at(-1).startTime >= 3600, `resumed at ${notes.at(-1).startTime}`);
  assert.ok(notes.length - beforeGap <= events.length, `burst of ${notes.length - beforeGap} notes`);
  assert.ok(events.some((e) => e.name === notes.at(-1).event.name), 'resumed on a real note');
});

test('a throttled timer still produces an unbroken line when the lookahead covers it', () => {
  const events = buildScore();
  const { s, notes } = collect(events, LOOKAHEAD_SECONDS);
  s.start(0);
  for (let now = 0; now < 60; now += 1) s.tick(now);
  assert.ok(notes.length > 40, `scheduled ${notes.length}`);
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i].startTime - notes[i - 1].startTime;
    assert.ok(Math.abs(gap - notes[i - 1].duration) < 1e-9, `hole in the line at ${i}`);
  }
});

test('the loop counter advances once per completed score pass', () => {
  const events = buildScore();
  const { s } = collect(events, LOOKAHEAD_SECONDS);
  s.start(0);
  for (let now = 0; now < loopDuration(events) * 3 + 0.01; now += 0.025) s.tick(now);
  assert.equal(s.loops, 3);
});

test('the default lookahead is long enough to survive a throttled timer', () => {
  assert.ok(LOOKAHEAD_SECONDS >= 1, `lookahead too short for a backgrounded tab: ${LOOKAHEAD_SECONDS}`);
});

test('a corrupt score with a near-zero period throws rather than hanging', () => {
  const corrupt = Array.from({ length: 4 }, (_, i) => ({
    index: i, name: 'X', fAudio: 220, fPendulum: 1, period: 1e-9, rodMetres: 0.3,
  }));
  const { s } = collect(corrupt, LOOKAHEAD_SECONDS);
  s.start(0);
  assert.throws(() => s.tick(0), RangeError);
});

test('the cap is genuinely enforced, not merely declared', () => {
  const events = buildScore();
  const notes = [];
  const s = createScheduler({ events, lookahead: 60, maxPerTick: 5, onNote: (n) => notes.push(n) });
  s.start(0);
  assert.throws(() => s.tick(0), RangeError);
  assert.equal(notes.length, 5, 'it stopped at the cap');
});

test('the scheduler refuses an empty score', () => {
  assert.throws(() => createScheduler({ events: [], onNote: () => {} }), RangeError);
  assert.throws(() => createScheduler({ events: buildScore(), onNote: null }), RangeError);
});

test('MAX_NOTES_PER_TICK is a sane positive integer', () => {
  assert.ok(Number.isInteger(MAX_NOTES_PER_TICK) && MAX_NOTES_PER_TICK > 0);
});
