require('dotenv').config();
const express = require('express'), cors = require('cors'), path = require('path');
const { randomUUID } = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream');
const providers = require('../providers'), plan = require('./planner');
const JobStore = require('./job-store');
const { validateVideoRequest } = require('./video-validation');
const { buildVideoPrompt } = require('./video-director');
const app = express();
const jobs = new JobStore();
app.use(cors());
app.use(['/api/jobs', '/api/video/generate', '/api/images/generate'], express.json({ limit: '28mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));
const wrap = f => async (q, s) => { try { await f(q, s); } catch (e) { s.status(e.status || 500).json({ error: e.message }); } };

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
function requireSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    const e = new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.');
    e.status = 503;
    throw e;
  }
}
async function supabaseRequest(resource, { method = 'GET', token, body, prefer } = {}) {
  requireSupabase();
  const headers = { apikey: supabaseKey };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${supabaseUrl}${resource}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const e = new Error(result && (result.msg || result.message || result.error_description || result.error) || 'Supabase request failed.');
    e.status = response.status >= 500 ? 502 : response.status;
    throw e;
  }
  return result;
}
function authRoute(resource) {
  return wrap(async (q, s) => {
    requireSupabase();
    const result = await supabaseRequest(`/auth/v1/${resource}`, { method: 'POST', body: q.body || {} });
    s.json(result);
  });
}
const authenticate = async (q, s, next) => {
  const match = /^Bearer\s+(.+)$/i.exec(q.get('Authorization') || '');
  if (!match) return s.status(401).json({ error: 'Sign in to continue.' });
  try {
    q.authToken = match[1];
    q.authUser = await supabaseRequest('/auth/v1/user', { token: q.authToken });
    next();
  } catch (e) {
    s.status(e.status || 500).json({ error: e.message });
  }
};

app.get('/api/health', (q, s) => s.json({ ok: true }));
app.get('/api/providers', (q, s) => s.json(providers.status()));
app.post('/api/auth/register', authRoute('signup'));
app.post('/api/auth/login', authRoute('token?grant_type=password'));
app.post('/api/auth/demo', wrap(async (q, s) => {
  try {
    const result = await supabaseRequest('/auth/v1/signup', {
      method: 'POST',
      body: { data: { is_demo: true } }
    });
    s.json(result);
  } catch (e) {
    if (/anonymous sign-ins are disabled/i.test(e.message)) {
      e.message = 'Enable Anonymous Sign-Ins in Supabase Dashboard → Authentication → Sign In / Providers, then try demo login again.';
    }
    throw e;
  }
}));
app.post('/api/auth/refresh', authRoute('token?grant_type=refresh_token'));
app.post('/api/auth/logout', wrap(async (q, s) => {
  const match = /^Bearer\s+(.+)$/i.exec(q.get('Authorization') || '');
  if (!match) return s.status(401).json({ error: 'Sign in to continue.' });
  await supabaseRequest('/auth/v1/logout', { method: 'POST', token: match[1] });
  s.json({ ok: true });
}));
app.get('/api/auth/user', authenticate, (q, s) => s.json(q.authUser));
app.get('/api/projects', authenticate, wrap(async (q, s) => {
  const projects = await supabaseRequest('/rest/v1/projects?select=data&order=updated_at.desc', { token: q.authToken });
  s.json(projects.map(row => row.data));
}));
app.get('/api/projects/:id', authenticate, wrap(async (q, s) => {
  const rows = await supabaseRequest(`/rest/v1/projects?select=data&id=eq.${encodeURIComponent(q.params.id)}&limit=1`, { token: q.authToken });
  rows.length ? s.json(rows[0].data) : s.status(404).json({ error: 'not found' });
}));
app.post('/api/projects', authenticate, wrap(async (q, s) => {
  const p = q.body;
  if (!p || !p.id) return s.status(400).json({ error: 'id required' });
  await supabaseRequest('/rest/v1/projects?on_conflict=id', {
    method: 'POST',
    token: q.authToken,
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: { id: String(p.id), user_id: q.authUser.id, mode: String(p.mode || ''), prompt: String(p.prompt || ''), data: p, updated_at: new Date().toISOString() }
  });
  s.json({ ok: true });
}));
app.delete('/api/projects/:id', authenticate, wrap(async (q, s) => {
  await supabaseRequest(`/rest/v1/projects?id=eq.${encodeURIComponent(q.params.id)}`, {
    method: 'DELETE', token: q.authToken, prefer: 'return=minimal'
  });
  s.json({ ok: true });
}));
app.post('/api/plan', wrap(async (q, s) => {
  const b = q.body || {}; if (!b.prompt || b.prompt.length < 10) return s.status(400).json({ error: 'Prompt too short' });
  s.json({ scenes: await plan(b) });
}));
app.post('/api/video/prompt-preview', authenticate, wrap(async (q, s) => {
  const b = q.body || {};
  const duration = Number(b.duration);
  const aspectRatio = b.aspectRatio || '16:9';
  const mode = b.mode || 't2v';
  const language = b.language || 'English';
  if (!['English', 'Hindi', 'Hinglish', 'Marathi'].includes(language)) {
    const e = new Error('Choose a supported video language.');
    e.status = 400;
    throw e;
  }
  if (!Number.isInteger(duration) || duration < 3 || duration > 30) {
    const e = new Error('Magic Hour MiniMax H3 clips must be between 3 and 30 seconds.');
    e.status = 400;
    throw e;
  }
  if (!['16:9', '9:16', '1:1'].includes(aspectRatio) || !['t2v', 'i2v'].includes(mode)) {
    const e = new Error('Select a supported video mode and aspect ratio.');
    e.status = 400;
    throw e;
  }
  s.json({
    prompt: buildVideoPrompt({
      prompt: b.prompt,
      scene: b.scene,
      duration,
      aspectRatio,
      language,
      mode
    })
  });
}));
const createVideoJobs = wrap(async (q, s) => {
  const input = validateVideoRequest(q.body);
  const provider = input.providerId === 'google-gemini' ? providers.gemini :
    input.providerId === 'higgsfield-video' ? providers.higgsfield : providers.magicHour;
  if (!provider.apiKey()) {
    const keyName = input.providerId === 'google-gemini' ? 'GEMINI_API_KEY' :
      input.providerId === 'higgsfield-video' ? 'HIGGSFIELD_API_KEY' : 'MAGIC_HOUR_API_KEY';
    const providerName = input.providerId === 'google-gemini' ? 'Google Gemini' :
      input.providerId === 'higgsfield-video' ? 'Higgsfield' : 'Magic Hour';
    const message = `Connect ${providerName} by setting ${keyName} in the project .env file.`;
    const e = new Error(message);
    e.status = 409;
    throw e;
  }
  const generationPrompt = buildVideoPrompt({
    prompt: input.prompt,
    scene: q.body.scene,
    duration: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    language: input.language,
    mode: input.mode
  });

  const created = [];
  let warning = null;
  for (let i = 0; i < input.count; i++) {
    const id = randomUUID();
    jobs.create({
      id,
      userId: q.authUser.id,
      prompt: generationPrompt,
      providerId: input.providerId,
      durationSeconds: input.durationSeconds
    });
    try {
      const task = input.providerId === 'higgsfield-video'
        ? await provider.createVideo({
          prompt: generationPrompt,
          duration: input.durationSeconds,
          aspectRatio: input.aspectRatio
        })
        : await provider.create({
          prompt: generationPrompt,
          image: input.image,
          duration: input.durationSeconds,
          aspectRatio: input.aspectRatio
        });
      created.push(jobs.update(id, q.authUser.id, {
        taskId: task.taskId,
        status: task.status,
        lastError: task.error
      }));
    } catch (e) {
      jobs.update(id, q.authUser.id, { status: 'FAILED', lastError: e.message });
      if (created.length === 0) throw e;
      warning = `Only ${created.length} of ${input.count} requested video variations started: ${e.message}`;
      break;
    }
  }
  s.status(202).json({ jobs: created, warning });
});
app.post('/api/jobs', authenticate, createVideoJobs);
app.post('/api/video/generate', authenticate, createVideoJobs);
app.post('/api/images/generate', authenticate, wrap(async (q, s) => {
  const body = q.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 10 || prompt.length > 2000) {
    const e = new Error('Image prompt must be between 10 and 2000 characters.');
    e.status = 400;
    throw e;
  }
  if (/deepfake|impersonat|pretend to be|as (?:the )?(?:president|prime minister)|nude|naked|sexual|\bminor\b/i.test(prompt)) {
    const e = new Error('This prompt cannot be generated. Use a fictional, non-sexual subject and do not impersonate real people.');
    e.status = 400;
    throw e;
  }
  if (body.consent !== true) {
    const e = new Error('Confirm that you have the rights to the prompt.');
    e.status = 400;
    throw e;
  }
  if (body.confirmCost !== true) {
    const e = new Error('Confirm that this image generation may use paid provider credits.');
    e.status = 400;
    throw e;
  }
  const aspectRatio = body.aspectRatio === undefined ? '1:1' : body.aspectRatio;
  if (!['1:1', '16:9', '9:16'].includes(aspectRatio)) {
    const e = new Error('Image aspect ratio must be 1:1, 16:9, or 9:16.');
    e.status = 400;
    throw e;
  }
  const providerId = body.providerId;
  if (!['openai-image', 'google-gemini-image', 'higgsfield-image'].includes(providerId)) {
    const e = new Error('Choose OpenAI, Google Gemini, or Higgsfield for AI image generation. Free local SVG illustrations run in the browser.');
    e.status = 400;
    throw e;
  }
  const provider = providerId === 'openai-image' ? providers.openaiImage :
    providerId === 'google-gemini-image' ? providers.gemini : providers.higgsfield;
  if (!provider.apiKey()) {
    const e = new Error(providerId === 'openai-image'
      ? 'Set OPENAI_API_KEY in the server .env file, then restart the app.'
      : providerId === 'google-gemini-image'
        ? 'Set GEMINI_API_KEY in the server .env file, then restart the app.'
        : 'Set HIGGSFIELD_API_KEY as KEY_ID:KEY_SECRET in the server .env file, then restart the app.');
    e.status = 409;
    throw e;
  }

  const id = randomUUID();
  jobs.create({
    id,
    userId: q.authUser.id,
    prompt,
    providerId,
    durationSeconds: 0
  });
  try {
    if (providerId === 'openai-image' || providerId === 'google-gemini-image') {
      const imageProvider = providerId === 'openai-image' ? providers.openaiImage : providers.gemini;
      const image = await imageProvider.createImage({ prompt, aspectRatio });
      const job = jobs.update(id, q.authUser.id, {
        status: 'COMPLETED',
        generatedUrl: `data:${image.mimeType};base64,${image.data}`
      });
      s.json({ job: exposeJob(job) });
    } else {
      const task = await providers.higgsfield.createImage({ prompt, aspectRatio });
      const job = jobs.update(id, q.authUser.id, {
        taskId: task.taskId,
        status: task.status,
        lastError: task.error
      });
      s.status(202).json({ job: exposeJob(job) });
    }
  } catch (error) {
    jobs.update(id, q.authUser.id, { status: 'FAILED', lastError: error.message });
    throw error;
  }
}));
app.get('/api/jobs', authenticate, wrap(async (q, s) => {
  s.json({ jobs: jobs.listOwned(q.authUser.id).map(exposeJob) });
}));
function exposeJob(job) {
  if (['openai-image', 'google-gemini-image'].includes(job.providerId) && job.generatedUrl) {
    return { ...job, generatedUrl: `/api/images/${encodeURIComponent(job.id)}/output` };
  }
  return job.providerId === 'google-gemini' && job.generatedUrl
    ? { ...job, generatedUrl: `/api/jobs/${encodeURIComponent(job.id)}/video` }
    : job;
}
app.get('/api/images/:id', authenticate, wrap(async (q, s) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(q.params.id)) {
    return s.status(400).json({ error: 'A valid image job ID is required.' });
  }
  let job = jobs.getOwned(q.params.id, q.authUser.id);
  if (!job || !['openai-image', 'google-gemini-image', 'higgsfield-image'].includes(job.providerId)) {
    return s.status(404).json({ error: 'Image job not found.' });
  }
  if (job.taskId && job.providerId === 'higgsfield-image' && !providers.higgsfield.isTerminal(job.status)) {
    const task = await providers.higgsfield.getImageTask(job.taskId);
    job = jobs.update(job.id, q.authUser.id, {
      taskId: task.taskId,
      status: task.status,
      generatedUrl: task.generatedUrl,
      lastError: task.error
    });
  }
  s.json({ job: exposeJob(job) });
}));
app.get('/api/images/:id/output', authenticate, wrap(async (q, s) => {
  const job = jobs.getOwned(q.params.id, q.authUser.id);
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(job?.generatedUrl || '');
  if (!job || !['openai-image', 'google-gemini-image'].includes(job.providerId) ||
      job.status !== 'COMPLETED' || !match) {
    return s.status(404).json({ error: 'Completed generated image not found.' });
  }
  s.set('Content-Type', match[1]);
  s.set('Content-Disposition', `inline; filename="whiterose-image.${match[1].split('/')[1] === 'jpeg' ? 'jpg' : match[1].split('/')[1]}"`);
  s.set('Cache-Control', 'private, no-store');
  s.send(Buffer.from(match[2], 'base64'));
}));
app.get('/api/jobs/:id/video', authenticate, wrap(async (q, s) => {
  const job = jobs.getOwned(q.params.id, q.authUser.id);
  if (!job || job.providerId !== 'google-gemini' ||
      job.status !== 'COMPLETED' || !job.generatedUrl) {
    return s.status(404).json({ error: 'Completed video not found.' });
  }
  const response = await providers.gemini.downloadVideo(job.generatedUrl);
  s.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
  s.set('Content-Disposition', 'inline; filename="whiterose-video.mp4"');
  s.set('Cache-Control', 'private, no-store');
  pipeline(Readable.fromWeb(response.body), s, error => {
    if (error) {
      if (!s.headersSent) s.status(502).json({ error: 'Could not stream the Gemini video.' });
      else s.destroy(error);
    }
  });
}));
const readVideoJob = wrap(async (q, s) => {
  const id = q.params.id || q.query.request_id;
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return s.status(400).json({ error: 'A valid request_id is required.' });
  }
  let job = jobs.getOwned(id, q.authUser.id);
  if (!job) return s.status(404).json({ error: 'Video job not found.' });
  const provider = job.providerId === 'magic-hour' ? providers.magicHour :
    job.providerId === 'google-gemini' ? providers.gemini :
      job.providerId === 'higgsfield-video' ? providers.higgsfield : null;
  if (!provider) {
    return s.status(410).json({ error: 'This saved job uses a provider that is no longer supported.' });
  }
  if (job.taskId && !provider.isTerminal(job.status)) {
    const task = job.providerId === 'higgsfield-video'
      ? await provider.getVideoTask(job.taskId)
      : await provider.getTask(job.taskId);
    job = jobs.update(job.id, q.authUser.id, {
      taskId: task.taskId,
      status: task.status,
      generatedUrl: task.generatedUrl,
      lastError: task.error
    });
  }
  const completed = job.status === 'COMPLETED';
  const failed = job.status === 'FAILED';
  const status = completed ? 'completed' : failed ? 'failed' :
    job.status === 'IN_PROGRESS' ? 'processing' : 'queued';
  const progress = completed || failed ? 100 : job.status === 'IN_PROGRESS' ? 50 : 5;
  const publicJob = exposeJob(job);
  const videoUrl = completed && job.providerId === 'google-gemini'
    ? publicJob.generatedUrl
    : completed ? job.generatedUrl : null;
  s.json({
    job: publicJob,
    request_id: job.id,
    status,
    progress_pct: progress,
    approval_status: 'approved',
    scene_count: 1,
    target_duration_s: job.durationSeconds,
    estimated_cost: null,
    final_video_url: videoUrl,
    thumbnail_url: null,
    final_duration_s: completed ? job.durationSeconds : null,
    qc: null,
    last_error: job.lastError,
    completed_at: completed ? job.updatedAt : null,
    scenes: [{
      scene_id: job.id,
      scene_index: 1,
      status,
      duration_s: job.durationSeconds,
      attempt_count: 0,
      last_error: job.lastError,
      video_url: videoUrl
    }]
  });
});
app.get('/api/jobs/:id', authenticate, readVideoJob);
app.get('/api/video/status', authenticate, readVideoJob);
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Whiterose Studio running at http://localhost:' + port));
