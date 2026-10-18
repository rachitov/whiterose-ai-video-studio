const test = require('node:test');
const assert = require('node:assert/strict');
const openaiImage = require('./openai-image');

function withEnvironment(t, key, fetchStub) {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = global.fetch;
  if (key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = key;
  global.fetch = fetchStub;
  t.after(() => {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });
}

test('creates an image with OpenAI GPT Image using the server-side key', async t => {
  let call;
  withEnvironment(t, 'test-openai-key', async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('png-image').toString('base64') }] }), { status: 200 });
  });
  const result = await openaiImage.createImage({
    prompt: 'A cinematic orange flower in a glass vase.',
    aspectRatio: '16:9'
  });
  assert.equal(call.url, 'https://api.openai.com/v1/images/generations');
  assert.equal(call.options.headers.Authorization, 'Bearer test-openai-key');
  assert.deepEqual(JSON.parse(call.options.body), {
    model: 'gpt-image-2.5-flare',
    prompt: 'A cinematic orange flower in a glass vase.',
    size: '1536x1024',
    quality: 'medium',
    output_format: 'png',
    n: 1
  });
  assert.deepEqual(result, { data: Buffer.from('png-image').toString('base64'), mimeType: 'image/png' });
});

test('maps supported image aspect ratios to OpenAI sizes', async t => {
  const sizes = [];
  withEnvironment(t, 'test-openai-key', async (_url, options) => {
    sizes.push(JSON.parse(options.body).size);
    return new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }), { status: 200 });
  });
  await openaiImage.createImage({ prompt: 'Square image prompt.', aspectRatio: '1:1' });
  await openaiImage.createImage({ prompt: 'Portrait image prompt.', aspectRatio: '9:16' });
  assert.deepEqual(sizes, ['1024x1024', '1024x1536']);
});

test('requires an API key and rejects unsupported aspect ratios', async t => {
  withEnvironment(t, undefined, async () => {
    throw new Error('fetch must not be called without a key');
  });
  assert.equal(openaiImage.apiKey(), '');
  await assert.rejects(openaiImage.createImage({ prompt: 'A mountain at sunset.' }), /Set OPENAI_API_KEY/);
  process.env.OPENAI_API_KEY = 'test-openai-key';
  await assert.rejects(openaiImage.createImage({ prompt: 'A mountain at sunset.', aspectRatio: '4:3' }), /square, landscape, or portrait/);
});

test('surfaces OpenAI billing/auth errors and malformed output', async t => {
  withEnvironment(t, 'test-openai-key', async () =>
    new Response(JSON.stringify({ error: { message: 'Billing hard limit has been reached.' } }), { status: 429 }));
  await assert.rejects(openaiImage.createImage({ prompt: 'A mountain at sunset.' }), /Billing hard limit/);

  withEnvironment(t, 'test-openai-key', async () =>
    new Response(JSON.stringify({ data: [{ b64_json: 'invalid base64!' }] }), { status: 200 }));
  await assert.rejects(openaiImage.createImage({ prompt: 'A mountain at sunset.' }), /no valid PNG data/);
});
