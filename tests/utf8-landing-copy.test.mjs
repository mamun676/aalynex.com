import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const text = value => String(value||'').replace(/&mdash;/g,'—').replace(/&rarr;/g,'→')
  .replace(/&hellip;/g,'…').replace(/&#128075;/g,'👋');
test('landing document declares UTF-8 early', () => {
  assert.match(html.slice(0,256), /<meta charset="UTF-8"\s*\/?>/i);
});
test('page title is clean and brand stays Aalynex', () => {
  assert.match(html, /<title>Aalynex - Connect Creators with Pro Video Editors<\/title>/);
});
test('Google, Open Graph and social titles do not contain corrupted characters', () => {
  assert.match(html, /<meta property="og:title" content="Aalynex - Connect Creators with Pro Editors"\s*\/>/);
  assert.match(html, /<meta name="twitter:title" content="Aalynex - Connect Creators with Pro Editors"\s*\/>/);
});
test('no common mojibake or Unicode replacement sequences remain anywhere', () => {
  assert.doesNotMatch(html, /(?:Ã|Â|â€|â‚|ðŸ|ƒ|�)/);
  assert.doesNotMatch(html, /[\u0080-\u009f]/);
});
test('home hero uses a readable separator', () => {
  assert.match(text(html), /Get Polished Content — Delivered Fast\./);
});
test('feature cards preserve readable copy', () => {
  assert.match(text(html), /Content — Delivered Fast/);
  assert.match(text(html), /Timeframe — From 24 Hours/);
  assert.match(text(html), /Real-Time — No Middlemen/);
});
test('public profile and welcome screens use valid HTML character references', () => {
  assert.match(html, /Join Aalynex &rarr;/);
  assert.match(html, /Loading profile&hellip;/);
  assert.match(html, /Welcome &#128075; Let's get started!/);
});
test('canonical URL and public metadata remain stable', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/aalynex\.com\/"\s*\/>/);
  assert.match(html, /<meta name="description" content="Post your video project/);
});
