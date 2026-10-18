const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PROMPT_BLOCKLIST = /deepfake|impersonat|pretend to be|as (?:the )?(?:president|prime minister)|nude|naked|sexual|\bminor\b/i;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function validateVideoRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('A JSON request body is required.');
  }
  if (body.consent !== true) throw badRequest('Confirm that you have the rights to the prompt and reference image.');

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 10 || prompt.length > 2000) {
    throw badRequest('Prompt must be between 10 and 2000 characters.');
  }
  if (PROMPT_BLOCKLIST.test(prompt)) {
    throw badRequest('This prompt cannot be generated. Use a fictional, non-sexual subject and do not impersonate real people.');
  }

  const count = body.count === undefined ? 2 : Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > 2) {
    throw badRequest('Choose 1 or 2 video variations.');
  }

  const providerId = body.providerId === undefined ? 'magic-hour' : body.providerId;
  if (!['magic-hour', 'google-gemini', 'higgsfield-video'].includes(providerId)) {
    throw badRequest('Select Magic Hour, Google Gemini, or Higgsfield for API video generation. Google Flow uses prompt handoff.');
  }
  if (body.confirmCost !== true) {
    throw badRequest('Confirm that this generation may use paid provider credits.');
  }
  const mode = body.mode === undefined ? 't2v' : body.mode;
  if (mode !== 't2v' && mode !== 'i2v') throw badRequest('Choose text-to-video or image-to-video.');
  const durationSeconds = body.duration === undefined ? 6 : Number(body.duration);
  if (!Number.isInteger(durationSeconds)) {
    throw badRequest('Video duration must be a whole number of seconds.');
  }
  if (providerId === 'google-gemini' && durationSeconds !== 8) {
    throw badRequest('Gemini Veo 3.1 generates 8-second clips.');
  }
  if (providerId === 'higgsfield-video' && (durationSeconds < 4 || durationSeconds > 30)) {
    throw badRequest('Higgsfield Seedance 2.5 clips must be between 4 and 30 seconds.');
  }
  if (providerId === 'higgsfield-video' && mode !== 't2v') {
    throw badRequest('Higgsfield Seedance 2.5 currently supports text-to-video only in this app.');
  }
  if (providerId === 'magic-hour' && (durationSeconds < 3 || durationSeconds > 30)) {
    throw badRequest('Magic Hour MiniMax H3 clips must be between 3 and 30 seconds.');
  }
  const aspectRatio = body.aspectRatio === undefined ? '16:9' : body.aspectRatio;
  if (!['16:9', '9:16', ...(['magic-hour', 'higgsfield-video'].includes(providerId) ? ['1:1'] : [])].includes(aspectRatio)) {
    throw badRequest('Aspect ratio must be 16:9, 9:16, or 1:1.');
  }
  const language = body.language === undefined ? 'English' : body.language;
  if (!['English', 'Hindi', 'Hinglish', 'Marathi'].includes(language)) {
    throw badRequest('Choose a supported video language.');
  }
  const image = body.image === undefined ? null : body.image;
  if (image !== null) {
    const match = typeof image === 'string' && /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image);
    if (!match) throw badRequest('Reference image must be a JPG or PNG image.');
    const imageBytes = Buffer.from(match[2], 'base64');
    if (!imageBytes.length || imageBytes.length > MAX_IMAGE_BYTES) {
      throw badRequest('Reference image must be no larger than 20 MB.');
    }
  }
  if (mode === 'i2v' && !image) throw badRequest('Add a reference image for image-to-video generation.');
  if (mode === 't2v' && image) throw badRequest('Remove the reference image or select Image to video.');

  return { prompt, count, providerId, mode, image, durationSeconds, aspectRatio, language };
}

module.exports = { validateVideoRequest };
