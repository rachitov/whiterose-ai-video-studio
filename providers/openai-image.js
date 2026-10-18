const BASE_URL = 'https://api.openai.com/v1';
const MODEL = 'gpt-image-2.5-flare';
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

function apiKey() {
  return process.env.OPENAI_API_KEY || '';
}

async function createImage({ prompt, aspectRatio = '1:1' }) {
  const key = apiKey();
  if (!key) {
    throw Object.assign(new Error('Set OPENAI_API_KEY in the server .env file to enable OpenAI image generation.'), { status: 503 });
  }
  const sizes = { '1:1': '1024x1024', '16:9': '1536x1024', '9:16': '1024x1536' };
  const size = sizes[aspectRatio];
  if (!size) {
    throw Object.assign(new Error('Choose a square, landscape, or portrait image.'), { status: 400 });
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        size,
        quality: 'medium',
        output_format: 'png',
        n: 1
      })
    });
  } catch (error) {
    throw Object.assign(new Error(`Could not reach OpenAI image API: ${error.message}`), { status: 502 });
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const apiMessage = result?.error?.message || result?.message;
    const message = typeof apiMessage === 'string'
      ? `OpenAI image API error: ${apiMessage}`
      : 'OpenAI image generation failed. Check the API key, project access, and billing.';
    throw Object.assign(new Error(message), {
      status: response.status === 401 || response.status === 403 ? 502 : response.status
    });
  }

  const imageData = result?.data?.[0]?.b64_json;
  if (typeof imageData !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageData) || imageData.length % 4 === 1) {
    throw Object.assign(new Error('OpenAI completed the image request but returned no valid PNG data.'), { status: 502 });
  }
  const bytes = Buffer.from(imageData, 'base64');
  if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) {
    throw Object.assign(new Error('OpenAI returned an image larger than the app’s 20 MB output limit.'), { status: 502 });
  }
  return { data: imageData, mimeType: 'image/png' };
}

module.exports = { apiKey, createImage };
