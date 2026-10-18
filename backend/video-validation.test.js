const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVideoRequest } = require('./video-validation');

const accepted = {
  prompt: 'A mountain landscape at sunrise, slow camera movement.',
  confirmCost: true,
  consent: true,
  count: 2,
  mode: 't2v'
};

test('accepts a confirmed text-to-video request', () => {
  assert.deepEqual(validateVideoRequest(accepted), {
    prompt: accepted.prompt,
    count: 2,
    providerId: 'magic-hour',
    mode: 't2v',
    image: null,
    durationSeconds: 6,
    aspectRatio: '16:9',
    language: 'English'
  });
});

test('requires paid-cost confirmation and rights consent', () => {
  assert.throws(() => validateVideoRequest({ ...accepted, confirmCost: false }), /paid provider credits/);
  assert.throws(() => validateVideoRequest({ ...accepted, consent: false }), /rights/);
});

test('validates Higgsfield text-to-video duration, mode, and aspect ratio', () => {
  const higgsfield = { ...accepted, providerId: 'higgsfield-video', duration: 8, count: 1 };
  assert.equal(validateVideoRequest(higgsfield).providerId, 'higgsfield-video');
  assert.equal(validateVideoRequest({ ...higgsfield, duration: 4 }).durationSeconds, 4);
  assert.throws(() => validateVideoRequest({ ...higgsfield, duration: 3 }), /Higgsfield Seedance 2.5/);
  assert.throws(() => validateVideoRequest({ ...higgsfield, mode: 'i2v', image: 'data:image/png;base64,aW1hZ2U=' }), /text-to-video only/);
  assert.throws(() => validateVideoRequest({ ...higgsfield, aspectRatio: '4:3' }), /Aspect ratio/);
});

test('validates variation count, supported mode, and image-to-video input', () => {
  assert.throws(() => validateVideoRequest({ ...accepted, count: 3 }), /1 or 2/);
  assert.throws(() => validateVideoRequest({ ...accepted, mode: 'lip' }), /text-to-video or image-to-video/);
  assert.throws(() => validateVideoRequest({ ...accepted, mode: 'i2v' }), /reference image/);
  assert.throws(() => validateVideoRequest({ ...accepted, image: 'https://example.com/picture.jpg' }), /JPG or PNG/);
});

test('validates Magic Hour clip duration and aspect ratio', () => {
  assert.equal(validateVideoRequest({ ...accepted, duration: 30, aspectRatio: '9:16' }).durationSeconds, 30);
  assert.throws(() => validateVideoRequest({ ...accepted, duration: 2 }), /between 3 and 30 seconds/);
  assert.throws(() => validateVideoRequest({ ...accepted, duration: 31 }), /between 3 and 30 seconds/);
  assert.throws(() => validateVideoRequest({ ...accepted, aspectRatio: '4:3' }), /Aspect ratio/);
  assert.throws(() => validateVideoRequest({ ...accepted, language: 'unknown' }), /supported video language/);
});

test('validates Gemini Veo duration, aspect ratio, and provider selection', () => {
  const gemini = { ...accepted, providerId: 'google-gemini', duration: 8 };
  assert.equal(validateVideoRequest(gemini).durationSeconds, 8);
  assert.throws(() => validateVideoRequest({ ...gemini, duration: 6 }), /8-second clips/);
  assert.throws(() => validateVideoRequest({ ...gemini, aspectRatio: '1:1' }), /Aspect ratio/);
  assert.throws(() => validateVideoRequest({ ...accepted, providerId: 'google-flow' }), /prompt handoff/);
});

test('rejects disallowed impersonation and sexual prompts', () => {
  assert.throws(
    () => validateVideoRequest({ ...accepted, prompt: 'Create a deepfake of a public figure talking.' }),
    /cannot be generated/
  );
});
