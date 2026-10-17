import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroSvg, heroThemes, HERO_WIDTH, HERO_HEIGHT, CYCLE_SECONDS } from '../tools/build-hero.mjs';
import { loopDuration, buildScore, LINE } from '../src/score.js';

test('the hero is a standalone svg document', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 1200 300"/);
  assert.match(svg, /<\/svg>\s*$/);
});

test('it animates with CSS, not script', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  assert.match(svg, /@keyframes/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /\sonload=/i);
  assert.doesNotMatch(svg, /<audio/i);
});

test('it carries the real numbers from physics', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  assert.match(svg, /33\.6\s*cm/);
  assert.match(svg, /8\.4\s*cm/);
  assert.match(svg, /1\.719\s*Hz/);
});

test('it names every note in the line and states the resample', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  for (const name of new Set(LINE)) assert.ok(svg.includes(`>${name}<`), `missing ${name}`);
  assert.match(svg, /256/);
});

test('the loop matches the score, so the hero cannot disagree with the page', () => {
  assert.ok(Math.abs(CYCLE_SECONDS - loopDuration(buildScore())) < 1e-9);
});

test('the two themes differ only in palette', () => {
  const strip = (s) => s.replace(/#[0-9a-fA-F]{6}/g, '#COLOR');
  assert.equal(strip(buildHeroSvg({ theme: 'dark' })), strip(buildHeroSvg({ theme: 'light' })));
  assert.notEqual(heroThemes.dark.background, heroThemes.light.background);
});

test('an unknown theme is refused rather than silently defaulting', () => {
  assert.throws(() => buildHeroSvg({ theme: 'neon' }), RangeError);
});

test('the viewBox matches the declared dimensions', () => {
  assert.equal(HERO_WIDTH, 1200);
  assert.equal(HERO_HEIGHT, 300);
});
