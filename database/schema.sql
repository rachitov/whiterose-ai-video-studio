create table if not exists projects(id text primary key, mode text, prompt text, data text, created_at text default current_timestamp, updated_at text default current_timestamp);
create table if not exists assets(id integer primary key autoincrement, project_id text, kind text, name text, size integer, meta text, created_at text default current_timestamp);
create table if not exists jobs(id integer primary key autoincrement, project_id text, provider text, provider_job_id text, status text, cost_note text, created_at text default current_timestamp, updated_at text default current_timestamp);
