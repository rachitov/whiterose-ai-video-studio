const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./image-art');

test('creates a local landscape SVG illustration from a prompt', () => {
  const svg = create('A peaceful mountain landscape at sunset.', '16:9');
  assert.match(svg, /<svg[^>]+width="1024" height="576"/);
  assert.match(svg, /mountain landscape at sunset/);
  assert.match(svg, /<linearGradient/);
  assert.match(svg, /<path/);
});

test('escapes prompt text before placing it in SVG markup', () => {
  const svg = create('A bright city with <script>alert("x")<\/script> signs.');
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test('validates prompt lengths and supported aspect ratios', () => {
  assert.throws(() => create('short'), /between 10 and 2000/);
  assert.throws(() => create('a'.repeat(2001)), /between 10 and 2000/);
  assert.throws(() => create('A beautiful illustration.', '4:3'), /aspect ratio/);
  assert.match(create('A colorful flower garden.', '9:16'), /width="576" height="1024"/);
});
