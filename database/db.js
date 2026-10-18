const Database = require('better-sqlite3'), fs = require('fs'), path = require('path');
const db = new Database(path.join(__dirname, 'studio.db'));
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
module.exports = {
  saveProject(p) {
    db.prepare('insert into projects(id,mode,prompt,data) values(@id,@mode,@prompt,@data) on conflict(id) do update set mode=@mode,prompt=@prompt,data=@data,updated_at=current_timestamp')
      .run({ id: String(p.id), mode: String(p.mode || ''), prompt: String(p.prompt || ''), data: JSON.stringify(p) });
  },
  listProjects() { return db.prepare('select data from projects order by updated_at desc').all().map(r => JSON.parse(r.data)); },
  getProject(id) { const r = db.prepare('select data from projects where id=?').get(id); return r ? JSON.parse(r.data) : null; },
  deleteProject(id) { db.prepare('delete from projects where id=?').run(id); }
};
