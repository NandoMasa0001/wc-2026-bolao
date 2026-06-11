-- 0009_friendly_stage.sql
-- Allow a "friendly" stage value in `matches`, so we can seed pre-cup
-- amistosos as workflow rehearsals. Friendlies are admin-only on the
-- client (filtered out for non-admins in MatchesPage) and never enter
-- the standings / advancement logic (which only looks at stage='group').

alter table public.matches
  drop constraint if exists matches_stage_check;

alter table public.matches
  add constraint matches_stage_check
  check (stage in ('group','r32','r16','qf','sf','third','final','friendly'));

-- Seed a workflow-test friendly: Euro 2024 group stage NED 0-0 FRA
-- (finished match — football-data api_id 428762). When fetch-results runs,
-- it'll pull the real result automatically and exercise the full pipeline:
-- API call → DB upsert → scoring engine → leaderboard refresh.
-- Idempotent: re-running won't duplicate.
insert into public.matches (
  id, api_id, stage, group_letter, matchday,
  home_team, away_team, home_placeholder, away_placeholder,
  kickoff_at, status, home_score, away_score, winner
) values (
  'TEST-EURO2024-NED-FRA',
  428762,
  'friendly',
  null,
  0,
  'NED',
  'FRA',
  null,
  null,
  '2024-06-21T19:00:00Z',
  'scheduled',
  null,
  null,
  null
)
on conflict (id) do nothing;
