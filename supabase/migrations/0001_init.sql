-- ============================================================
-- WC 2026 Bolão — initial schema, RLS, and realtime publication
-- ============================================================
-- Run with: `supabase db push` (after `supabase link`).
-- Idempotent in the sense that re-running is harmful, so it's
-- guarded by IF NOT EXISTS where it matters. This is meant to
-- run once on a fresh project.
-- ============================================================

-- ---------------- TABLES ----------------

create table if not exists public.config (
  id                     text         primary key default 'tournament',
  shared_password        text         not null,
  predictions_open       boolean      not null default true,
  tournament_starts_at   timestamptz  not null,
  round_multipliers      jsonb        not null,
  poll_voting_open       boolean      not null default false,
  awards_announced       boolean      not null default false,
  results                jsonb        not null default '{}'::jsonb,
  tournament_odds        jsonb        not null default '{}'::jsonb
);

create table if not exists public.teams (
  code      text primary key,
  name      text not null,
  group_letter text,
  flag_url  text
);

create table if not exists public.matches (
  id                text primary key,
  api_id            bigint,
  stage             text not null check (stage in ('group','r32','r16','qf','sf','third','final')),
  group_letter      text,
  matchday          int,
  home_team         text references public.teams(code) on delete set null,
  away_team         text references public.teams(code) on delete set null,
  home_placeholder  text,
  away_placeholder  text,
  kickoff_at        timestamptz not null,
  status            text not null default 'scheduled'
                    check (status in ('scheduled','live','finished')),
  home_score        int check (home_score is null or (home_score >= 0 and home_score <= 30)),
  away_score        int check (away_score is null or (away_score >= 0 and away_score <= 30)),
  winner            text,
  odds              jsonb
);

create index if not exists matches_kickoff_idx  on public.matches (kickoff_at);
create index if not exists matches_stage_idx    on public.matches (stage);
create index if not exists matches_status_idx   on public.matches (status);

create table if not exists public.players (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  points      jsonb not null default '{"matches":0,"advancement":0,"finalists":0,"awards":0,"poll":0,"total":0}'::jsonb,
  stats       jsonb not null default '{"predictionsMade":0,"exactScores":0}'::jsonb
);

create table if not exists public.predictions (
  player_id   uuid not null references public.players(id) on delete cascade,
  match_id    text not null references public.matches(id) on delete cascade,
  stage       text not null,
  home_score  int  not null check (home_score >= 0 and home_score <= 20),
  away_score  int  not null check (away_score >= 0 and away_score <= 20),
  points      int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (player_id, match_id)
);
create index if not exists predictions_match_idx on public.predictions (match_id);

create table if not exists public.advancement_predictions (
  player_id     uuid primary key references public.players(id) on delete cascade,
  teams         text[] not null,
  confirmed_at  timestamptz not null default now(),
  points        int not null default 0
);

create table if not exists public.finals_predictions (
  player_id  uuid primary key references public.players(id) on delete cascade,
  finalists  text[] not null,
  points     int not null default 0
);

create table if not exists public.award_predictions (
  player_id    uuid primary key references public.players(id) on delete cascade,
  best_player  text,
  young_player text,
  goalkeeper   text,
  points       int not null default 0
);

create table if not exists public.poll_predictions (
  player_id       uuid primary key references public.players(id) on delete cascade,
  dark_horse      text,
  disappointment  text,
  points          int not null default 0
);

create table if not exists public.poll_votes (
  player_id       uuid primary key references public.players(id) on delete cascade,
  dark_horse      text,
  disappointment  text
);

-- ---------------- HELPER FUNCTIONS ----------------
-- security definer so RLS can call without recursion.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.players where id = auth.uid()), false);
$$;

create or replace function public.is_match_open(match_id_in text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select kickoff_at > now() and status = 'scheduled' from public.matches where id = match_id_in),
    false
  );
$$;

create or replace function public.is_tournament_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tournament_starts_at > now() from public.config where id = 'tournament'),
    false
  );
$$;

create or replace function public.is_poll_voting_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select poll_voting_open from public.config where id = 'tournament'),
    false
  );
$$;

-- ---------------- RLS ----------------
-- Automatic RLS at project-level should already be on; we still enable
-- explicitly per table to be safe and idempotent.

alter table public.config                   enable row level security;
alter table public.teams                    enable row level security;
alter table public.matches                  enable row level security;
alter table public.players                  enable row level security;
alter table public.predictions              enable row level security;
alter table public.advancement_predictions  enable row level security;
alter table public.finals_predictions       enable row level security;
alter table public.award_predictions        enable row level security;
alter table public.poll_predictions         enable row level security;
alter table public.poll_votes               enable row level security;

-- ----- config -----
drop policy if exists "config read auth" on public.config;
create policy "config read auth" on public.config
  for select to authenticated using (true);

drop policy if exists "config write admin" on public.config;
create policy "config write admin" on public.config
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----- teams -----
drop policy if exists "teams read auth" on public.teams;
create policy "teams read auth" on public.teams
  for select to authenticated using (true);

drop policy if exists "teams write admin" on public.teams;
create policy "teams write admin" on public.teams
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----- matches -----
drop policy if exists "matches read auth" on public.matches;
create policy "matches read auth" on public.matches
  for select to authenticated using (true);

drop policy if exists "matches write admin" on public.matches;
create policy "matches write admin" on public.matches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----- players -----
drop policy if exists "players read auth" on public.players;
create policy "players read auth" on public.players
  for select to authenticated using (true);

drop policy if exists "players insert self" on public.players;
create policy "players insert self" on public.players
  for insert to authenticated
  with check (id = auth.uid() and is_admin = false);

drop policy if exists "players update self name only" on public.players;
create policy "players update self name only" on public.players
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (
    -- self can only update `name`. Admin can update anything.
    public.is_admin()
    or (
      id = auth.uid()
      and is_admin = (select is_admin from public.players where id = auth.uid())
      and points   = (select points   from public.players where id = auth.uid())
      and stats    = (select stats    from public.players where id = auth.uid())
    )
  );

drop policy if exists "players delete admin" on public.players;
create policy "players delete admin" on public.players
  for delete to authenticated using (public.is_admin());

-- ----- predictions -----
drop policy if exists "predictions read auth" on public.predictions;
create policy "predictions read auth" on public.predictions
  for select to authenticated using (true);

drop policy if exists "predictions write self pre-kickoff" on public.predictions;
create policy "predictions write self pre-kickoff" on public.predictions
  for insert to authenticated
  with check (
    player_id = auth.uid()
    and public.is_match_open(match_id)
    and points = 0
  );

drop policy if exists "predictions update self pre-kickoff" on public.predictions;
create policy "predictions update self pre-kickoff" on public.predictions
  for update to authenticated
  using (player_id = auth.uid() and public.is_match_open(match_id))
  with check (player_id = auth.uid() and points = 0);

drop policy if exists "predictions delete admin" on public.predictions;
create policy "predictions delete admin" on public.predictions
  for delete to authenticated using (public.is_admin());

-- ----- advancement_predictions -----
drop policy if exists "adv read auth" on public.advancement_predictions;
create policy "adv read auth" on public.advancement_predictions
  for select to authenticated using (true);

drop policy if exists "adv upsert self before kickoff" on public.advancement_predictions;
create policy "adv upsert self before kickoff" on public.advancement_predictions
  for insert to authenticated
  with check (player_id = auth.uid() and public.is_tournament_open() and points = 0);

drop policy if exists "adv update self before kickoff" on public.advancement_predictions;
create policy "adv update self before kickoff" on public.advancement_predictions
  for update to authenticated
  using (player_id = auth.uid() and public.is_tournament_open())
  with check (player_id = auth.uid() and points = 0);

-- ----- finals_predictions -----
drop policy if exists "fin read auth" on public.finals_predictions;
create policy "fin read auth" on public.finals_predictions
  for select to authenticated using (true);

drop policy if exists "fin upsert self before kickoff" on public.finals_predictions;
create policy "fin upsert self before kickoff" on public.finals_predictions
  for insert to authenticated
  with check (player_id = auth.uid() and public.is_tournament_open() and points = 0);

drop policy if exists "fin update self before kickoff" on public.finals_predictions;
create policy "fin update self before kickoff" on public.finals_predictions
  for update to authenticated
  using (player_id = auth.uid() and public.is_tournament_open())
  with check (player_id = auth.uid() and points = 0);

-- ----- award_predictions -----
drop policy if exists "awd read auth" on public.award_predictions;
create policy "awd read auth" on public.award_predictions
  for select to authenticated using (true);

drop policy if exists "awd upsert self before kickoff" on public.award_predictions;
create policy "awd upsert self before kickoff" on public.award_predictions
  for insert to authenticated
  with check (player_id = auth.uid() and public.is_tournament_open() and points = 0);

drop policy if exists "awd update self before kickoff" on public.award_predictions;
create policy "awd update self before kickoff" on public.award_predictions
  for update to authenticated
  using (player_id = auth.uid() and public.is_tournament_open())
  with check (player_id = auth.uid() and points = 0);

-- ----- poll_predictions -----
drop policy if exists "poll read auth" on public.poll_predictions;
create policy "poll read auth" on public.poll_predictions
  for select to authenticated using (true);

drop policy if exists "poll upsert self before kickoff" on public.poll_predictions;
create policy "poll upsert self before kickoff" on public.poll_predictions
  for insert to authenticated
  with check (player_id = auth.uid() and public.is_tournament_open() and points = 0);

drop policy if exists "poll update self before kickoff" on public.poll_predictions;
create policy "poll update self before kickoff" on public.poll_predictions
  for update to authenticated
  using (player_id = auth.uid() and public.is_tournament_open())
  with check (player_id = auth.uid() and points = 0);

-- ----- poll_votes (after tournament) -----
drop policy if exists "votes read auth" on public.poll_votes;
create policy "votes read auth" on public.poll_votes
  for select to authenticated using (true);

drop policy if exists "votes upsert self when open" on public.poll_votes;
create policy "votes upsert self when open" on public.poll_votes
  for insert to authenticated
  with check (player_id = auth.uid() and public.is_poll_voting_open());

drop policy if exists "votes update self when open" on public.poll_votes;
create policy "votes update self when open" on public.poll_votes
  for update to authenticated
  using (player_id = auth.uid() and public.is_poll_voting_open())
  with check (player_id = auth.uid());

-- ---------------- REALTIME ----------------
-- Add tables to the supabase_realtime publication so the client gets
-- change events.

alter publication supabase_realtime add table public.config;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.predictions;
alter publication supabase_realtime add table public.advancement_predictions;
alter publication supabase_realtime add table public.finals_predictions;
alter publication supabase_realtime add table public.award_predictions;
alter publication supabase_realtime add table public.poll_predictions;
alter publication supabase_realtime add table public.poll_votes;
