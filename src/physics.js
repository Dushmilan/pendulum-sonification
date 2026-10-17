export const G = 9.81;
export const AMPLITUDE = 0.36;   // radians, ~20.6 degrees
export const RESAMPLE = 256;     // playback speedup that brings the swing into audio range

function positive(value, name) {
  if (!(value > 0)) throw new RangeError(`${name} must be > 0, got ${value}`);
  return value;
}

/** f = (1/2pi) * sqrt(g/L) */
export function pendulumFrequency(rodMetres) {
  return Math.sqrt(G / positive(rodMetres, 'rodMetres')) / (2 * Math.PI);
}

/** L = g / (2pi f)^2 */
export function rodLength(fPendulum) {
  const w = 2 * Math.PI * positive(fPendulum, 'fPendulum');
  return G / (w * w);
}

export function period(fPendulum) {
  return 1 / positive(fPendulum, 'fPendulum');
}

/** Angular displacement of an ideal, undamped, small-angle pendulum. */
export function theta(t, fPendulum, amplitude = AMPLITUDE) {
  return amplitude * Math.cos(2 * Math.PI * positive(fPendulum, 'fPendulum') * t);
}

export function audioFrequency(fPendulum) {
  return positive(fPendulum, 'fPendulum') * RESAMPLE;
}

export function pendulumFrequencyForAudio(fAudio) {
  return positive(fAudio, 'fAudio') / RESAMPLE;
}

export function rodForAudioFrequency(fAudio) {
  return rodLength(pendulumFrequencyForAudio(fAudio));
}

export function periodForAudioFrequency(fAudio) {
  return period(pendulumFrequencyForAudio(fAudio));
}
