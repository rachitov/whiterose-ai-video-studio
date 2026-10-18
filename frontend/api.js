const API = window.WR_API || '';
const _save = save, _renderHist = renderHist;
const authPanel = document.getElementById('authPanel');
const studioApp = document.getElementById('studioApp');
const authForm = document.getElementById('authForm');
let registering = false;
let currentUser = null;
let magicHourConfigured = false;
let geminiConfigured = false;
let higgsfieldConfigured = false;
let geminiImageConfigured = false;
let openaiImageConfigured = false;

function readSession() {
  try { return JSON.parse(localStorage.getItem('wr_session') || 'null'); }
  catch { return null; }
}
function storeSession(session) {
  if (session) localStorage.setItem('wr_session', JSON.stringify(session));
  else localStorage.removeItem('wr_session');
}
function showAuthMessage(message) {
  document.getElementById('authMessage').textContent = message;
}
function setAppStatus(message, isError = false) {
  const node = document.getElementById('syncStatus');
  node.textContent = message;
  node.className = isError ? 'err' : 'hint';
}
async function request(path, options = {}, retry = true) {
  const session = readSession();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (session && session.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch(API + path, { ...options, headers });
  const canRefresh = !['/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(path);
  if (response.status === 401 && retry && canRefresh && session && session.refresh_token) {
    const refreshed = await fetch(API + '/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const nextSession = await refreshed.json();
    if (refreshed.ok && nextSession.access_token) {
      storeSession(nextSession);
      return request(path, options, false);
    }
    storeSession(null);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.msg || 'Request failed.');
  return result;
}
function showStudio(user) {
  currentUser = user;
  window.WR_USER_ID = user.id;
  authPanel.hidden = true;
  studioApp.hidden = false;
  document.getElementById('signedInAs').textContent = user.is_anonymous ? 'Demo account' : (user.email || 'Signed in');
  showAuthMessage('');
  setAppStatus(user.is_anonymous ? 'Demo account connected. Projects save to Supabase.' : '');
}
function showSignIn(message = '') {
  currentUser = null;
  delete window.WR_USER_ID;
  studioApp.hidden = true;
  authPanel.hidden = false;
  showAuthMessage(message);
}

function imageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read reference image: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
function renderFreeIllustration(prompt, aspectRatio, container) {
  const svg = window.WRImageArt.create(prompt, aspectRatio);
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const card = document.createElement('article');
  card.className = 'pn';
  const image = document.createElement('img');
  image.src = objectUrl;
  image.alt = prompt;
  image.style.width = '100%';
  image.style.maxHeight = '640px';
  image.style.objectFit = 'contain';
  image.style.borderRadius = '10px';
  const download = document.createElement('a');
  download.className = 'btn sm';
  download.href = objectUrl;
  download.download = 'whiterose-illustration.svg';
  download.textContent = 'Download SVG';
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'Created in this browser. Prompt was not sent to any service.';
  card.append(image, download, note);
  container.prepend(card);
}
function statusLabel(status) {
  return ({
    SUBMITTING: 'Submitting',
    QUEUED: 'Queued',
    CREATED: 'Queued',
    IN_PROGRESS: 'Generating',
    COMPLETED: 'Complete',
    FAILED: 'Failed'
  })[status] || status;
}
function addReviewChecklist(card, title, items) {
  const details = document.createElement('details');
  details.style.marginTop = '12px';
  const summary = document.createElement('summary');
  summary.textContent = title;
  const list = document.createElement('ul');
  list.className = 'hint';
  for (const item of items) {
    const entry = document.createElement('li');
    entry.textContent = item;
    list.append(entry);
  }
  details.append(summary, list);
  card.append(details);
}
function makeJobCard(job) {
  if (job.providerId.endsWith('-image')) return makeImageJobCard(job);
  const card = document.createElement('article');
  card.className = 'pn';
  card.dataset.jobId = job.id;
  const heading = document.createElement('h3');
  heading.textContent = `Video variation · ${statusLabel(job.status)}`;
  heading.style.margin = '0 0 6px';
  card.append(heading);
  const prompt = document.createElement('p');
  prompt.className = 'hint';
  prompt.textContent = job.prompt;
  card.append(prompt);
  if (job.lastError) {
    const error = document.createElement('p');
    error.className = 'err';
    error.textContent = job.lastError;
    card.append(error);
  }
  if (job.generatedUrl) {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.style.width = '100%';
    video.style.maxHeight = '520px';
    card.append(video);
    const download = document.createElement('a');
    download.className = 'btn sm';
    if (job.providerId !== 'google-gemini') {
      video.src = job.generatedUrl;
      download.href = job.generatedUrl;
      download.target = '_blank';
      download.rel = 'noopener noreferrer';
    } else {
      download.href = '#';
      download.onclick = event => event.preventDefault();
      loadAuthenticatedVideo(job.generatedUrl, video, download, card);
    }
    download.textContent = 'Open or download video';
    card.append(download);
    const expiry = document.createElement('p');
    expiry.className = 'hint';
    expiry.textContent = job.providerId === 'higgsfield-video'
      ? 'Higgsfield output is retained for a limited time; download the video promptly.'
      : 'Provider output links expire after about 30 minutes; download the video promptly.';
    card.append(expiry);
    addReviewChecklist(card, 'Review before using this video', [
      'Check the opening and ending, requested action, and camera movement.',
      'Look for flicker, identity or product changes, warping, and unexpected cuts.',
      'Confirm the actual duration, aspect ratio, captions, and audio match the brief.'
    ]);
  }
  return card;
}
function makeImageJobCard(job) {
  const card = document.createElement('article');
  card.className = 'pn';
  card.dataset.jobId = job.id;
  const heading = document.createElement('h3');
  heading.textContent = `Generated image · ${statusLabel(job.status)}`;
  heading.style.margin = '0 0 6px';
  card.append(heading);
  const prompt = document.createElement('p');
  prompt.className = 'hint';
  prompt.textContent = job.prompt;
  card.append(prompt);
  if (job.lastError) {
    const error = document.createElement('p');
    error.className = 'err';
    error.textContent = job.lastError;
    card.append(error);
  }
  if (job.generatedUrl) {
    const image = document.createElement('img');
    image.alt = job.prompt;
    image.style.width = '100%';
    image.style.maxHeight = '640px';
    image.style.objectFit = 'contain';
    image.style.borderRadius = '10px';
    card.append(image);
    const download = document.createElement('a');
    download.className = 'btn sm';
    download.href = '#';
    download.textContent = 'Download image';
    download.onclick = event => event.preventDefault();
    card.append(download);
    if (job.providerId === 'higgsfield-image') {
      image.src = job.generatedUrl;
      download.href = job.generatedUrl;
      download.target = '_blank';
      download.rel = 'noopener noreferrer';
    } else {
      loadAuthenticatedImage(job.generatedUrl, image, download, card);
    }
    addReviewChecklist(card, 'Review before using this image', [
      'Check the crop, composition, and required subject or product details.',
      'Inspect text, logos, anatomy, and geometry at full size.',
      'Look for unwanted lettering, marks, duplicates, or artifacts.'
    ]);
  }
  return card;
}
async function loadAuthenticatedVideo(url, video, download, card) {
  const fetchVideo = () => {
    const session = readSession();
    const headers = {};
    if (session && session.access_token) headers.Authorization = 'Bearer ' + session.access_token;
    return fetch(API + url, { headers });
  };
  try {
    let response = await fetchVideo();
    if (response.status === 401) {
      await request('/api/auth/user');
      response = await fetchVideo();
    }
    if (!response.ok) throw new Error('Could not load the generated video.');
    const objectUrl = URL.createObjectURL(await response.blob());
    if (!card.isConnected) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    video.src = objectUrl;
    download.href = objectUrl;
    const disposition = response.headers.get('Content-Disposition') || '';
    download.download = /filename="([A-Za-z0-9_.-]+)"/.exec(disposition)?.[1] || 'whiterose-video.mp4';
    download.target = '';
    download.rel = '';
  } catch (error) {
    if (!card.isConnected) return;
    const message = document.createElement('p');
    message.className = 'err';
    message.textContent = 'Could not load video: ' + error.message;
    card.append(message);
  }
}
async function loadAuthenticatedImage(url, image, download, card) {
  try {
    const session = readSession();
    const headers = {};
    if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
    let response = await fetch(API + url, { headers });
    if (response.status === 401) {
      await request('/api/auth/user');
      const refreshed = readSession();
      response = await fetch(API + url, {
        headers: refreshed?.access_token ? { Authorization: 'Bearer ' + refreshed.access_token } : {}
      });
    }
    if (!response.ok) throw new Error('Could not load the generated image.');
    const objectUrl = URL.createObjectURL(await response.blob());
    if (!card.isConnected) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    image.src = objectUrl;
    const disposition = response.headers.get('Content-Disposition') || '';
    download.download = /filename="([A-Za-z0-9_.-]+)"/.exec(disposition)?.[1] || 'whiterose-image.png';
    download.href = objectUrl;
    download.onclick = null;
  } catch (error) {
    if (!card.isConnected) return;
    const message = document.createElement('p');
    message.className = 'err';
    message.textContent = 'Could not load image: ' + error.message;
    card.append(message);
  }
}
function showJob(container, job) {
  let card = [...container.querySelectorAll('[data-job-id]')].find(node => node.dataset.jobId === job.id);
  const next = makeJobCard(job);
  if (card) {
    const video = card.querySelector('video');
    if (video?.src.startsWith('blob:')) URL.revokeObjectURL(video.src);
    card.replaceWith(next);
  }
  else container.prepend(next);
  return next;
}
function showImageJob(container, job) {
  let card = [...container.querySelectorAll('[data-job-id]')].find(node => node.dataset.jobId === job.id);
  const next = makeImageJobCard(job);
  if (card) {
    const image = card.querySelector('img');
    if (image?.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
    card.replaceWith(next);
  }
  else container.prepend(next);
  return next;
}
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function pollJob(job, container) {
  let current = job;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (current.status === 'COMPLETED' || current.status === 'FAILED') return;
    await wait(10000);
    try {
      current = (await request(`/api/jobs/${encodeURIComponent(current.id)}`)).job;
      showJob(container, current);
    } catch (error) {
      const card = [...container.querySelectorAll('[data-job-id]')].find(node => node.dataset.jobId === current.id);
      if (card) {
        let message = card.querySelector('[data-poll-error]');
        if (!message) {
          message = document.createElement('p');
          message.className = 'err';
          message.dataset.pollError = 'true';
          card.append(message);
        }
        message.textContent = `Could not refresh video status; retrying: ${error.message}`;
      }
    }
  }
  const card = [...container.querySelectorAll('[data-job-id]')].find(node => node.dataset.jobId === current.id);
  if (card) {
    const message = document.createElement('p');
    message.className = 'hint';
    message.textContent = 'Still processing. You can check this job again from Projects.';
    card.append(message);
  }
}
function bindVideoGeneration() {
  const button = document.getElementById('runVideo');
  if (!button) return;
  const previewButton = document.getElementById('previewVideoPrompt');
  const promptPreview = document.getElementById('videoPromptPreview');
  const providerSelect = document.getElementById('videoProvider');
  const providerHelp = document.getElementById('providerHelp');
  const providerLimits = document.getElementById('providerLimits');
  const durationSelect = document.getElementById('videoDuration');
  const aspectSelect = document.getElementById('ratio');
  const costApproval = document.getElementById('ok');
  const costApprovalLabel = document.getElementById('costApprovalLabel');
  const rightsApproval = document.getElementById('rights');
  const status = document.getElementById('videoProviderStatus');
  const updateButton = () => {
    const selected = providerSelect.value;
    const configured = selected === 'magic-hour' ? magicHourConfigured :
      selected === 'google-gemini' ? geminiConfigured :
        selected === 'higgsfield-video' ? higgsfieldConfigured : true;
    costApprovalLabel.hidden = false;
    button.disabled = !configured || !costApproval.checked ||
      !rightsApproval.checked || (selected === 'higgsfield-video' && mode().id !== 't2v');
  };
  const updateProvider = () => {
    const selected = providerSelect.value;
    const squareAspect = [...aspectSelect.options].find(option => option.value === '1:1');
    if (selected === 'google-gemini') {
      durationSelect.innerHTML = '<option value="8">8 seconds</option>';
      if (squareAspect) squareAspect.disabled = true;
      if (aspectSelect.value === '1:1') aspectSelect.value = '16:9';
      providerHelp.textContent = 'Uses Google Gemini API with Veo 3.1. Requires GEMINI_API_KEY; output is 8 seconds at 720p.';
      providerLimits.textContent = 'Veo 3.1 currently generates 8-second clips in 16:9 or 9:16. Gemini API availability and billing depend on your Google account.';
      status.textContent = geminiConfigured
        ? 'Gemini API key detected; quota and billing are not checked. Your project previously reported a quota limit.'
        : 'Set GEMINI_API_KEY in the server .env file, then restart the app.';
      status.className = geminiConfigured ? 'hint' : 'err';
    } else if (selected === 'higgsfield-video') {
      durationSelect.innerHTML = '<option value="4">4 seconds</option><option value="5">5 seconds</option><option value="6">6 seconds</option><option value="8">8 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option>';
      if (squareAspect) squareAspect.disabled = false;
      providerHelp.textContent = 'Higgsfield Seedance 2.5 supports prompt-to-video only in this app.';
      providerLimits.textContent = 'Seedance 2.5 generates 4–30 second clips. The app requests 480p; actual availability and credit cost depend on your Higgsfield account.';
      status.textContent = higgsfieldConfigured
        ? (mode().id === 't2v' ? 'Higgsfield API credentials detected. Credits and model access are not checked.' : 'Higgsfield text-to-video does not accept a reference image here; switch to Text to video.')
        : 'Set HIGGSFIELD_API_KEY=KEY_ID:KEY_SECRET in the server .env file, then restart the app.';
      status.className = higgsfieldConfigured ? 'hint' : 'err';
    } else {
      if (!durationSelect.querySelector('option[value="6"]')) {
        durationSelect.innerHTML = '<option value="6">6 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option>';
      }
      if (squareAspect) squareAspect.disabled = false;
      if (selected === 'google-flow') {
        providerHelp.textContent = 'Google Flow has no public generation API here. We will copy your prompt and open Flow for you to submit there.';
        providerLimits.textContent = 'Google Flow opens separately. Attach any reference image there manually; video jobs will not be tracked in Whiterose.';
        status.textContent = 'Flow handoff is ready. Confirm paid use and rights before opening Flow.';
        status.className = 'hint';
      } else {
        providerHelp.textContent = 'Magic Hour uses its connected API key.';
        providerLimits.textContent = 'Magic Hour MiniMax H3 generates clips from 3 to 30 seconds. Reference images are uploaded to Magic Hour before image-to-video generation.';
        status.textContent = magicHourConfigured
          ? 'Magic Hour API key detected; key validity and available credits are not checked. Generation may use provider credits.'
          : 'Set MAGIC_HOUR_API_KEY in the server .env file, then restart the app.';
        status.className = magicHourConfigured ? 'hint' : 'err';
      }
    }
    updateButton();
  };
  costApproval.onchange = updateButton;
  rightsApproval.onchange = updateButton;
  providerSelect.onchange = updateProvider;
  document.getElementById('mode').addEventListener('change', updateProvider);
  previewButton.onclick = async () => {
    previewButton.disabled = true;
    previewButton.textContent = 'Building prompt…';
    promptPreview.hidden = true;
    try {
      const result = await request('/api/video/prompt-preview', {
        method: 'POST',
        body: JSON.stringify({
          prompt: document.getElementById('prompt').value.trim(),
          duration: Number(document.getElementById('videoDuration').value),
          aspectRatio: document.getElementById('ratio').value,
          language: document.getElementById('lang').value,
          mode: mode().id
        })
      });
      promptPreview.value = result.prompt;
      promptPreview.hidden = false;
    } catch (error) {
      status.textContent = error.message;
      status.className = 'err';
    } finally {
      previewButton.disabled = false;
      previewButton.textContent = 'Preview prompt';
    }
  };
  fetch(API + '/api/providers').then(async response => {
    if (!response.ok) throw new Error('Could not load provider status.');
    const providers = await response.json();
    magicHourConfigured = !!providers.find(item => item.id === 'magic-hour')?.configured;
    geminiConfigured = !!providers.find(item => item.id === 'google-gemini')?.configured;
    higgsfieldConfigured = !!providers.find(item => item.id === 'higgsfield-video')?.configured;
    updateProvider();
  }).catch(error => {
    status.textContent = error.message;
    status.className = 'err';
  });

  button.onclick = async () => {
    const prompt = document.getElementById('prompt').value.trim();
    const modeId = mode().id;
    const providerId = providerSelect.value;
    if (!['t2v', 'i2v'].includes(modeId)) {
      status.textContent = 'Choose Text to video or Image to video.';
      status.className = 'err';
      return;
    }
    if (prompt.length < 10 || prompt.length > 2000) {
      status.textContent = 'Video prompt must be between 10 and 2000 characters.';
      status.className = 'err';
      return;
    }
    if (!costApproval.checked || !rightsApproval.checked) {
      status.textContent = 'Confirm paid usage and your rights before continuing.';
      status.className = 'err';
      return;
    }

    if (providerId === 'google-flow') {
      const flowTab = window.open('https://flow.google/', '_blank');
      if (flowTab) flowTab.opener = null;
      button.disabled = true;
      button.textContent = 'Preparing Flow prompt…';
      try {
        const result = await request('/api/video/prompt-preview', {
          method: 'POST',
          body: JSON.stringify({
            prompt,
            duration: 8,
            aspectRatio: aspectSelect.value === '1:1' ? '16:9' : aspectSelect.value,
            language: document.getElementById('lang').value,
            mode: modeId
          })
        });
        promptPreview.value = result.prompt;
        promptPreview.hidden = false;
        try {
          await navigator.clipboard.writeText(result.prompt);
          status.textContent = flowTab
            ? 'Prompt copied. Flow is open in a new tab; paste it there and attach any reference image manually.'
            : 'Prompt copied. Open flow.google.com, paste it there and attach any reference image manually.';
          status.className = 'hint';
        } catch {
          status.textContent = flowTab
            ? 'Flow is open. Copy the prompt shown below and paste it there; attach any reference image manually.'
            : 'Copy the prompt shown below into flow.google.com; attach any reference image manually.';
          status.className = 'hint';
        }
      } catch (error) {
        if (flowTab) flowTab.close();
        status.textContent = error.message;
        status.className = 'err';
      } finally {
        button.textContent = 'Generate video';
        updateButton();
      }
      return;
    }

    let image;
    if (modeId === 'i2v') {
      const reference = (S.files.image || [])[0];
      if (!reference || !reference.file) {
        status.textContent = 'Add a reference image for Image to video.';
        status.className = 'err';
        return;
      }
      const ratio = reference.width / reference.height;
      if (reference.file.size > 20 * 1024 * 1024 || Math.min(reference.width, reference.height) <= 300 || ratio <= 0.4 || ratio >= 2.5) {
        status.textContent = 'Reference images must be JPG or PNG, at most 20 MB, over 300 pixels on the short side, and have an aspect ratio between 2:5 and 5:2.';
        status.className = 'err';
        return;
      }
      if (!['image/jpeg', 'image/png'].includes(reference.file.type)) {
        status.textContent = 'Video provider reference images must be JPG or PNG.';
        status.className = 'err';
        return;
      }
      try {
        image = await imageAsDataUrl(reference.file);
      } catch (error) {
        status.textContent = error.message;
        status.className = 'err';
        return;
      }
    }

    button.disabled = true;
    button.textContent = 'Starting video…';
    status.textContent = 'Submitting generation request…';
    status.className = 'hint';
    try {
      const result = await request('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          providerId,
          mode: modeId,
          image,
          language: document.getElementById('lang').value,
          duration: Number(document.getElementById('videoDuration').value),
          aspectRatio: document.getElementById('ratio').value,
          count: Number(document.getElementById('variations').value),
          confirmCost: costApproval.checked,
          consent: rightsApproval.checked
        })
      });
      const container = document.getElementById('generationJobs');
      result.jobs.forEach(job => showJob(container, job));
      if (result.warning) {
        status.textContent = result.warning;
        status.className = 'err';
      } else {
        const providerName = providerId === 'google-gemini' ? 'Gemini Veo' :
          providerId === 'higgsfield-video' ? 'Higgsfield Seedance' : 'Magic Hour';
        status.textContent = `${providerName} job started. Status will update here; completed jobs are also listed under Projects.`;
        status.className = 'hint';
      }
      result.jobs.forEach(job => pollJob(job, container));
    } catch (error) {
      status.textContent = error.message;
      status.className = 'err';
    } finally {
      button.textContent = 'Generate video';
      updateButton();
    }
  };
  updateProvider();
  document.getElementById('save').onclick = () => window.save();
}
async function pollImageJob(job, container) {
  let current = job;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (current.status === 'COMPLETED' || current.status === 'FAILED') return;
    await wait(5000);
    try {
      current = (await request(`/api/images/${encodeURIComponent(current.id)}`)).job;
      showImageJob(container, current);
    } catch (error) {
      const card = [...container.querySelectorAll('[data-job-id]')].find(node => node.dataset.jobId === current.id);
      if (card) {
        let message = card.querySelector('[data-poll-error]');
        if (!message) {
          message = document.createElement('p');
          message.className = 'err';
          message.dataset.pollError = 'true';
          card.append(message);
        }
        message.textContent = `Could not refresh image status; retrying: ${error.message}`;
      }
    }
  }
  const card = [...container.querySelectorAll('[data-job-id]')].find(node => node.dataset.jobId === current.id);
  if (card) {
    const message = document.createElement('p');
    message.className = 'hint';
    message.textContent = 'Still processing. You can check this job again from Projects.';
    card.append(message);
  }
}
function bindImageGeneration() {
  const button = document.getElementById('runImage');
  const promptInput = document.getElementById('imagePrompt');
  const providerSelect = document.getElementById('imageProvider');
  const costApproval = document.getElementById('imageCostApproval');
  const costLabel = document.getElementById('imageCostApprovalLabel');
  const rights = document.getElementById('imageRights');
  const rightsLabel = document.getElementById('imageRightsLabel');
  const status = document.getElementById('imageProviderStatus');
  const container = document.getElementById('imageGenerationJobs');
  const imageTemplates = {
    portrait: {
      prompt: 'Create a polished editorial portrait of a confident professional woman in a modern tailored outfit, poised in a softly lit contemporary studio. Warm late-afternoon key light, subtle plum and rose backdrop, natural skin texture, refined fashion-magazine photography, elegant composition, realistic details, no text or logos.',
      aspectRatio: '9:16'
    },
    product: {
      prompt: 'Create a premium studio campaign image of an elegant glass skincare bottle on a dark teal stone pedestal. Warm champagne-gold rim light, soft reflections, subtle botanical shadows, rich deep-green and bronze palette, luxury product photography, crisp glass detail, balanced negative space, no readable text, labels, or logos.',
      aspectRatio: '1:1'
    },
    travel: {
      prompt: 'Create a cinematic travel editorial of a quiet mountain lake at sunset, layered violet peaks reflected in calm water, glowing apricot sky, a small winding path leading toward the horizon, dreamy but believable atmosphere, painterly photographic detail, clean composition, no text or logos.',
      aspectRatio: '16:9'
    },
    food: {
      prompt: 'Create a cozy editorial food photograph of a freshly baked fruit tart on a rustic wooden table, golden crust, seasonal berries and soft cream, warm window light, natural linen and subtle greenery, inviting artisanal cafe mood, overhead three-quarter composition, appetizing realistic detail, no text or logos.',
      aspectRatio: '1:1'
    }
  };
  if (!button || !promptInput || !providerSelect || !costApproval || !rights ||
      !costLabel || !rightsLabel || !status || !container) return;
  const updateButton = () => {
    const providerId = providerSelect.value;
    const local = providerId === 'browser-svg';
    const configured = providerId === 'openai-image' ? openaiImageConfigured :
      providerId === 'google-gemini-image' ? geminiImageConfigured :
        providerId === 'higgsfield-image' ? higgsfieldConfigured : true;
    costLabel.hidden = local;
    rightsLabel.hidden = local;
    button.textContent = local ? 'Create free illustration' : 'Generate AI image';
    button.disabled = !configured || (!local && (!costApproval.checked || !rights.checked));
  };
  const updateProvider = () => {
    const providerId = providerSelect.value;
    if (providerId === 'browser-svg') {
      status.textContent = 'Illustration is generated in this browser; prompt is not sent anywhere.';
      status.className = 'hint';
    } else if (providerId === 'openai-image') {
      status.textContent = openaiImageConfigured
        ? 'OpenAI API key detected. Image generation can incur API charges; key validity and available balance are not checked.'
        : 'Set OPENAI_API_KEY in the server .env file, then restart the app.';
      status.className = openaiImageConfigured ? 'hint' : 'err';
    } else if (providerId === 'google-gemini-image') {
      status.textContent = geminiImageConfigured
        ? 'Nano Banana API key detected. Google quota and billing are not checked.'
        : 'Set GEMINI_API_KEY in the server .env file, then restart the app.';
      status.className = geminiImageConfigured ? 'hint' : 'err';
    } else {
      status.textContent = higgsfieldConfigured
        ? 'Higgsfield API credentials detected. Credits and model access are not checked.'
        : 'Set HIGGSFIELD_API_KEY=KEY_ID:KEY_SECRET in the server .env file, then restart the app.';
      status.className = higgsfieldConfigured ? 'hint' : 'err';
    }
    updateButton();
  };
  costApproval.onchange = updateButton;
  rights.onchange = updateButton;
  providerSelect.onchange = updateProvider;
  document.querySelectorAll('[data-image-template]').forEach(template => {
    template.onclick = () => {
      const selection = imageTemplates[template.dataset.imageTemplate];
      if (!selection) return;
      promptInput.value = selection.prompt;
      document.getElementById('imageAspectRatio').value = selection.aspectRatio;
      promptInput.focus();
      status.textContent = 'Template prompt added. Edit it as needed before generating.';
      status.className = 'hint';
    };
  });
  fetch(API + '/api/providers').then(async response => {
    if (!response.ok) throw new Error('Could not load image provider status.');
    const providers = await response.json();
    openaiImageConfigured = !!providers.find(item => item.id === 'openai-image')?.configured;
    geminiImageConfigured = !!providers.find(item => item.id === 'google-gemini-image')?.configured;
    higgsfieldConfigured = !!providers.find(item => item.id === 'higgsfield-image')?.configured;
    updateProvider();
  }).catch(error => {
    status.textContent = error.message;
    status.className = 'err';
  });
  button.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (prompt.length < 10 || prompt.length > 2000) {
      status.textContent = 'Image prompt must be between 10 and 2000 characters.';
      status.className = 'err';
      return;
    }
    const providerId = providerSelect.value;
    if (providerId === 'browser-svg') {
      try {
        renderFreeIllustration(prompt, document.getElementById('imageAspectRatio').value, container);
        status.textContent = 'Illustration created locally; no API credits used.';
        status.className = 'hint';
      } catch (error) {
        status.textContent = error.message;
        status.className = 'err';
      }
      return;
    }
    if (!costApproval.checked || !rights.checked) {
      status.textContent = 'Confirm possible paid usage and that you have the rights to use this prompt.';
      status.className = 'err';
      return;
    }
    button.disabled = true;
    button.textContent = 'Generating image…';
    const providerName = providerId === 'openai-image' ? 'OpenAI' :
      providerId === 'google-gemini-image' ? 'Google Gemini' : 'Higgsfield';
    status.textContent = `Submitting image request to ${providerName}…`;
    status.className = 'hint';
    try {
      const result = await request('/api/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          providerId,
          prompt,
          aspectRatio: document.getElementById('imageAspectRatio').value,
          consent: rights.checked,
          confirmCost: costApproval.checked
        })
      });
      showImageJob(container, result.job);
      status.textContent = result.job.status === 'COMPLETED'
        ? 'Image generated. It is also listed under Projects.'
        : 'Image job started; status will update here and under Projects.';
      status.className = 'hint';
      if (result.job.status !== 'COMPLETED' && result.job.status !== 'FAILED') pollImageJob(result.job, container);
    } catch (error) {
      status.textContent = error.message;
      status.className = 'err';
    } finally {
      button.textContent = providerId === 'browser-svg' ? 'Create free illustration' : 'Generate AI image';
      updateButton();
    }
  };
  document.querySelectorAll('[data-image-handoff]').forEach(handoff => {
    handoff.onclick = async () => {
      const prompt = promptInput.value.trim();
      if (prompt.length < 10 || prompt.length > 2000) {
        status.textContent = 'Enter an image prompt between 10 and 2000 characters first.';
        status.className = 'err';
        return;
      }
      window.open(handoff.dataset.imageHandoff, '_blank', 'noopener,noreferrer');
      try {
        await navigator.clipboard.writeText(prompt);
        status.textContent = 'Prompt copied. Paste it into the website that opened; its free access and usage are controlled by that service.';
      } catch {
        status.textContent = 'Website opened. Copy the prompt above and paste it there; access and usage are controlled by that service.';
      }
      status.className = 'hint';
    };
  });
  updateButton();
  updateProvider();
}
function bindCreationType() {
  const choices = [...document.querySelectorAll('input[name="createType"]')];
  const videoWorkspace = document.getElementById('videoWorkspace');
  const imageWorkspace = document.getElementById('imageWorkspace');
  const update = () => {
    const imageSelected = choices.find(choice => choice.checked)?.value === 'image';
    videoWorkspace.hidden = imageSelected;
    imageWorkspace.hidden = !imageSelected;
    for (const choice of choices) {
      choice.closest('.make-option').classList.toggle('selected', choice.checked);
    }
  };
  choices.forEach(choice => choice.addEventListener('change', update));
  update();
}
bindCreationType();
bindVideoGeneration();
bindImageGeneration();
window.renderJobHistory = async function () {
  const container = document.getElementById('videoJobs');
  if (!container || !currentUser) return;
  container.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = 'Video and image-generation jobs';
  container.append(heading);
  try {
    const result = await request('/api/jobs');
    if (!result.jobs.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No generation jobs yet.';
      container.append(empty);
      return;
    }
    result.jobs.forEach(job => job.providerId.endsWith('-image')
      ? showImageJob(container, job)
      : showJob(container, job));
    result.jobs.filter(job => job.status !== 'COMPLETED' && job.status !== 'FAILED')
      .forEach(job => job.providerId.endsWith('-image')
        ? pollImageJob(job, container)
        : pollJob(job, container));
  } catch (error) {
    const message = document.createElement('p');
    message.className = 'err';
    message.textContent = `Could not load video jobs: ${error.message}`;
    container.append(message);
  }
};
document.querySelector('[data-go="history"]').addEventListener('click', () => window.renderJobHistory());
document.getElementById('authSwitch').onclick = () => {
  registering = !registering;
  document.getElementById('authTitle').textContent = registering ? 'Create your account' : 'Sign in to Whiterose';
  document.getElementById('authSubmit').textContent = registering ? 'Create account' : 'Sign in';
  document.getElementById('authSwitch').textContent = registering ? 'Sign in' : 'Create account';
  document.getElementById('authSwitchLabel').textContent = registering ? 'Already have an account?' : 'New here?';
  document.getElementById('confirmPasswordBox').hidden = !registering;
  document.getElementById('authPassword').autocomplete = registering ? 'new-password' : 'current-password';
  document.getElementById('confirmPassword').required = registering;
  showAuthMessage('');
};
async function completeLogin(session) {
  if (!session.access_token) throw new Error('Supabase did not return a session. Check the account email confirmation settings.');
  storeSession(session);
  const user = session.user || await request('/api/auth/user');
  showStudio(user);
  renderHist();
}
authForm.onsubmit = async event => {
  event.preventDefault();
  const button = document.getElementById('authSubmit');
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (registering && password !== document.getElementById('confirmPassword').value) {
    showAuthMessage('Passwords do not match.');
    return;
  }
  button.disabled = true;
  showAuthMessage('');
  try {
    const session = await request(registering ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    }, false);
    if (registering && !session.access_token) {
      showAuthMessage('Account created. Check your email to confirm it, then sign in.');
      return;
    }
    await completeLogin(session);
  } catch (error) {
    showAuthMessage(error.message);
  } finally {
    button.disabled = false;
  }
};
document.getElementById('demoLogin').onclick = async event => {
  const button = event.currentTarget;
  button.disabled = true;
  showAuthMessage('');
  try {
    await completeLogin(await request('/api/auth/demo', {
      method: 'POST', body: '{}'
    }, false));
  } catch (error) {
    showAuthMessage(error.message);
  } finally {
    button.disabled = false;
  }
};
document.getElementById('signOut').onclick = async () => {
  let message = 'You have signed out.';
  try { await request('/api/auth/logout', { method: 'POST', body: '{}' }, false); }
  catch (error) { message = `Signed out on this device, but the Supabase session could not be revoked: ${error.message}`; }
  storeSession(null);
  showSignIn(message);
};
async function restoreSession() {
  const session = readSession();
  if (!session || !session.access_token) return showSignIn();
  try {
    const user = await request('/api/auth/user');
    showStudio(user);
    renderHist();
  } catch (error) {
    showSignIn(error.message);
  }
}
restoreSession();

window.save = async function () {
  _save();
  try {
    const projects = JSON.parse(localStorage.getItem(window.WR_PROJECTS_KEY()) || '[]');
    const project = projects.find(item => item.id === S.id);
    if (project) {
      await request('/api/projects', { method: 'POST', body: JSON.stringify(project) });
      setAppStatus('Draft saved to your account and this browser.');
    }
  } catch (error) {
    setAppStatus(`Could not sync draft with Supabase: ${error.message}`, true);
  }
};
window.renderHist = async function () {
  _renderHist();
  if (!currentUser) return;
  try {
    const remoteProjects = await request('/api/projects');
    const storageKey = window.WR_PROJECTS_KEY();
    const localProjects = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const projectsById = new Map(remoteProjects.map(project => [project.id, project]));
    for (const project of localProjects) {
      if (!projectsById.has(project.id)) projectsById.set(project.id, project);
    }
    const merged = [...projectsById.values()].sort((a, b) => new Date(b.saved || 0) - new Date(a.saved || 0));
    localStorage.setItem(storageKey, JSON.stringify(merged));
    _renderHist();
    document.querySelectorAll('[data-x]').forEach(button => {
      button.onclick = async () => {
        try {
          await request(`/api/projects/${encodeURIComponent(button.dataset.x)}`, { method: 'DELETE' });
          const key = window.WR_PROJECTS_KEY();
          const remaining = JSON.parse(localStorage.getItem(key) || '[]').filter(project => project.id !== button.dataset.x);
          localStorage.setItem(key, JSON.stringify(remaining));
          window.renderHist();
        } catch (error) {
          setAppStatus(`Could not delete project: ${error.message}`, true);
        }
      };
    });
  } catch (error) {
    setAppStatus(`Could not load projects from Supabase: ${error.message}`, true);
  }
};
