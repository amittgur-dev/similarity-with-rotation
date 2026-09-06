-- Similarity with rotation · online runs on Supabase
-- Run this once in the SQL editor of your Supabase project (Database → SQL).
-- Creates the tables, row-level-security policies and the completion RPC.
-- Experimenters sign in with email + password (Authentication → Users: add
-- yourself; disable public sign-ups under Authentication → Providers → Email).

create extension if not exists pgcrypto;

-- ---------- published experiments (frozen definitions) ----------
create table if not exists public.published_experiments (
  id text primary key,                                  -- short slug in the participant link
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null default '',
  canvas text not null default '',
  experiment_code text not null default '',
  completion_url text not null default '',
  definition jsonb not null,                            -- see publishedDefinition() in src/experiment.js
  active boolean not null default true
);
alter table public.published_experiments enable row level security;

-- ---------- participant sessions ----------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  experiment_id text not null references public.published_experiments(id) on delete cascade,
  created_at timestamptz not null default now(),
  participant jsonb not null default '{}'::jsonb,       -- {prolific_pid, study_id, session_id, participant}
  calibration jsonb not null default '{}'::jsonb,       -- {px_per_mm, calibrated, distance_cm, screen, dpr}
  user_agent text not null default '',
  completed boolean not null default false,
  completed_at timestamptz
);
alter table public.sessions enable row level security;

-- ---------- trials (one row per response) ----------
create table if not exists public.trials (
  id bigserial primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  trial integer not null,
  row jsonb not null,                                   -- the same record as a CSV row
  created_at timestamptz not null default now(),
  unique (session_id, trial)
);
alter table public.trials enable row level security;
create index if not exists trials_session_idx on public.trials(session_id);
create index if not exists sessions_experiment_idx on public.sessions(experiment_id);

-- ---------- policies ----------
-- participants (anon): may read an active definition, open a session and add trials; never read data
drop policy if exists "anon reads active definitions" on public.published_experiments;
create policy "anon reads active definitions" on public.published_experiments
  for select to anon using (active);
drop policy if exists "anon opens sessions" on public.sessions;
create policy "anon opens sessions" on public.sessions
  for insert to anon with check (exists (select 1 from public.published_experiments p where p.id = experiment_id and p.active));
drop policy if exists "anon adds trials" on public.trials;
create policy "anon adds trials" on public.trials
  for insert to anon with check (exists (select 1 from public.sessions s join public.published_experiments p on p.id = s.experiment_id
                                          where s.id = session_id and p.active and not s.completed));

-- experimenters (authenticated): full access to their own experiments and everything under them
drop policy if exists "owner manages experiments" on public.published_experiments;
create policy "owner manages experiments" on public.published_experiments
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "owner reads sessions" on public.sessions;
create policy "owner reads sessions" on public.sessions
  for select to authenticated using (exists (select 1 from public.published_experiments p where p.id = experiment_id and p.owner = auth.uid()));
drop policy if exists "owner reads trials" on public.trials;
create policy "owner reads trials" on public.trials
  for select to authenticated using (exists (select 1 from public.sessions s join public.published_experiments p on p.id = s.experiment_id
                                              where s.id = session_id and p.owner = auth.uid()));

-- ---------- completion (participants cannot update sessions directly) ----------
create or replace function public.complete_session(sid uuid) returns void
language sql security definer set search_path = public as $$
  update public.sessions set completed = true, completed_at = now() where id = sid and not completed;
$$;
revoke all on function public.complete_session(uuid) from public;
grant execute on function public.complete_session(uuid) to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.published_experiments to anon;
grant insert on public.sessions, public.trials to anon;
grant all on public.published_experiments, public.sessions, public.trials to authenticated;
grant usage, select on sequence public.trials_id_seq to anon, authenticated;
