// Provider adapters use server-side credentials and expose configuration status only.
const magicHour = require('./magichour');
const gemini = require('./gemini');
const higgsfield = require('./higgsfield');
const openaiImage = require('./openai-image');
const list = [
  { id: 'openai-image', name: 'OpenAI · GPT Image 2.5 Flare', implemented: true },
  { id: 'higgsfield-video', name: 'Higgsfield · Seedance 2.5 video', implemented: true },
  { id: 'higgsfield-image', name: 'Higgsfield · SOUL image', implemented: true },
  { id: 'magic-hour', name: 'Magic Hour', implemented: true },
  { id: 'google-gemini', name: 'Google Gemini · Veo 3.1', implemented: true },
  { id: 'google-gemini-image', name: 'Google Gemini · Nano Banana image', implemented: true },
  { id: 'google-flow', name: 'Google Flow', implemented: false, handoff: true },
  { id: 'bing-image-creator', name: 'Bing Image Creator', implemented: false, handoff: true },
  { id: 'chatgpt-image', name: 'ChatGPT image generation', implemented: false, handoff: true },
  { id: 'leonardo-ai', name: 'Leonardo.ai', implemented: false, handoff: true },
  { id: 'huggingface-spaces', name: 'Hugging Face Spaces', implemented: false, handoff: true }
];
module.exports = {
  magicHour,
  gemini,
  higgsfield,
  openaiImage,
  status: () => list.map(p => ({
    id: p.id,
    name: p.name,
    configured: p.handoff ? false : p.id === 'magic-hour' ? !!magicHour.apiKey() :
      p.id === 'openai-image' ? !!openaiImage.apiKey() :
        p.id.startsWith('google-gemini') ? !!gemini.apiKey() :
          p.id.startsWith('higgsfield') ? !!higgsfield.apiKey() : false,
    implemented: p.implemented,
    handoff: p.handoff || false
  }))
};
