const MAX_GENERATION_PROMPT_LENGTH = 20000;
const SCENE_FIELDS = [
  ['v', 'Visual action'],
  ['mo', 'Camera and motion'],
  ['na', 'Narration or dialogue'],
  ['cp', 'On-screen captions'],
  ['so', 'Sound']
];

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function cleanField(value, label) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2000) {
    throw badRequest(`${label} must be text no longer than 2000 characters.`);
  }
  return value.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();
}

function buildVideoPrompt({ prompt, scene, duration, aspectRatio, language, mode }) {
  if (typeof prompt !== 'string' || prompt.trim().length < 10 || prompt.length > 2000) {
    throw badRequest('Prompt must be between 10 and 2000 characters.');
  }
  if (scene !== undefined && scene !== null && (typeof scene !== 'object' || Array.isArray(scene))) {
    throw badRequest('Storyboard scene must be an object.');
  }
  const source = scene || {};
  const lines = [
    `Creative brief: ${prompt.trim()}`,
    `Format: ${mode === 'i2v' ? 'Image-to-video using the supplied reference image' : 'Text-to-video'}`,
    `Target clip length: ${duration} seconds`,
    `Aspect ratio: ${aspectRatio}`,
    `Language for spoken dialogue and captions: ${language}`
  ];

  for (const [field, label] of SCENE_FIELDS) {
    const value = cleanField(source[field], label);
    if (value) lines.push(`${label}: ${value}`);
  }
  const motionDirection = mode === 'i2v'
    ? 'Treat the supplied image as the approved opening frame. Describe only the requested change over time; preserve its subject, identity, composition, and visual style.'
    : 'Establish the subject promptly, show one readable action with a clear beginning and ending, and fit its timing to the requested clip length.';
  lines.push(
    'Direction: Create one visually coherent clip that follows the creative brief and scene direction. ' +
    `${motionDirection} Keep the main subject and visual style consistent throughout. ` +
    'Separate subject motion from camera motion and keep both purposeful. Use clear composition. ' +
    'Do not add unrequested text, logos, claims, dialogue, cuts, or scene changes.'
  );

  const generationPrompt = lines.join('\n');
  if (generationPrompt.length > MAX_GENERATION_PROMPT_LENGTH) {
    throw badRequest('Directed video prompt is too long. Shorten the storyboard details and try again.');
  }
  return generationPrompt;
}

module.exports = { buildVideoPrompt };
