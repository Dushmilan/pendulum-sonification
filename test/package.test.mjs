import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const licence = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');

test('there are no dependencies at all', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('the two scripts exist and are wired to the right entry points', () => {
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.scripts.hero, 'node tools/build-hero.mjs');
});

test('the package is marked as a module', () => {
  assert.equal(pkg.type, 'module');
});

test('the readme states the caveats a technical reader will look for', () => {
  assert.match(readme, /damping is not modelled/i);
  assert.match(readme, /resampling/i);
  assert.match(readme, /small-angle/i);
  assert.match(readme, /256/);
  assert.match(readme, /13\.54/);
});

test('the readme embeds the dark hero and links to the live page', () => {
  assert.match(readme, /assets\/hero\.svg/);
  assert.match(readme, /https:\/\/dushmilan\.github\.io\/pendulum-sonification\//);
});

test('the readme documents both scripts', () => {
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run hero/);
});

test('the licence is MIT and names the author', () => {
  assert.match(licence, /MIT License/);
  assert.match(licence, /Dushmilan/);
});
