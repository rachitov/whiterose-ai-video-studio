const BASE_URL = 'https://api.magichour.ai';
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);
const STATUS_MAP = new Map([
  ['queued', 'QUEUED'],
  ['rendering', 'IN_PROGRESS'],
  ['complete', 'COMPLETED'],
  ['error', 'FAILED'],
  ['canceled', 'FAILED']
]);

function apiKey() {
  return process.env.MAGIC_HOUR_API_KEY || process.env.MAGICHOUR_API_KEY || '';
}

function requireApiKey() {
  const key = apiKey();
  if (!key) {
    throw Object.assign(
      new Error('Set MAGIC_HOUR_API_KEY in the project .env file to enable Magic Hour video generation.'),
      { status: 503 }
    );
  }
  return key;
}

function apiError(result, fallback) {
  return result?.message || result?.error?.message || result?.error || fallback;
}

async function providerRequest(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${requireApiKey()}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw Object.assign(new Error(`Could not reach Magic Hour: ${error.message}`), { status: 502 });
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(
      new Error(apiError(result, 'Magic Hour API request failed.')),
      { status: response.status === 401 ? 502 : response.status }
    );
  }
  return result;
}

async function uploadImage(dataUrl) {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl || '');
  if (!match) {
    throw Object.assign(new Error('Magic Hour reference images must be JPG or PNG.'), { status: 400 });
  }
  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  const contentType = extension === 'jpg' ? 'image/jpeg' : 'image/png';
  const result = await providerRequest('/v1/files/upload-urls', {
    method: 'POST',
    body: { items: [{ type: 'image', extension }] }
  });
  const upload = result?.items?.[0];
  let uploadUrl;
  try {
    uploadUrl = new URL(upload?.upload_url);
  } catch {
    throw Object.assign(new Error('Magic Hour returned an invalid image upload URL.'), { status: 502 });
  }
  if (uploadUrl.protocol !== 'https:' || uploadUrl.hostname !== 'videos.magichour.ai' ||
      typeof upload.file_path !== 'string' || !upload.file_path) {
    throw Object.assign(new Error('Magic Hour returned an unsafe or invalid image upload target.'), { status: 502 });
  }

  let response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: bytes
    });
  } catch (error) {
    throw Object.assign(new Error(`Could not upload the reference image to Magic Hour: ${error.message}`), { status: 502 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Magic Hour image upload failed (HTTP ${response.status}).`), { status: 502 });
  }
  return upload.file_path;
}

async function create({ prompt, image, duration = 6, aspectRatio = '16:9' }) {
  const body = {
    name: `Whiterose video ${new Date().toISOString()}`,
    model: 'minimax-h3',
    resolution: '480p',
    end_seconds: duration,
    aspect_ratio: aspectRatio,
    style: { prompt }
  };
  if (image) {
    body.assets = { image_file_path: await uploadImage(image) };
  }

  const result = await providerRequest(image ? '/v1/image-to-video' : '/v1/text-to-video', {
    method: 'POST',
    body
  });
  if (typeof result?.id !== 'string' || !result.id) {
    throw Object.assign(new Error('Magic Hour returned an invalid video-project response.'), { status: 502 });
  }
  const status = result.status === undefined ? 'QUEUED' : STATUS_MAP.get(result.status);
  if (!status) {
    throw Object.assign(new Error(`Magic Hour returned an unknown video status: ${result.status}.`), { status: 502 });
  }
  return {
    taskId: result.id,
    status,
    error: result.error?.message || null
  };
}

async function getTask(projectId) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) {
    throw Object.assign(new Error('Invalid Magic Hour project ID.'), { status: 400 });
  }
  const result = await providerRequest(`/v1/video-projects/${encodeURIComponent(projectId)}`);
  if (typeof result?.status !== 'string') {
    throw Object.assign(new Error('Magic Hour returned an invalid project status.'), { status: 502 });
  }
  const status = STATUS_MAP.get(result.status);
  if (!status) {
    throw Object.assign(new Error(`Magic Hour returned an unknown video status: ${result.status}.`), { status: 502 });
  }
  const download = Array.isArray(result.downloads)
    ? result.downloads.find(item => typeof item?.url === 'string' && /^https:\/\//i.test(item.url))
    : null;
  if (status === 'COMPLETED' && !download) {
    throw Object.assign(new Error('Magic Hour marked the project complete but returned no download URL.'), { status: 502 });
  }
  return {
    taskId: result.id || projectId,
    status,
    generatedUrl: download?.url || null,
    error: result.error?.message || null,
    creditsCharged: Number.isFinite(result.credits_charged) ? result.credits_charged : null
  };
}

module.exports = {
  apiKey,
  create,
  getTask,
  isTerminal: status => TERMINAL_STATUSES.has(status)
};
