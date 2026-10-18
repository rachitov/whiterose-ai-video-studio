const Database = require('better-sqlite3');
const path = require('path');

class JobStore {
  constructor(databasePath = path.join(__dirname, '../database/studio.db')) {
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        task_id TEXT,
        provider_id TEXT NOT NULL DEFAULT 'magic-hour',
        duration_s INTEGER NOT NULL DEFAULT 6,
        status TEXT NOT NULL,
        generated_url TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS video_jobs_user_created
        ON video_jobs (user_id, created_at DESC);
    `);
    const columns = new Set(this.db.pragma('table_info(video_jobs)').map(column => column.name));
    if (!columns.has('provider_id')) {
      this.db.exec("ALTER TABLE video_jobs ADD COLUMN provider_id TEXT NOT NULL DEFAULT 'magic-hour'");
    }
    if (!columns.has('duration_s')) {
      this.db.exec('ALTER TABLE video_jobs ADD COLUMN duration_s INTEGER NOT NULL DEFAULT 6');
    }
  }

  create({ id, userId, prompt, providerId = 'magic-hour', durationSeconds = 6 }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO video_jobs (id, user_id, prompt, provider_id, duration_s, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'SUBMITTING', ?, ?)
    `).run(id, userId, prompt, providerId, durationSeconds, now, now);
    return this.getOwned(id, userId);
  }

  update(id, userId, { taskId, status, generatedUrl, lastError }) {
    const existing = this.getOwned(id, userId);
    if (!existing) return null;
    this.db.prepare(`
      UPDATE video_jobs
      SET task_id = COALESCE(?, task_id),
          status = ?,
          generated_url = COALESCE(?, generated_url),
          last_error = ?,
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      taskId ?? null,
      status,
      generatedUrl ?? null,
      lastError ?? null,
      new Date().toISOString(),
      id,
      userId
    );
    return this.getOwned(id, userId);
  }

  getOwned(id, userId) {
    return this.db.prepare(`
      SELECT id, prompt, task_id AS taskId, status, generated_url AS generatedUrl,
             provider_id AS providerId, duration_s AS durationSeconds,
             last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt
      FROM video_jobs WHERE id = ? AND user_id = ?
    `).get(id, userId) || null;
  }

  listOwned(userId, limit = 30) {
    return this.db.prepare(`
      SELECT id, prompt, task_id AS taskId, status, generated_url AS generatedUrl,
             provider_id AS providerId, duration_s AS durationSeconds,
             last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt
      FROM video_jobs WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit);
  }

  close() {
    this.db.close();
  }
}

module.exports = JobStore;
