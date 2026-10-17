import { AMPLITUDE, RESAMPLE } from './physics.js';
import { JUST_INTONATION } from './score.js';

export const PANEL_COUNT = 4;
export const PADDING = 14;
export const ARROW_GAP = 34;
/**
 * The four zones are a single machine read left to right, so below this width the layout
 * stops working and the page scrolls sideways instead of squeezing labels into each other.
 */
export const MIN_CANVAS_WIDTH = 760;
/** The top of the ruler's scale, in metres: 35 cm, comfortably past the longest rod. */
export const ROD_MAX_METRES = 0.35;
export const HISTORY_DEPTH = 6;

const TITLES = ['\u2460 PHYSICAL', '\u2461 OSCILLATION \u2192 SIGNAL', '\u2462 COMPUTER', '\u2463 MUSIC OUT'];
const ARROW_LABELS = ['\u03b8(t)', 'x[n]', 'notes'];

/** Rows top-down: highest pitch first, taken from the score's own table so they cannot drift. */
const PITCH_ROWS = Object.keys(JUST_INTONATION).sort((a, b) => JUST_INTONATION[b] - JUST_INTONATION[a]);

export const palette = Object.freeze({
  background: '#0f1620',
  panel: '#0b121a',
  line: '#1e2b38',
  text: '#dbe4ee',
  dim: '#6b8099',
  zones: Object.freeze({
    physical: '#38bdf8',
    signal: '#fbbf24',
    computer: '#a78bfa',
    music: '#34d399',
  }),
});

export function panelRects(width, height) {
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError(`canvas must be positive, got ${width}x${height}`);
  }
  const usable = width - PADDING * 2 - ARROW_GAP * (PANEL_COUNT - 1);
  if (!(usable > 0)) throw new RangeError(`canvas too narrow: ${width}`);
  const w = usable / PANEL_COUNT;
  return Array.from({ length: PANEL_COUNT }, (_, i) => ({
    x: PADDING + i * (w + ARROW_GAP),
    y: PADDING,
    w,
    h: height - PADDING * 2,
  }));
}

/**
 * Linear from zero, so the drawn rod really is proportional to the real rod: a 33.6 cm
 * pendulum draws four times as long as an 8.4 cm one, as the labels claim.
 */
export function rodPixels(rodMetres, availableHeight) {
  if (!Number.isFinite(rodMetres) || rodMetres < 0) {
    throw new RangeError(`rodMetres must be a non-negative finite number, got ${rodMetres}`);
  }
  if (!(availableHeight > 0)) throw new RangeError(`availableHeight must be > 0, got ${availableHeight}`);
  return (rodMetres / ROD_MAX_METRES) * availableHeight;
}

/** Centimetre marks on the same scale the rod is drawn with, measured down from the pivot. */
export function rulerTicks(availableHeight, maxCm = ROD_MAX_METRES * 100, stepCm = 5) {
  if (!(availableHeight > 0)) throw new RangeError(`availableHeight must be > 0, got ${availableHeight}`);
  if (!(maxCm > 0)) throw new RangeError(`maxCm must be > 0, got ${maxCm}`);
  if (!(stepCm > 0)) throw new RangeError(`stepCm must be > 0, got ${stepCm}`);
  const ticks = [];
  for (let cm = 0; cm <= maxCm + 1e-9; cm += stepCm) {
    ticks.push({ cm, y: (cm / maxCm) * availableHeight });
  }
  return ticks;
}

/** Normalised samples of cos(2*pi*cycles*u) across one period of the current note. */
export function tracePoints(samples, amplitudeRatio = 1, cycles = 1) {
  if (!(samples > 1)) throw new RangeError(`samples must be > 1, got ${samples}`);
  if (!(cycles > 0)) throw new RangeError(`cycles must be > 0, got ${cycles}`);
  return Array.from({ length: samples }, (_, i) => {
    const u = i / (samples - 1);
    return { u, value: amplitudeRatio * Math.cos(2 * Math.PI * cycles * u) };
  });
}

/**
 * Vertical positions for the stacked pitch history. `limit` is the y the band may not
 * pass, so a wider history cannot bleed into the live waveform below it.
 */
export function historyRows(count, top, rowHeight, limit = Infinity) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count must be a non-negative integer, got ${count}`);
  }
  if (!(rowHeight > 0)) throw new RangeError(`rowHeight must be > 0, got ${rowHeight}`);
  const rows = Array.from({ length: count }, (_, i) => top + i * rowHeight);
  const last = rows.length ? rows[rows.length - 1] : top;
  if (last > limit) throw new RangeError(`history band overflows the space available: ${last} > ${limit}`);
  return rows;
}

/**
 * Seconds ago that each note in `history` was sounding, oldest first. History arrives
 * oldest-first from the ring buffer, so the note that just played is the last entry and
 * gets an age of zero — the piano roll scrolls away from the now line, not towards it.
 */
export function historyAges(history) {
  const ages = new Array(history.length).fill(0);
  let age = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    ages[i] = age;
    age += history[i].period;
  }
  return ages;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx, text, x, y, color, font) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(text, x, y);
}

function drawPanelShell(ctx, rect, title, accent) {
  ctx.fillStyle = palette.panel;
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fill();
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  roundedRect(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 10);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  label(ctx, title, rect.x + 12, rect.y + 19, accent, '700 10px ui-sans-serif, system-ui');
}

function drawFlowArrow(ctx, from, to, y, text) {
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(from, y);
  ctx.lineTo(to - 6, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to - 9, y - 4);
  ctx.lineTo(to - 2, y);
  ctx.lineTo(to - 9, y + 4);
  ctx.closePath();
  ctx.fillStyle = palette.line;
  ctx.fill();
  ctx.textAlign = 'center';
  label(ctx, text, (from + to) / 2, y - 7, palette.dim, '600 10px ui-sans-serif, system-ui');
  ctx.textAlign = 'left';
}

function drawPhysical(ctx, rect, event, phase) {
  const inner = { x: rect.x + 12, y: rect.y + 30, w: rect.w - 24, h: rect.h - 78 };
  const pivotX = inner.x + (inner.w - 26) / 2;
  const pivotY = inner.y + 14;
  const scaleHeight = inner.h - 20;
  const rod = rodPixels(event.rodMetres, scaleHeight);
  const angle = AMPLITUDE * Math.cos(2 * Math.PI * phase);
  const bobX = pivotX + rod * Math.sin(angle);
  const bobY = pivotY + rod * Math.cos(angle);

  // centimetre ruler on the rod's own scale, so the 8.4-33.6 cm range is honest
  const rulerX = rect.x + rect.w - 22;
  const ticks = rulerTicks(scaleHeight, ROD_MAX_METRES * 100, 5);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rulerX, pivotY);
  ctx.lineTo(rulerX, pivotY + scaleHeight);
  ctx.stroke();
  ctx.textAlign = 'left';
  for (const tick of ticks) {
    const y = pivotY + tick.y;
    const major = tick.cm % 10 === 0;
    ctx.beginPath();
    ctx.moveTo(rulerX, y);
    ctx.lineTo(rulerX + (major ? 7 : 4), y);
    ctx.stroke();
    if (major && tick.cm > 0) label(ctx, String(tick.cm), rulerX + 9, y + 3, palette.dim, '600 8px ui-monospace, Menlo, monospace');
  }

  ctx.strokeStyle = palette.line;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, rod, Math.PI / 2 - AMPLITUDE - 0.14, Math.PI / 2 + AMPLITUDE + 0.14);
  ctx.stroke();

  ctx.strokeStyle = palette.dim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bobX, bobY);
  ctx.stroke();

  ctx.fillStyle = palette.zones.physical;
  ctx.beginPath();
  ctx.arc(bobX, bobY, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#31485c';
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  label(ctx, `L = ${(event.rodMetres * 100).toFixed(1)} cm`, rect.x + rect.w / 2, rect.y + rect.h - 40, palette.text, '700 13px ui-monospace, Menlo, monospace');
  label(ctx, `f = ${event.fPendulum.toFixed(3)} Hz`, rect.x + rect.w / 2, rect.y + rect.h - 22, palette.zones.physical, '600 12px ui-monospace, Menlo, monospace');
  ctx.textAlign = 'left';
}

function drawSignal(ctx, rect, event, phase, history) {
  const inner = { x: rect.x + 14, y: rect.y + 34, w: rect.w - 28, h: rect.h - 74 };
  const bandHeight = 76;
  const bandTop = inner.y + 6;

  // The pitch history: each past note kept at its own wavelength, so a change of pitch
  // reads as a change of wavelength rather than as an abstract colour change.
  const past = history.slice(0, HISTORY_DEPTH);
  const rowHeight = (bandHeight - 8) / HISTORY_DEPTH;
  const rows = historyRows(past.length, bandTop, rowHeight, bandTop + bandHeight - 8);
  past.forEach((note, i) => {
    const cycles = event.period / note.period;
    const y = rows[i] + 4;
    ctx.strokeStyle = `rgba(56,189,248,${(0.16 + 0.07 * i).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let s = 0; s <= 120; s++) {
      const u = s / 120;
      const x = inner.x + u * inner.w;
      const py = y - 4 * Math.cos(2 * Math.PI * cycles * u);
      if (s === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
  });

  const mid = bandTop + bandHeight + (inner.h - bandHeight - 6) / 2;
  const amp = (inner.h - bandHeight - 6) * 0.42;

  ctx.strokeStyle = '#141e28';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = bandTop + bandHeight + ((inner.h - bandHeight - 6) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(inner.x, y);
    ctx.lineTo(inner.x + inner.w, y);
    ctx.stroke();
  }

  const points = tracePoints(140);
  const toScreen = (u, value) => [inner.x + u * inner.w, mid - value * amp];

  ctx.strokeStyle = 'rgba(56,189,248,0.35)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = toScreen(p.u, p.value);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const upto = Math.max(1, Math.round(139 * Math.min(1, phase)));
  ctx.strokeStyle = '#bfe9ff';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 0; i <= upto; i++) {
    const [x, y] = toScreen(points[i].u, points[i].value);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const playX = inner.x + Math.min(1, phase) * inner.w;
  ctx.strokeStyle = 'rgba(251,191,36,0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(playX, bandTop - 4);
  ctx.lineTo(playX, inner.y + inner.h + 4);
  ctx.stroke();
  ctx.fillStyle = palette.zones.signal;
  ctx.beginPath();
  ctx.arc(playX, mid - Math.cos(2 * Math.PI * phase) * amp, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  label(ctx, '1 swing = 1 note', rect.x + rect.w / 2, rect.y + rect.h - 22, palette.dim, '600 10.5px ui-monospace, Menlo, monospace');
  ctx.textAlign = 'left';
}

function drawComputer(ctx, rect, event, phase) {
  const inner = { x: rect.x + 14, y: rect.y + 32, w: rect.w - 28, h: rect.h - 78 };

  // Step one: the same waveform on a 256x faster time base. One swing in 4 ms is one
  // cycle — drawing it as a dense scribble would misreport the frequency by ~4 octaves.
  const squeezed = tracePoints(300);
  const sqMid = inner.y + inner.h * 0.2;
  const sqAmp = inner.h * 0.15;
  ctx.strokeStyle = 'rgba(167,139,250,0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  squeezed.forEach((p, i) => {
    const x = inner.x + p.u * inner.w;
    const y = sqMid - p.value * sqAmp;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.textAlign = 'left';
  label(ctx, '0-1 s', inner.x, sqMid + sqAmp + 14, palette.dim, '600 9px ui-monospace, Menlo, monospace');
  ctx.textAlign = 'right';
  label(ctx, '0-4 ms', inner.x + inner.w, sqMid + sqAmp + 14, palette.zones.computer, '600 9px ui-monospace, Menlo, monospace');
  ctx.textAlign = 'left';
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(inner.x, sqMid + sqAmp + 20);
  ctx.lineTo(inner.x + inner.w, sqMid + sqAmp + 20);
  ctx.stroke();

  // Step two: the peak, and the note that peak is.
  const base = inner.y + inner.h;
  const barW = (inner.w - 6 * (PITCH_ROWS.length - 1)) / PITCH_ROWS.length;
  const active = Math.max(0, PITCH_ROWS.indexOf(event.name));
  PITCH_ROWS.forEach((name, i) => {
    const isActive = i === active;
    const h = isActive ? (inner.h * 0.34) * (0.8 + 0.2 * Math.abs(Math.cos(Math.PI * phase))) : 4 + i * 2;
    ctx.fillStyle = isActive ? palette.zones.computer : '#1c2937';
    ctx.fillRect(inner.x + i * (barW + 6), base - h, barW, h);
    if (isActive) {
      ctx.textAlign = 'center';
      label(ctx, name, inner.x + i * (barW + 6) + barW / 2, base - h - 6, palette.zones.computer, '700 10px ui-monospace, Menlo, monospace');
      ctx.textAlign = 'left';
    }
  });
  ctx.strokeStyle = '#22303d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(inner.x, base + 1);
  ctx.lineTo(inner.x + inner.w, base + 1);
  ctx.stroke();

  ctx.textAlign = 'center';
  label(ctx, `f\u0302 = ${event.fAudio.toFixed(1)} Hz`, rect.x + rect.w / 2, rect.y + rect.h - 40, palette.text, '700 13px ui-monospace, Menlo, monospace');
  label(ctx, `detected ${event.name}  \u00b7  \u00d7 ${RESAMPLE}`, rect.x + rect.w / 2, rect.y + rect.h - 22, palette.zones.computer, '600 11px ui-monospace, Menlo, monospace');
  ctx.textAlign = 'left';
}

function drawMusic(ctx, rect, event, phase, history) {
  const inner = { x: rect.x + 14, y: rect.y + 30, w: rect.w - 28, h: rect.h - 82 };
  const rows = PITCH_ROWS.length;
  const rowH = inner.h / rows;
  const windowSeconds = 10;

  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i % 2 ? '#0e1620' : '#0c141d';
    ctx.fillRect(inner.x, inner.y + i * rowH, inner.w, rowH);
    ctx.textAlign = 'left';
    label(ctx, PITCH_ROWS[i], inner.x + 3, inner.y + i * rowH + rowH / 2 + 3, '#33475a', '600 9px ui-monospace, Menlo, monospace');
  }

  const nowX = inner.x + inner.w - 6;
  const past = history.slice(0, HISTORY_DEPTH);
  const ages = historyAges(past);
  past.forEach((note, i) => {
    const age = ages[i];
    if (age > windowSeconds) return;
    const row = PITCH_ROWS.indexOf(note.name);
    if (row < 0) return;
    const width = Math.max(3, (note.period / windowSeconds) * inner.w);
    const right = nowX - (age / windowSeconds) * inner.w;
    const x = Math.max(inner.x, right - width);
    ctx.fillStyle = `rgba(52,211,153,${Math.max(0.18, 1 - age / windowSeconds).toFixed(3)})`;
    roundedRect(ctx, x, inner.y + row * rowH + 2, Math.min(width, nowX - x), rowH - 4, 3);
    ctx.fill();
  });

  const currentWidth = Math.max(3, ((phase * event.period) / windowSeconds) * inner.w);
  const currentRow = PITCH_ROWS.indexOf(event.name);
  if (currentRow >= 0) {
    ctx.fillStyle = palette.zones.music;
    roundedRect(ctx, nowX - currentWidth, inner.y + currentRow * rowH + 2, currentWidth, rowH - 4, 3);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(251,191,36,0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(nowX, inner.y);
  ctx.lineTo(nowX, inner.y + inner.h);
  ctx.stroke();

  const keyY = inner.y + inner.h + 6;
  const keyH = Math.max(10, rect.y + rect.h - 26 - keyY);
  const keyW = inner.w / rows;
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i === currentRow ? palette.zones.music : '#1a2531';
    roundedRect(ctx, inner.x + i * keyW + 1.5, keyY, keyW - 3, keyH, 3);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  label(ctx, `\u266a ${event.name}`, rect.x + rect.w / 2, rect.y + rect.h - 8, palette.zones.music, '700 12px ui-monospace, Menlo, monospace');
  ctx.textAlign = 'left';
}

/**
 * The one shared time base. Each of the four zones has its own local time axis, so the
 * strip below them is what makes the page read as a single instrument: 16 segments
 * proportional to the real note durations, with one playhead crossing the whole width.
 */
function drawTransport(ctx, state, rects, stripTop, stripHeight) {
  const { events, elapsedInLoop } = state;
  const left = rects[0].x;
  const right = rects[rects.length - 1].x + rects[rects.length - 1].w;
  const width = right - left;
  const total = events.reduce((sum, e) => sum + e.period, 0) || 1;
  const barTop = stripTop + 4;
  const barHeight = stripHeight - 10;

  let cursor = left;
  events.forEach((e, i) => {
    const segW = (e.period / total) * width;
    ctx.fillStyle = i % 2 ? '#141f2b' : '#101923';
    ctx.fillRect(cursor, barTop, Math.max(1, segW - 1), barHeight);
    if (segW > 18) {
      ctx.textAlign = 'left';
      label(ctx, e.name, cursor + 3, barTop + barHeight - 3, palette.dim, '600 8px ui-monospace, Menlo, monospace');
    }
    cursor += segW;
  });

  const progress = ((elapsedInLoop % total) + total) % total;
  const nowX = left + (progress / total) * width;
  ctx.strokeStyle = 'rgba(251,191,36,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(nowX, stripTop - 6);
  ctx.lineTo(nowX, barTop + barHeight + 2);
  ctx.stroke();
}

/**
 * Draws the whole instrument from a state snapshot: state in, pixels out, no time logic.
 */
export function drawScene(ctx, state, layout) {
  const { width, height } = layout;
  const hasTransport = Array.isArray(state.events) && state.events.length > 0;
  const stripHeight = hasTransport ? 30 : 0;
  const rects = panelRects(width, height - stripHeight);
  const history = state.history ?? [];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const accents = [palette.zones.physical, palette.zones.signal, palette.zones.computer, palette.zones.music];
  rects.forEach((rect, i) => drawPanelShell(ctx, rect, TITLES[i], accents[i]));
  for (let i = 0; i < rects.length - 1; i++) {
    const y = rects[i].y + rects[i].h * 0.66;
    drawFlowArrow(ctx, rects[i].x + rects[i].w, rects[i + 1].x, y, ARROW_LABELS[i]);
  }

  drawPhysical(ctx, rects[0], state.event, state.phase);
  drawSignal(ctx, rects[1], state.event, state.phase, history);
  drawComputer(ctx, rects[2], state.event, state.phase);
  drawMusic(ctx, rects[3], state.event, state.phase, history);

  if (hasTransport) drawTransport(ctx, state, rects, height - stripHeight, stripHeight);
}
