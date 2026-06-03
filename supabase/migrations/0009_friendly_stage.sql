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
