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

/**
 * Index of the note whose start is nearest to `elapsedInLoop`, measured on the loop
 * circle so the wrap point counts as a boundary of note 0. Used to re-anchor onto the
 * audio clock without the picture jumping.
 */
export function nearestNoteIndex(events, elapsedInLoop) {
  const total = loopDuration(events);
  const t = withinLoop(events, elapsedInLoop);
  let bestIndex = 0;
  let bestDistance = Math.min(t, total - t);
  let boundary = 0;
  for (let i = 1; i < events.length; i++) {
    boundary += events[i - 1].period;
    const distance = Math.abs(t - boundary);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
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
