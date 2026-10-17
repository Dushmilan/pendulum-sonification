import { Ring } from './ring.js';
import { buildScore, eventAt, loopDuration } from './score.js';
import { createScheduler, TICK_SECONDS } from './scheduler.js';
import { createAudioEngine } from './audio.js';
import { drawScene, MIN_CANVAS_WIDTH } from './render.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const soundButton = document.getElementById('sound');
const status = document.getElementById('status');
const stage = document.getElementById('stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const score = buildScore();
const total = loopDuration(score);
const history = new Ring(8);
const engine = createAudioEngine();

let layout = { width: 1000, height: 430 };
let scheduler = null;
let lastTick = -Infinity;
let anchorTime = 0;
let anchorPosition = 0;

/** The active clock: the audio clock once sound exists, the page clock before that. */
function nowSeconds() {
  const audio = engine.context;
  return audio ? audio.currentTime : performance.now() / 1000;
}

function loopPosition(now) {
  const raw = anchorPosition + (now - anchorTime);
  return ((raw % total) + total) % total;
}

function anchorAt(now, position) {
  anchorTime = now;
  anchorPosition = position;
}

function makeScheduler() {
  return createScheduler({
    events: score,
    onNote: ({ event, startTime, duration }) => {
      engine.playNote(event.fAudio, startTime, duration);
      history.push({ name: event.name, period: event.period });
    },
  });
}

function resize() {
  const width = Math.max(MIN_CANVAS_WIDTH, stage.clientWidth);
  const height = Math.max(360, Math.min(470, width * 0.43));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = { width, height };
}

function draw(now) {
  const position = loopPosition(now);
  const { event, phase } = eventAt(score, position);
  drawScene(ctx, {
    event,
    phase,
    elapsedInLoop: position,
    events: score,
    loopSeconds: total,
    history: history.toArray(),
    time: now,
  }, layout);
}

function tick(now) {
  if (!scheduler) return;
  if (now - lastTick < TICK_SECONDS) return;
  lastTick = now;
  try {
    scheduler.tick(now);
  } catch (error) {
    console.error(error);
  }
}

function frame() {
  const now = nowSeconds();
  tick(now);
  draw(now);
  if (!reducedMotion.matches) requestAnimationFrame(frame);
}

function renderStaticFrame() {
  const now = nowSeconds();
  tick(now);
  draw(now);
}

soundButton.addEventListener('click', () => {
  if (engine.unlocked) {
    const nextMuted = !engine.muted;
    engine.setMuted(nextMuted);
    soundButton.setAttribute('aria-pressed', String(!nextMuted));
    soundButton.textContent = nextMuted ? 'Sound off' : 'Sound on';
    status.textContent = nextMuted ? 'muted' : 'playing';
    return;
  }

  const positionSnapshot = loopPosition(nowSeconds());
  const audio = engine.unlock();
  if (!audio) {
    status.textContent = 'audio unavailable — the animation continues';
    soundButton.textContent = 'Sound unavailable';
    return;
  }
  anchorAt(audio.currentTime, positionSnapshot);
  scheduler.start(audio.currentTime, positionSnapshot);
  lastTick = -Infinity;
  soundButton.setAttribute('aria-pressed', 'true');
  soundButton.textContent = 'Sound on';
  status.textContent = 'playing';
  document.removeEventListener('keydown', onKey);
});

function onKey(event) {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    soundButton.click();
  }
}

document.addEventListener('keydown', onKey);
window.addEventListener('resize', resize);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) renderStaticFrame();
  else requestAnimationFrame(frame);
});

resize();
anchorAt(nowSeconds(), 0);
scheduler = makeScheduler();
scheduler.start(nowSeconds(), 0);

window.__pendulum = {
  engine,
  get state() {
    return {
      score,
      total,
      running: scheduler !== null,
      unlocked: engine.unlocked,
      position: loopPosition(nowSeconds()),
    };
  },
};

if (reducedMotion.matches) renderStaticFrame();
else requestAnimationFrame(frame);
