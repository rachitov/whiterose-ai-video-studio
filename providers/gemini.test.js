const test = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('./gemini');

function withGemini(t, fetchStub, key = 'unit-test-key') {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldAlias = process.env.GOOGLE_GEMINI_API_KEY;
  const oldFetch = global.fetch;
  process.env.GEMINI_API_KEY = key;
  delete process.env.GOOGLE_GEMINI_API_KEY;
  global.fetch = fetchStub;
  t.after(() => {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
    if (oldAlias === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = oldAlias;
    global.fetch = oldFetch;
  });
}

test('starts a Veo 3.1 text-to-video operation with supported settings', async t => {
  let call;
  withGemini(t, async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ name: 'models/veo-3.1-generate-preview/operations/op-123' }) };
  });
  assert.deepEqual(await gemini.create({
    prompt: 'A cinematic sunrise over the mountains.',
    duration: 8,
    aspectRatio: '9:16'
  }), {
    taskId: 'models/veo-3.1-generate-preview/operations/op-123',
    status: 'QUEUED',
    error: null
  });
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning');
  assert.equal(call.options.headers['x-goog-api-key'], 'unit-test-key');
  assert.deepEqual(JSON.parse(call.options.body), {
    instances: [{ prompt: 'A cinematic sunrise over the mountains.' }],
    parameters: { aspectRatio: '9:16', durationSeconds: 8, resolution: '720p' }
  });
});

test('generates Nano Banana images through the official Interactions API', async t => {
  let call;
  withGemini(t, async (url, options) => {
    call = { url, options };
    return {
      ok: true,
      json: async () => ({ output_image: { data: 'aW1hZ2U=', mime_type: 'image/webp' } })
    };
  });
  assert.deepEqual(await gemini.createImage({
    prompt: 'A cinematic flower in soft morning light.',
    aspectRatio: '9:16'
  }), { data: 'aW1hZ2U=', mimeType: 'image/webp' });
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(call.options.headers['x-goog-api-key'], 'unit-test-key');
  assert.deepEqual(JSON.parse(call.options.body), {
    model: 'gemini-nano-banana-2.1',
    input: 'Create an image with a 9:16 aspect ratio. A cinematic flower in soft morning light.'
  });
});

test('rejects malformed Gemini image responses and aspect ratios', async t => {
  withGemini(t, async () => ({ ok: true, json: async () => ({ output_image: { data: 'not base64!' } }) }));
  await assert.rejects(gemini.createImage({ prompt: 'A lake at sunset.' }), /no valid image data/);
  await assert.rejects(gemini.createImage({ prompt: 'A lake at sunset.', aspectRatio: '4:3' }), /square, landscape, or portrait/);
});

test('sends reference images as inline Veo image input', async t => {
  let requestBody;
  withGemini(t, async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ name: 'operations/op-image' }) };
  });
  await gemini.create({
    prompt: 'Animate the supplied landscape image with a slow camera move.',
    image: 'data:image/png;base64,aW1hZ2U=',
    aspectRatio: '16:9'
  });
  assert.deepEqual(requestBody.instances[0].image, { mimeType: 'image/png', imageBytes: 'aW1hZ2U=' });
});

test('polls Veo operations and returns only safe Google video URLs', async t => {
  let result = { done: false };
  withGemini(t, async () => ({ ok: true, json: async () => result }));
  assert.deepEqual(await gemini.getTask('operations/op-123'), {
    taskId: 'operations/op-123',
    status: 'IN_PROGRESS',
    error: null
  });
  result = {
    done: true,
    response: {
      generateVideoResponse: {
        generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-123' } }]
      }
    }
  };
  assert.deepEqual(await gemini.getTask('operations/op-123'), {
    taskId: 'operations/op-123',
    status: 'COMPLETED',
    generatedUrl: 'https://generativelanguage.googleapis.com/v1beta/files/video-123',
    error: null
  });
  result.response.generateVideoResponse.generatedSamples[0].video.uri = 'https://attacker.example/video.mp4';
  await assert.rejects(gemini.getTask('operations/op-123'), /unsafe video URL/);
});

test('validates operation IDs, credentials, and completed responses', async t => {
  withGemini(t, async () => ({ ok: true, json: async () => ({ done: true, response: {} }) }));
  await assert.rejects(gemini.getTask('../private'), /Invalid Google Gemini operation ID/);
  await assert.rejects(gemini.getTask('operations/op-123'), /returned no video/);

  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(gemini.create({ prompt: 'A video of a forest at sunrise.' }), /Set GEMINI_API_KEY/);
  process.env.GEMINI_API_KEY = oldKey;
});

test('downloads video from Google with server-side authentication', async t => {
  let call;
  withGemini(t, async (url, options) => {
    call = { url, options };
    return { ok: true, headers: new Headers({ 'content-type': 'video/mp4' }), body: new ReadableStream() };
  });
  const response = await gemini.downloadVideo('https://generativelanguage.googleapis.com/v1beta/files/video-123');
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(call.options.headers['x-goog-api-key'], 'unit-test-key');
  await assert.rejects(gemini.downloadVideo('https://attacker.example/video.mp4'), /unsafe video URL/);
});

test('turns quota and billing responses into actionable guidance', async t => {
  withGemini(t, async () => ({
    ok: false,
    status: 429,
    json: async () => ({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'You exceeded your current quota, please check your plan and billing details.'
      }
    })
  }));
  await assert.rejects(
    gemini.create({ prompt: 'A cinematic sunrise above a mountain valley.' }),
    error => /Google AI Studio project/.test(error.message) &&
      /https:\/\/aistudio\.google\.com\/billing/.test(error.message) &&
      /switch to Magic Hour/.test(error.message) &&
      error.status === 429
  );
});
