const BASE_URL = 'https://api.higgsfield.ai';
const IMAGE_ENDPOINT = '/higgsfield-ai/soul/standard';
const VIDEO_ENDPOINT = '/bytedance/seedance-2.5/text-to-video';
const TERMINAL = new Set(['COMPLETED', 'FAILED']);

function credentials() {
  const combined = process.env.HIGGSFIELD_API_KEY || '';
  const separator = combined.indexOf(':');
  const id = process.env.HF_API_KEY_ID || (separator > 0 ? combined.slice(0, separator) : '');
  const secret = process.env.HF_API_KEY_SECRET || (separator > 0 ? combined.slice(separator + 1) : '');
  return id && secret ? { id, secret } : null;
}

function apiKey() {
  return credentials() ? 'configured' : '';
}

function terminalError(message, status) {
  let detail = typeof message === 'string' ? message : 'Higgsfield request failed.';
  if (status === 401) detail = 'Higgsfield rejected the API credentials. Verify or rotate the API key ID and secret in Higgsfield Console.';
  else if (status === 403) detail = 'Higgsfield denied the request, commonly because the account has insufficient credits or model access. Check your Higgsfield account and model access.';
  return Object.assign(new Error(detail), { status: status >= 500 ? 502 : status });
}

async function request(url, { method = 'GET', body, idempotencyKey } = {}) {
  const auth = credentials();
  if (!auth) {
    throw Object.assign(new Error('Set HIGGSFIELD_API_KEY as KEY_ID:KEY_SECRET (or HF_API_KEY_ID and HF_API_KEY_SECRET) in .env.'), { status: 503 });
  }
  const headers = { Authorization: `Key ${auth.id}:${auth.secret}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw Object.assign(new Error(`Could not reach Higgsfield API: ${error.message}`), { status: 502 });
  }
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = result?.detail || result?.error?.message || result?.message;
    throw terminalError(typeof error === 'string' ? error : 'Higgsfield API request failed.', response.status);
  }
  return result;
}

function acceptedTask(result) {
  const requestId = result?.request_id;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    throw Object.assign(new Error('Higgsfield returned an invalid request ID.'), { status: 502 });
  }
  return { taskId: requestId, status: mapStatus(result.status), error: null };
}

function mapStatus(status) {
  if (status === 'completed') return 'COMPLETED';
  if (status === 'failed' || status === 'nsfw' || status === 'canceled') return 'FAILED';
  if (status === 'in_progress' || status === 'processing') return 'IN_PROGRESS';
  if (status === 'queued' || status === 'created' || status === undefined) return 'QUEUED';
  throw Object.assign(new Error('Higgsfield returned an unknown request status.'), { status: 502 });
}

function safeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error('Higgsfield returned an invalid media URL.'), { status: 502 });
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw Object.assign(new Error('Higgsfield returned an unsafe media URL.'), { status: 502 });
  }
  return url.toString();
}

async function createImage({ prompt, aspectRatio = '1:1' }) {
  if (!['1:1', '16:9', '9:16'].includes(aspectRatio)) {
    throw Object.assign(new Error('Choose a square, landscape, or portrait image.'), { status: 400 });
  }
  const result = await request(`${BASE_URL}${IMAGE_ENDPOINT}`, {
    method: 'POST',
    idempotencyKey: require('crypto').randomUUID(),
    body: { prompt, aspect_ratio: aspectRatio, resolution: '720p', enhance_prompt: true, batch_size: 1 }
  });
  return acceptedTask(result);
}

async function createVideo({ prompt, duration = 8, aspectRatio = '16:9' }) {
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) {
    throw Object.assign(new Error('Higgsfield Seedance 2.5 clips must be 4 to 30 seconds.'), { status: 400 });
  }
  if (!['16:9', '9:16', '1:1'].includes(aspectRatio)) {
    throw Object.assign(new Error('Choose 16:9, 9:16, or 1:1 for Higgsfield video.'), { status: 400 });
  }
  const result = await request(`${BASE_URL}${VIDEO_ENDPOINT}`, {
    method: 'POST',
    idempotencyKey: require('crypto').randomUUID(),
    body: { prompt, duration, aspect_ratio: aspectRatio, resolution: '480p', generate_audio: true }
  });
  return acceptedTask(result);
}

async function getTask(taskId, kind = 'video') {
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(taskId)) {
    throw Object.assign(new Error('Invalid Higgsfield request ID.'), { status: 400 });
  }
  const result = await request(`${BASE_URL}/requests/${encodeURIComponent(taskId)}/status`);
  const status = mapStatus(result?.status);
  if (status === 'FAILED') {
    return { taskId, status, error: result?.error || 'Higgsfield could not complete the request.' };
  }
  if (status !== 'COMPLETED') return { taskId, status, error: null };
  const mediaUrl = kind === 'image'
    ? (Array.isArray(result.images) ? result.images.find(item => item?.url)?.url : null)
    : result.video?.url;
  if (!mediaUrl) {
    throw Object.assign(new Error(`Higgsfield completed the request but returned no ${kind}.`), { status: 502 });
  }
  return { taskId, status, generatedUrl: safeUrl(mediaUrl), error: null };
}

module.exports = {
  apiKey,
  createImage,
  createVideo,
  getImageTask: taskId => getTask(taskId, 'image'),
  getVideoTask: taskId => getTask(taskId, 'video'),
  isTerminal: status => TERMINAL.has(status)
};
