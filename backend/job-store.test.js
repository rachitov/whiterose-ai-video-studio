const test = require('node:test');
const assert = require('node:assert/strict');
const JobStore = require('./job-store');

test('stores video jobs and enforces user ownership', t => {
  const store = new JobStore(':memory:');
  t.after(() => store.close());

  const job = store.create({
    id: 'job-1',
    userId: 'user-1',
    prompt: 'A sunrise over a quiet lake.',
    providerId: 'magic-hour',
    durationSeconds: 12
  });
  assert.equal(job.status, 'SUBMITTING');
  assert.equal(job.providerId, 'magic-hour');
  assert.equal(job.durationSeconds, 12);
  assert.equal(store.getOwned('job-1', 'user-2'), null);

  const updated = store.update('job-1', 'user-1', {
    taskId: 'task-1',
    status: 'COMPLETED',
    generatedUrl: 'https://ai-statics.freepik.com/video.mp4',
    lastError: null
  });
  assert.equal(updated.taskId, 'task-1');
  assert.equal(updated.generatedUrl, 'https://ai-statics.freepik.com/video.mp4');
  assert.equal(store.listOwned('user-1').length, 1);
  assert.equal(store.listOwned('user-2').length, 0);
});
