const test = require('node:test');
const assert = require('node:assert/strict');
const magicHour = require('./magichour');

function withProvider(t, fetchStub, key = 'unit-test-key') {
  const oldKey = process.env.MAGIC_HOUR_API_KEY;
  const oldAlias = process.env.MAGICHOUR_API_KEY;
  const oldFetch = global.fetch;
  process.env.MAGIC_HOUR_API_KEY = key;
  delete process.env.MAGICHOUR_API_KEY;
  global.fetch = fetchStub;
  t.after(() => {
    if (oldKey === undefined) delete process.env.MAGIC_HOUR_API_KEY;
    else process.env.MAGIC_HOUR_API_KEY = oldKey;
    if (oldAlias === undefined) delete process.env.MAGICHOUR_API_KEY;
    else process.env.MAGICHOUR_API_KEY = oldAlias;
    global.fetch = oldFetch;
  });
}

test('creates a Magic Hour text-to-video project with authenticated API settings', async t => {
  const calls = [];
  withProvider(t, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ id: 'project-123', status: 'queued' }) };
  });

  const result = await magicHour.create({
    prompt: 'A mountain landscape at sunrise, slow camera movement.',
    duration: 12,
    aspectRatio: '9:16'
  });
  assert.deepEqual(result, { taskId: 'project-123', status: 'QUEUED', error: null });
  assert.equal(calls[0].url, 'https://api.magichour.ai/v1/text-to-video');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-test-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: JSON.parse(calls[0].options.body).name,
    model: 'minimax-h3',
    resolution: '480p',
    end_seconds: 12,
    aspect_ratio: '9:16',
    style: { prompt: 'A mountain landscape at sunrise, slow camera movement.' }
  });
});

test('uploads image without forwarding API credentials and creates an image-to-video project', async t => {
  const calls = [];
  withProvider(t, async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => ({
          items: [{
            upload_url: 'https://videos.magichour.ai/api-assets/test/image.png?signature=signed',
            file_path: 'api-assets/test/image.png'
          }]
        })
      };
    }
    if (calls.length === 2) return { ok: true, json: async () => null };
    return { ok: true, json: async () => ({ id: 'image-project-456' }) };
  });

  const result = await magicHour.create({
    prompt: 'A mountain landscape at sunrise, slow camera movement.',
    image: 'data:image/png;base64,aW1hZ2U=',
    duration: 6,
    aspectRatio: '16:9'
  });
  assert.equal(result.status, 'QUEUED');
  assert.equal(calls[0].url, 'https://api.magichour.ai/v1/files/upload-urls');
  assert.equal(calls[1].url, 'https://videos.magichour.ai/api-assets/test/image.png?signature=signed');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls[2].url, 'https://api.magichour.ai/v1/image-to-video');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer unit-test-key');
  assert.deepEqual(JSON.parse(calls[2].options.body).assets, {
    image_file_path: 'api-assets/test/image.png'
  });
});

test('polls Magic Hour project state and returns its temporary download URL', async t => {
  withProvider(t, async () => ({
    ok: true,
    json: async () => ({
      id: 'project-123',
      status: 'complete',
      credits_charged: 42,
      downloads: [{ url: 'https://videos.magichour.ai/output.mp4', expires_at: '2030-01-01T00:00:00Z' }]
    })
  }));
  assert.deepEqual(await magicHour.getTask('project-123'), {
    taskId: 'project-123',
    status: 'COMPLETED',
    generatedUrl: 'https://videos.magichour.ai/output.mp4',
    error: null,
    creditsCharged: 42
  });
});

test('rejects unsafe upload destinations and completed projects with no output', async t => {
  let calls = 0;
  withProvider(t, async () => {
    calls++;
    if (calls === 1) {
      return {
        ok: true,
        json: async () => ({
          items: [{
            upload_url: 'https://attacker.example/upload',
            file_path: 'api-assets/test/image.png'
          }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({ id: 'project-123', status: 'complete', downloads: [] })
    };
  });
  await assert.rejects(
    magicHour.create({
      prompt: 'A mountain landscape at sunrise, slow camera movement.',
      image: 'data:image/png;base64,aW1hZ2U='
    }),
    /unsafe or invalid image upload target/
  );
  await assert.rejects(magicHour.getTask('project-123'), /no download URL/);
});
