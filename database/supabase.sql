create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default '',
  prompt text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
grant select, insert, update, delete on public.projects to authenticated;

drop policy if exists "Users can read their own projects" on public.projects;
drop policy if exists "Users can create their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;

create policy "Users can read their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);
