import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the page loads main as a module', () => {
  assert.match(html, /<script[^>]+type="module"[^>]+src="\.\/src\/main\.js"/);
});

test('the page has the canvas, the toggle, and a text alternative', () => {
  assert.match(html, /id="stage"/);
  assert.match(html, /id="sound"/);
  assert.match(html, /<canvas[^>]+id="scene"/);
  assert.match(html, /aria-describedby="stage-description"/);
  assert.match(html, /id="stage-description"/);
});

test('the sound control reports its state and is not auto-started', () => {
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /autoplay/i);
});

test('the caveats are collapsed but present', () => {
  assert.match(html, /<details/);
  assert.match(html, /damping/i);
  assert.match(html, /resampl/i);
  assert.match(html, /small-angle/i);
});

test('reduced motion is honoured where it can actually take effect', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /prefers-reduced-motion/);
  assert.match(main, /reducedMotion\.matches/);
  assert.match(main, /if \(!reducedMotion\.matches\) requestAnimationFrame/);
});

test('a wide diagram stays readable on a narrow screen by scrolling rather than squeezing', () => {
  assert.match(html, /#stage\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(html, /id="stage"[^>]*tabindex="0"/);
});

test('resizing repaints a still picture instead of leaving it blank', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /function redrawIfStatic\(\)/);
  assert.match(main, /addEventListener\('resize',[\s\S]{0,160}redrawIfStatic\(\)/);
  assert.match(main, /redrawIfStatic[\s\S]{0,160}draw\(nowSeconds\(\)\)/);
});
