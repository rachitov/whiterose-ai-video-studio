const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVideoPrompt } = require('./video-director');

test('combines the original brief and all storyboard directions for generation', () => {
  const result = buildVideoPrompt({
    prompt: 'A travel film about a sunrise in the mountains.',
    scene: {
      v: 'A hiker reaches a ridge as sunlight spills across the valley.',
      mo: 'Slow tracking shot from behind, then a gentle tilt toward the sun.',
      na: 'The day begins above the clouds.',
      cp: 'Find your horizon.',
      so: 'Soft wind and restrained orchestral music.'
    },
    duration: 10,
    aspectRatio: '9:16',
    language: 'English',
    mode: 'i2v'
  });
  assert.match(result, /Creative brief: A travel film/);
  assert.match(result, /Image-to-video using the supplied reference image/);
  assert.match(result, /Target clip length: 10 seconds/);
  assert.match(result, /Aspect ratio: 9:16/);
  assert.match(result, /Visual action: A hiker reaches a ridge/);
  assert.match(result, /Camera and motion: Slow tracking shot/);
  assert.match(result, /Narration or dialogue: The day begins/);
  assert.match(result, /On-screen captions: Find your horizon/);
  assert.match(result, /Sound: Soft wind/);
  assert.match(result, /Treat the supplied image as the approved opening frame/);
  assert.match(result, /Describe only the requested change over time/);
});

test('rejects malformed or excessively long storyboard directions', () => {
  assert.throws(() => buildVideoPrompt({
    prompt: 'A mountain sunrise video.',
    scene: { v: 'x'.repeat(2001) },
    duration: 6,
    aspectRatio: '16:9',
    language: 'English',
    mode: 't2v'
  }), /no longer than 2000 characters/);
  assert.throws(() => buildVideoPrompt({
    prompt: 'short',
    duration: 6,
    aspectRatio: '16:9',
    language: 'English',
    mode: 't2v'
  }), /between 10 and 2000 characters/);
});

test('builds a direct prompt without requiring a storyboard', () => {
  const result = buildVideoPrompt({
    prompt: 'A quiet forest path at sunrise, a fox crosses the frame.',
    scene: null,
    duration: 6,
    aspectRatio: '16:9',
    language: 'English',
    mode: 't2v'
  });
  assert.match(result, /Creative brief: A quiet forest path/);
  assert.match(result, /Target clip length: 6 seconds/);
  assert.match(result, /one readable action with a clear beginning and ending/);
});
