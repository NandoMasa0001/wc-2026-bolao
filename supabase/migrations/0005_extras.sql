-- 0005_extras.sql — "Extras" predictions (8 side bets).
-- See README.md "Extras" section for scoring details.

create table if not exists public.extra_predictions (
  player_id          uuid primary key references public.players(id) on delete cascade,
  -- Text picks
  champion           text,                -- team code (e.g. "BRA")
  first_goal_brazil  text,                -- player name
  last_goal_brazil   text,                -- player name
  hundredth_goal     text,                -- player name
  -- Numeric picks
  total_goals_wc     int,
  neymar_ga          int,
  top_scorer_goals   int,
  -- Boolean
  mbappe_record      boolean,
  -- Bookkeeping
  points             int not null default 0,
  updated_at         timestamptz not null default now()
);

alter table public.extra_predictions enable row level security;

grant select, insert, update, delete on public.extra_predictions to authenticated;
grant all on public.extra_predictions to service_role;

drop policy if exists "extras read auth" on public.extra_predictions;
create policy "extras read auth" on public.extra_predictions
  for select to authenticated using (true);

drop policy if exists "extras upsert self before kickoff" on public.extra_predictions;
create policy "extras upsert self before kickoff" on public.extra_predictions
  for insert to authenticated
  with check (player_id = auth.uid() and public.is_tournament_open() and points = 0);

drop policy if exists "extras update self before kickoff" on public.extra_predictions;
create policy "extras update self before kickoff" on public.extra_predictions
  for update to authenticated
  using (player_id = auth.uid() and public.is_tournament_open())
  with check (player_id = auth.uid() and points = 0);

drop policy if exists "extras delete admin" on public.extra_predictions;
create policy "extras delete admin" on public.extra_predictions
  for delete to authenticated using (public.is_admin());

alter publication supabase_realtime add table public.extra_predictions;
