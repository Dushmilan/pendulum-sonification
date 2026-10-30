import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroSvg, buildHeroStripSvg, heroThemes, swingKeyframes, HERO_WIDTH, HERO_HEIGHT, STRIP_WIDTH, STRIP_HEIGHT, CYCLE_SECONDS } from '../tools/build-hero.mjs';
import { loopDuration, buildScore, LINE } from '../src/score.js';
import { AMPLITUDE } from '../src/physics.js';

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

test('the hero swings once per note on the real timings, not once per loop', () => {
  const events = buildScore();
  const stops = swingKeyframes(events);
  assert.equal(stops.length, events.length * 2 + 1);
  assert.equal(stops[0].percent, 0);
  assert.ok(Math.abs(stops.at(-1).percent - 100) < 1e-9);
  assert.equal(stops[0].angle, stops.at(-1).angle, 'the loop seam must match');
  const amplitudeDegrees = (AMPLITUDE * 180) / Math.PI;
  stops.forEach((stop, i) => {
    const sign = i % 2 === 0 ? 1 : -1;
    assert.ok(Math.abs(stop.angle - sign * amplitudeDegrees) < 1e-6, `stop ${i} angle ${stop.angle}`);
  });
  const span = (note) => stops[note * 2 + 1].percent - stops[note * 2].percent;
  assert.ok(span(5) < span(0), 'the fastest note must cover less loop time than the slowest');
});

test('the swing keyframes come from the physics constants, not literals', () => {
  const svg = buildHeroSvg({ theme: 'dark' });
  assert.match(svg, /rotate\(-20\.6\d*deg\)/);
  assert.ok(!svg.includes('rotate(-20.6deg)'), 'the hardcoded literal must be gone');
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

test('the strip is a standalone 1200x150 svg document', () => {
  const svg = buildHeroStripSvg({ theme: 'dark' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 1200 150"/);
  assert.match(svg, /<\/svg>\s*$/);
});

test('the strip dimensions match its viewBox', () => {
  assert.equal(STRIP_WIDTH, 1200);
  assert.equal(STRIP_HEIGHT, 150);
});

test('the strip carries the same real numbers and animates without script', () => {
  const svg = buildHeroStripSvg({ theme: 'dark' });
  assert.match(svg, /33\.6\s*cm/);
  assert.match(svg, /8\.4\s*cm/);
  assert.match(svg, /1\.719\s*Hz/);
  assert.match(svg, /256/);
  assert.match(svg, /@keyframes/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /\sonload=/i);
  assert.doesNotMatch(svg, /<audio/i);
});

test('the strip names every note in the line', () => {
  const svg = buildHeroStripSvg({ theme: 'dark' });
  for (const name of new Set(LINE)) assert.ok(svg.includes(`>${name}<`), `missing ${name}`);
});

test('the two strip themes differ only in palette', () => {
  const strip = (s) => s.replace(/#[0-9a-fA-F]{6}/g, '#COLOR');
  assert.equal(strip(buildHeroStripSvg({ theme: 'dark' })), strip(buildHeroStripSvg({ theme: 'light' })));
});

test('an unknown theme is refused for the strip too', () => {
  assert.throws(() => buildHeroStripSvg({ theme: 'neon' }), RangeError);
});
