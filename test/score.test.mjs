import test from 'node:test';
import assert from 'node:assert/strict';
import { JUST_INTONATION, LINE, buildScore, loopDuration, nearestNoteIndex, eventAt } from '../src/score.js';

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

test('a note with a non-positive frequency throws', () => {
  assert.throws(() => buildScore(['X'], { X: 0 }), RangeError);
  assert.throws(() => buildScore([]), RangeError);
});

test('nearestNoteIndex snaps to the closest note boundary, wrapping at the loop point', () => {
  const events = buildScore();
  const total = loopDuration(events);
  assert.equal(nearestNoteIndex(events, 0), 0);
  assert.equal(nearestNoteIndex(events, events[0].period), 1);
  assert.equal(nearestNoteIndex(events, events[0].period - 0.001), 1);
  assert.equal(nearestNoteIndex(events, total), 0);
  assert.equal(nearestNoteIndex(events, total + events[0].period + 0.001), 1);
  assert.equal(nearestNoteIndex(events, total - 0.001), 0);
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

test('the exported line matches the spec exactly', () => {
  assert.deepEqual([...LINE], ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'G4', 'E4', 'D4', 'E4', 'G4', 'E4', 'D4', 'C4', 'B3', 'A3']);
});
