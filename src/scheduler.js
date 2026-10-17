import { nearestNoteIndex, loopDuration } from './score.js';

export const TICK_SECONDS = 0.025;
export const LOOKAHEAD_SECONDS = 0.1;
export const MAX_NOTES_PER_TICK = 1000;

/**
 * Schedules notes onto a clock the caller supplies — the audio clock once sound is
 * enabled. Notes are queued ahead of time, so a throttled or paused main thread cannot
 * make the music stutter, and a tab hidden for minutes catches up in order.
 */
export function createScheduler({ events, onNote, lookahead = LOOKAHEAD_SECONDS, maxPerTick = MAX_NOTES_PER_TICK }) {
  if (!Array.isArray(events) || events.length === 0) throw new RangeError('scheduler needs at least one event');
  if (typeof onNote !== 'function') throw new RangeError('onNote must be a function');

  const total = loopDuration(events);
  let index = 0;
  let nextStart = null;
  let loops = 0;

  function start(now, elapsedInLoop = 0) {
    const t = elapsedInLoop % total;
    index = nearestNoteIndex(events, t < 0 ? t + total : t);
    nextStart = now;
    loops = 0;
  }

  function tick(now) {
    if (nextStart === null) start(now);
    const horizon = now + lookahead;
    let scheduled = 0;
    while (nextStart <= horizon) {
      if (scheduled >= maxPerTick) {
        throw new RangeError('scheduler exceeded maxPerTick — the score is corrupt');
      }
      const event = events[index];
      onNote({ event, startTime: nextStart, duration: event.period, loop: loops });
      nextStart += event.period;
      index += 1;
      if (index >= events.length) { index = 0; loops += 1; }
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
