-- 0008_guardrails.sql
-- Pre-tournament guardrail infra: last-cron timestamp + admin audit log.

-- 1. Last-cron timestamp on config.
-- fetch-results.mjs updates this on every successful run; the /admin
-- preflight card uses it to flag a stale cron.
alter table public.config
  add column if not exists last_fetch_at timestamptz;

-- 2. Admin audit log.
-- Every admin mutator should insert a row here so we can reconstruct
-- post-mortem what happened on game day. RLS lets any authenticated
-- player READ (transparency for the league) but only admins WRITE.
create table if not exists public.admin_actions (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_name  text,
  action      text not null,
  target      text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

alter table public.admin_actions enable row level security;

drop policy if exists "admin_actions read auth" on public.admin_actions;
create policy "admin_actions read auth" on public.admin_actions
  for select to authenticated using (true);

drop policy if exists "admin_actions write admin" on public.admin_actions;
create policy "admin_actions write admin" on public.admin_actions
  for insert to authenticated
  with check (public.is_admin());

grant select on public.admin_actions to authenticated;
grant insert on public.admin_actions to authenticated;

create index if not exists admin_actions_created_at_idx
  on public.admin_actions (created_at desc);
