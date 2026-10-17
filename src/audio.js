export const MASTER_GAIN = 0.45;
export const ATTACK_SECONDS = 0.012;
export const PEAK_GAIN = 0.3;
export const FLOOR_GAIN = 0.0008;
export const DECAY_EXPONENT = 2.2;

/** Gain of a plucked, music-box-like note at `t` seconds into a note of `duration`. */
export function envelopeAt(t, duration, options = {}) {
  const { attack = ATTACK_SECONDS, peak = PEAK_GAIN, floor = FLOOR_GAIN } = options;
  if (!(duration > 0)) throw new RangeError(`duration must be > 0, got ${duration}`);
  if (!(t >= 0) || t >= duration) return floor;
  if (t < attack) return floor + (peak - floor) * (t / attack);
  if (duration <= attack) return floor;
  const u = (t - attack) / (duration - attack);
  return Math.max(floor, peak * Math.pow(1 - u, DECAY_EXPONENT));
}
