import { eventAt, loopDuration } from './score.js';

export const TICK_SECONDS = 0.025;
/**
 * Long enough that a throttled background timer (browsers clamp hidden-tab timers to
 * about one second) still finds the next notes already queued.
 */
export const LOOKAHEAD_SECONDS = 1.5;
export const MAX_NOTES_PER_TICK = 1000;
const MAX_SKIP_STEPS = 1_000_000;

/**
 * Schedules notes onto a clock the caller supplies — the audio clock once sound is
 * enabled. Notes are queued ahead of time, so a throttled main thread cannot make the
 * music stutter. If a tick ever arrives late, the missed notes are skipped and the line
 * resumes at the present rather than being fired at once with start times in the past.
 */
export function createScheduler({ events, onNote, lookahead = LOOKAHEAD_SECONDS, maxPerTick = MAX_NOTES_PER_TICK }) {
  if (!Array.isArray(events) || events.length === 0) throw new RangeError('scheduler needs at least one event');
  if (typeof onNote !== 'function') throw new RangeError('onNote must be a function');
  if (!(lookahead > 0)) throw new RangeError(`lookahead must be > 0, got ${lookahead}`);

  const total = loopDuration(events);
  let index = 0;
  let nextStart = null;
  let firstTrim = 0;
  let loops = 0;

  /**
   * `elapsedInLoop` as a fraction into a note means the picture is showing that note
   * mid-swing; the first note is shortened to its remainder so audio and image agree
   * from the first click, with no silence and no visual jump.
   */
  function start(now, elapsedInLoop = 0) {
    const t = ((elapsedInLoop % total) + total) % total;
    const at = eventAt(events, t);
    index = at.index;
    firstTrim = at.phase >= 1 ? 0 : at.phase * at.event.period;
    nextStart = now;
    loops = 0;
  }

  function advance() {
    nextStart += events[index].period;
    index += 1;
    if (index >= events.length) {
      index = 0;
      loops += 1;
    }
  }

  function skipToPresent(now) {
    let steps = 0;
    while (nextStart < now) {
      advance();
      firstTrim = 0;
      steps += 1;
      if (steps > MAX_SKIP_STEPS) {
        throw new RangeError('scheduler could not reach the present — the score is corrupt');
      }
    }
  }

  function tick(now) {
    if (nextStart === null) start(now);
    if (nextStart < now) skipToPresent(now);

    const horizon = now + lookahead;
    let scheduled = 0;
    while (nextStart <= horizon) {
      if (scheduled >= maxPerTick) {
        throw new RangeError('scheduler exceeded maxPerTick — the score is corrupt');
      }
      const event = events[index];
      const duration = firstTrim > 0 ? event.period - firstTrim : event.period;
      onNote({ event, startTime: nextStart, duration, loop: loops });
      nextStart += duration;
      firstTrim = 0;
      index += 1;
      if (index >= events.length) {
        index = 0;
        loops += 1;
      }
      scheduled += 1;
    }
    return scheduled;
  }

  return {
    start,
    tick,
    get loops() { return loops; },
    get nextStart() { return nextStart; },
  };
}
