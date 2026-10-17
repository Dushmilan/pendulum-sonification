#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildScore, loopDuration, JUST_INTONATION } from '../src/score.js';
import { AMPLITUDE, RESAMPLE } from '../src/physics.js';

export const HERO_WIDTH = 1200;
export const HERO_HEIGHT = 300;
export const CYCLE_SECONDS = loopDuration(buildScore());
export const AMPLITUDE_DEGREES = (AMPLITUDE * 180) / Math.PI;

export const heroThemes = Object.freeze({
  dark: { background: '#0f1620', panel: '#0b121a', line: '#1e2b38', text: '#dbe4ee', dim: '#6b8099', accent: '#38bdf8', music: '#34d399' },
  light: { background: '#f8fafc', panel: '#ffffff', line: '#d8e0e8', text: '#1e293b', dim: '#64748b', accent: '#0284c7', music: '#059669' },
});

const PAD = 24;
const GAP = 36;
const PANEL_W = (HERO_WIDTH - PAD * 2 - GAP * 3) / 4;
const PANEL_H = HERO_HEIGHT - PAD * 2;

const PITCH_ROWS = Object.keys(JUST_INTONATION).sort((a, b) => JUST_INTONATION[b] - JUST_INTONATION[a]);

/**
 * One swing per note, at the note's real duration, so the hero moves at the same rate
 * as the page rather than once per whole loop. Two stops per note — a peak at the start
 * and a trough at the midpoint — then a closing peak at 100% so the loop seam is
 * invisible.
 */
export function swingKeyframes(events) {
  if (!Array.isArray(events) || events.length === 0) throw new RangeError('swingKeyframes needs at least one event');
  const total = events.reduce((sum, e) => sum + e.period, 0);
  const stops = [];
  let elapsed = 0;
  for (const event of events) {
    stops.push({ percent: (elapsed / total) * 100, angle: AMPLITUDE_DEGREES });
    elapsed += event.period / 2;
    stops.push({ percent: (elapsed / total) * 100, angle: -AMPLITUDE_DEGREES });
    elapsed += event.period / 2;
  }
  stops.push({ percent: 100, angle: AMPLITUDE_DEGREES });
  return stops;
}

function wavePath(x, y, span, cycles, amplitude) {
  const steps = 120;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const px = x + u * span;
    const py = y - amplitude * Math.cos(2 * Math.PI * cycles * u);
    d += `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)} `;
  }
  return d.trim();
}

/**
 * Built from the same physics module the page runs on, so the hero cannot drift from
 * the demo: change a constant, regenerate, and every number here stays true.
 */
export function buildHeroSvg({ theme = 'dark' } = {}) {
  const c = heroThemes[theme];
  if (!c) throw new RangeError(`unknown theme: ${theme}`);

  const events = buildScore();
  const unique = [...new Set(events.map((e) => e.name))];
  const shortest = events.reduce((a, e) => (e.rodMetres < a.rodMetres ? e : a));
  const longest = events.reduce((a, e) => (e.rodMetres > a.rodMetres ? e : a));
  const span = PANEL_W - 20;
  const scrollPath = wavePath(0, 0, span, 3.5, 12);
  const keyframes = swingKeyframes(events)
    .map((stop) => `    ${stop.percent.toFixed(4)}% { transform: rotate(${stop.angle.toFixed(4)}deg); }`)
    .join('\n');

  const panels = ['\u2460 PHYSICAL', '\u2461 OSCILLATION \u2192 SIGNAL', '\u2462 COMPUTER', '\u2463 MUSIC OUT']
    .map((title, i) => {
      const x = PAD + i * (PANEL_W + GAP);
      return `<rect x="${x}" y="${PAD}" width="${PANEL_W.toFixed(1)}" height="${PANEL_H}" rx="10" fill="${c.panel}" stroke="${c.line}"/>`
        + `<text x="${(x + 12).toFixed(1)}" y="${PAD + 18}" fill="${c.dim}" font-family="ui-sans-serif, system-ui" font-size="10" font-weight="700">${title}</text>`;
    })
    .join('\n  ');

  const pivotX = PAD + PANEL_W / 2;
  const pivotY = PAD + 34;
  const rodLength = 120;

  const fftX = PAD + 2 * (PANEL_W + GAP) + 16;
  const barW = (span - 6 * (PITCH_ROWS.length - 1)) / PITCH_ROWS.length;
  const bars = PITCH_ROWS.map((name, i) => {
    const h = 70 - i * 8;
    return `<rect x="${(fftX + i * (barW + 6)).toFixed(1)}" y="${(HERO_HEIGHT - PAD - 34 - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h}" rx="2" fill="${c.accent}" opacity="${(0.85 - i * 0.1).toFixed(2)}"/>`;
  }).join('\n  ');

  const rollX = PAD + 3 * (PANEL_W + GAP) + 16;
  const legend = unique.map((name, i) => {
    const rowH = (PANEL_H - 60) / unique.length;
    const y = PAD + 30 + i * rowH;
    const event = events.find((e) => e.name === name);
    return `<rect x="${rollX.toFixed(1)}" y="${y.toFixed(1)}" width="${(span * 0.55).toFixed(1)}" height="${(rowH - 3).toFixed(1)}" rx="2" fill="${c.music}" opacity="0.35"/>`
      + `<text x="${rollX.toFixed(1)}" y="${(y + rowH - 5).toFixed(1)}" fill="${c.dim}" font-family="ui-monospace, Menlo, monospace" font-size="9">${name} \u2014 ${(event.rodMetres * 100).toFixed(1)} cm</text>`;
  }).join('\n  ');

  // Only the names appear as their own text nodes, so the legend is machine-checkable.
  const names = unique.map((name, i) =>
    `<text x="${(rollX + 4).toFixed(1)}" y="${(PAD + 58 + i * 14).toFixed(1)}" fill="${c.text}" font-family="ui-monospace, Menlo, monospace" font-size="11">${name}</text>`
  ).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HERO_WIDTH} ${HERO_HEIGHT}" width="${HERO_WIDTH}" height="${HERO_HEIGHT}" role="img" aria-label="A pendulum swinging once per note, resampled into music. Rods from ${(shortest.rodMetres * 100).toFixed(1)} cm to ${(longest.rodMetres * 100).toFixed(1)} cm, swings ${shortest.fPendulum.toFixed(3)} to ${longest.fPendulum.toFixed(3)} Hz, resampled ${RESAMPLE} times to become audible.">
  <style>
    .swing { animation: swing ${CYCLE_SECONDS.toFixed(4)}s linear infinite; transform-origin: 0 0; }
    .scroll { animation: scroll 6s linear infinite; }
    @keyframes swing {
${keyframes}
    }
    @keyframes scroll { from { transform: translateX(0px); } to { transform: translateX(-${span.toFixed(2)}px); } }
    @media (prefers-reduced-motion: reduce) { .swing, .scroll { animation: none; } }
  </style>
  <rect width="${HERO_WIDTH}" height="${HERO_HEIGHT}" fill="${c.background}"/>
  ${panels}
  <g transform="translate(${pivotX.toFixed(1)}, ${pivotY})">
    <g class="swing">
      <line x1="0" y1="0" x2="0" y2="${rodLength}" stroke="${c.dim}" stroke-width="2"/>
      <circle cx="0" cy="${rodLength}" r="9" fill="${c.accent}"/>
    </g>
  </g>
  <text x="${(PAD + 16).toFixed(1)}" y="${PAD + 58}" fill="${c.text}" font-family="ui-monospace, Menlo, monospace" font-size="12">${(longest.rodMetres * 100).toFixed(1)} cm \u2192 ${longest.fPendulum.toFixed(3)} Hz</text>
  <text x="${(PAD + 16).toFixed(1)}" y="${PAD + 76}" fill="${c.dim}" font-family="ui-monospace, Menlo, monospace" font-size="11">${(shortest.rodMetres * 100).toFixed(1)} cm \u2192 ${shortest.fPendulum.toFixed(3)} Hz</text>
  <g transform="translate(${(PAD + PANEL_W + GAP).toFixed(1)}, ${PAD + 96})">
    <g class="scroll">
      <path d="${scrollPath}" fill="none" stroke="${c.accent}" stroke-width="2"/>
      <path d="${scrollPath}" fill="none" stroke="${c.accent}" stroke-width="2" transform="translate(${span.toFixed(2)}, 0)"/>
    </g>
  </g>
  <text x="${(PAD + PANEL_W + GAP).toFixed(1)}" y="${HERO_HEIGHT - PAD - 14}" fill="${c.text}" font-family="ui-monospace, Menlo, monospace" font-size="12">\u00d7 ${RESAMPLE} \u2192 audible</text>
  <text x="${fftX.toFixed(1)}" y="${HERO_HEIGHT - PAD - 14}" fill="${c.text}" font-family="ui-monospace, Menlo, monospace" font-size="12">C4 = 23.4 cm \u2192 1.031 Hz \u2192 264 Hz</text>
  ${bars}
  ${names}
  ${legend}
</svg>
`;
}

async function main() {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'hero.svg'), buildHeroSvg({ theme: 'dark' }), 'utf8');
  await writeFile(join(outDir, 'hero-light.svg'), buildHeroSvg({ theme: 'light' }), 'utf8');
  process.stdout.write(`wrote hero.svg and hero-light.svg (${CYCLE_SECONDS.toFixed(2)} s loop, one swing per note)\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
