export const MASTER_GAIN = 0.45;
export const ATTACK_SECONDS = 0.012;
export const PEAK_GAIN = 0.3;
export const FLOOR_GAIN = 0.0008;
export const DECAY_EXPONENT = 2.2;
export const HARMONIC_GAIN = 0.2;
export const RELEASE_TAIL_SECONDS = 0.05;

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

function defaultCtxFactory() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is unavailable');
  return new Ctor();
}

/**
 * The context is injected so the engine can be tested against a fake one, and so a
 * blocked or unsupported AudioContext degrades to a silent, still-animated page.
 */
export function createAudioEngine({ ctxFactory = defaultCtxFactory } = {}) {
  let ctx = null;
  let master = null;
  let muted = true;

  function unlock() {
    try {
      if (!ctx) {
        ctx = ctxFactory();
        master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
      muted = false;
      return ctx;
    } catch {
      ctx = null;
      master = null;
      muted = true;
      return null;
    }
  }

  function playNote(fAudio, startTime, duration) {
    if (!ctx || muted || !(fAudio > 0) || !(duration > 0)) return null;
    const stopAt = startTime + duration + RELEASE_TAIL_SECONDS;

    const voice = ctx.createGain();
    voice.connect(master);
    voice.gain.setValueAtTime(FLOOR_GAIN, startTime);
    voice.gain.linearRampToValueAtTime(PEAK_GAIN, startTime + ATTACK_SECONDS);
    voice.gain.exponentialRampToValueAtTime(FLOOR_GAIN, stopAt);

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = fAudio;
    fundamental.connect(voice);
    fundamental.start(startTime);
    fundamental.stop(stopAt);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = HARMONIC_GAIN;
    harmonicGain.connect(voice);
    const harmonic = ctx.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = fAudio * 2;
    harmonic.connect(harmonicGain);
    harmonic.start(startTime);
    harmonic.stop(stopAt);

    return null;
  }

  return {
    unlock,
    playNote,
    setMuted(next) { muted = Boolean(next); },
    get muted() { return muted; },
    get unlocked() { return ctx !== null; },
    get context() { return ctx; },
    dispose() {
      try { if (ctx && typeof ctx.close === 'function') ctx.close(); } catch { /* ignore */ }
      ctx = null;
      master = null;
      muted = true;
    },
  };
}
