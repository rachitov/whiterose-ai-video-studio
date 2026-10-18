const test = require('node:test');
const assert = require('node:assert/strict');
const higgsfield = require('./higgsfield');

function withEnvironment(t, values, callback) {
  const keys = ['HIGGSFIELD_API_KEY', 'HF_API_KEY_ID', 'HF_API_KEY_SECRET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  callback();
}

test('submits a SOUL image job using server-side Higgsfield credentials', async t => {
  withEnvironment(t, { HIGGSFIELD_API_KEY: 'test-id:test-secret' }, () => {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.higgsfield.ai/higgsfield-ai/soul/standard');
      assert.equal(options.headers.Authorization, 'Key test-id:test-secret');
      assert.ok(options.headers['Idempotency-Key']);
      assert.deepEqual(JSON.parse(options.body), {
        prompt: 'A cinematic blue flower in a glass vase.',
        aspect_ratio: '9:16',
        resolution: '720p',
        enhance_prompt: true,
        batch_size: 1
      });
      return new Response(JSON.stringify({ request_id: 'image-job-1', status: 'queued' }), { status: 202 });
    };
  });
  const result = await higgsfield.createImage({
    prompt: 'A cinematic blue flower in a glass vase.',
    aspectRatio: '9:16'
  });
  assert.deepEqual(result, { taskId: 'image-job-1', status: 'QUEUED', error: null });
});

test('submits Seedance video with a low supported resolution and duration', async t => {
  withEnvironment(t, { HF_API_KEY_ID: 'test-id', HF_API_KEY_SECRET: 'test-secret' }, () => {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video');
      assert.deepEqual(JSON.parse(options.body), {
        prompt: 'A cinematic ocean sunset with slow camera motion.',
        duration: 8,
        aspect_ratio: '16:9',
        resolution: '480p',
        generate_audio: true
      });
      return new Response(JSON.stringify({ request_id: 'video-job-1', status: 'queued' }), { status: 202 });
    };
  });
  const result = await higgsfield.createVideo({
    prompt: 'A cinematic ocean sunset with slow camera motion.',
    duration: 8,
    aspectRatio: '16:9'
  });
  assert.equal(result.taskId, 'video-job-1');
});

test('polls image/video requests and rejects unsafe output URLs', async t => {
  withEnvironment(t, { HIGGSFIELD_API_KEY: 'test-id:test-secret' }, () => {
    global.fetch = async url => {
      const image = String(url).includes('image-job-1');
      return new Response(JSON.stringify(image
        ? { request_id: 'image-job-1', status: 'completed', images: [{ url: 'https://cdn.example.org/image.webp' }] }
        : { request_id: 'video-job-1', status: 'completed', video: { url: 'https://cdn.example.org/clip.mp4' } }), { status: 200 });
    };
  });
  assert.equal((await higgsfield.getImageTask('image-job-1')).generatedUrl, 'https://cdn.example.org/image.webp');
  assert.equal((await higgsfield.getVideoTask('video-job-1')).generatedUrl, 'https://cdn.example.org/clip.mp4');
  await assert.rejects(higgsfield.getImageTask('../bad'), /Invalid Higgsfield request ID/);
});

test('maps billing/auth errors clearly and requires the key ID and secret', async t => {
  withEnvironment(t, { HIGGSFIELD_API_KEY: 'test-id:test-secret' }, () => {
    global.fetch = async () => new Response(JSON.stringify({ detail: 'Insufficient credits' }), { status: 403 });
  });
  await assert.rejects(higgsfield.createImage({ prompt: 'A pretty flower.' }), /insufficient credits or model access/);

  withEnvironment(t, { HIGGSFIELD_API_KEY: 'only-one-part' }, () => {});
  assert.equal(higgsfield.apiKey(), '');
  await assert.rejects(higgsfield.createVideo({ prompt: 'A sunrise.' }), /KEY_ID:KEY_SECRET/);
});
