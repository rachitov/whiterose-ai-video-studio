const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'veo-3.1-generate-preview';
const IMAGE_MODEL = 'gemini-nano-banana-2.1';

function apiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
}

function requireApiKey() {
  if (!apiKey()) {
    throw Object.assign(new Error('Set GEMINI_API_KEY in the project .env file to enable Gemini video and image generation.'), { status: 503 });
  }
  return apiKey();
}

function apiError(result, fallback) {
  return result?.error?.message || result?.message || fallback;
}

function explainApiError(result, status) {
  const message = apiError(result, 'Google Gemini API request failed.');
  const code = result?.error?.status || '';
  if (status === 429 || status === 402 || /RESOURCE_EXHAUSTED|quota|rate.?limit|billing|payment required/i.test(`${code} ${message}`)) {
    return 'Gemini API quota or billing limit reached. Check the API key’s Google AI Studio project for Veo rate limits, billing setup, and available credits at https://aistudio.google.com/billing and https://aistudio.google.com/rate-limit. Wait for quota reset or add billing/credits, or switch to Magic Hour.';
  }
  return message;
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'x-goog-api-key': requireApiKey(),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw Object.assign(new Error(`Could not reach Google Gemini API: ${error.message}`), { status: 502 });
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(explainApiError(result, response.status)), {
      status: response.status === 401 || response.status === 403 ? 502 : response.status
    });
  }
  return result;
}

async function createImage({ prompt, aspectRatio = '1:1' }) {
  if (!['1:1', '16:9', '9:16'].includes(aspectRatio)) {
    throw Object.assign(new Error('Choose a square, landscape, or portrait image.'), { status: 400 });
  }
  const result = await request('/interactions', {
    method: 'POST',
    body: {
      model: IMAGE_MODEL,
      input: `Create an image with a ${aspectRatio} aspect ratio. ${prompt}`
    }
  });
  const image = result?.output_image;
  if (typeof image?.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) || image.data.length % 4 === 1) {
    throw Object.assign(new Error('Gemini completed the image request but returned no valid image data.'), { status: 502 });
  }
  const imageBytes = Buffer.from(image.data, 'base64');
  if (!imageBytes.length || imageBytes.length > 20 * 1024 * 1024) {
    throw Object.assign(new Error('Gemini returned an image larger than the app’s 20 MB output limit.'), { status: 502 });
  }
  const mimeType = typeof image.mime_type === 'string' && /^image\/(?:png|jpeg|webp)$/i.test(image.mime_type)
    ? image.mime_type.toLowerCase()
    : 'image/png';
  return { data: image.data, mimeType };
}

function imageInput(dataUrl) {
  if (!dataUrl) return undefined;
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) {
    throw Object.assign(new Error('Gemini reference images must be JPG or PNG.'), { status: 400 });
  }
  return {
    mimeType: `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}`,
    imageBytes: match[2]
  };
}

async function create({ prompt, image, aspectRatio = '16:9' }) {
  const imagePart = imageInput(image);
  const instance = { prompt };
  if (imagePart) instance.image = imagePart;
  const result = await request(`/models/${MODEL}:predictLongRunning`, {
    method: 'POST',
    body: {
      instances: [instance],
      parameters: { aspectRatio, durationSeconds: 8, resolution: '720p' }
    }
  });
  if (typeof result?.name !== 'string' || !result.name) {
    throw Object.assign(new Error('Google Gemini returned an invalid video operation.'), { status: 502 });
  }
  return { taskId: result.name, status: 'QUEUED', error: null };
}

function safeVideoUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw Object.assign(new Error('Google Gemini returned an invalid video URL.'), { status: 502 });
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'generativelanguage.googleapis.com') {
    throw Object.assign(new Error('Google Gemini returned an unsafe video URL.'), { status: 502 });
  }
  return parsed;
}

async function getTask(operationName) {
  if (typeof operationName !== 'string' ||
      !/^(?:models\/[A-Za-z0-9._-]+\/)?operations\/[A-Za-z0-9._-]+$/.test(operationName)) {
    throw Object.assign(new Error('Invalid Google Gemini operation ID.'), { status: 400 });
  }
  const result = await request(`/${operationName}`);
  if (result?.error) {
    return { taskId: operationName, status: 'FAILED', error: explainApiError(result, result.error.code) };
  }
  if (result?.done !== true) return { taskId: operationName, status: 'IN_PROGRESS', error: null };
  const generated = result.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
  if (!generated?.uri) {
    throw Object.assign(new Error('Google Gemini completed the operation but returned no video.'), { status: 502 });
  }
  return {
    taskId: operationName,
    status: 'COMPLETED',
    generatedUrl: safeVideoUri(generated.uri).toString(),
    error: null
  };
}

async function downloadVideo(uri) {
  const url = safeVideoUri(uri);
  let response;
  try {
    response = await fetch(url, { headers: { 'x-goog-api-key': requireApiKey() } });
  } catch (error) {
    throw Object.assign(new Error(`Could not download the Gemini video: ${error.message}`), { status: 502 });
  }
  if (!response.ok || !response.body) {
    const result = await response.json().catch(() => null);
    throw Object.assign(new Error(explainApiError(result, response.status)), { status: 502 });
  }
  return response;
}

module.exports = {
  apiKey,
  create,
  createImage,
  getTask,
  downloadVideo,
  isTerminal: status => status === 'COMPLETED' || status === 'FAILED'
};
