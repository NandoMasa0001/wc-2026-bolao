-- 0007_knockout_advancer.sql
-- Knockout matches become predictable per-game (with their own kickoff
-- lock) once both teams are known, but stay locked otherwise. Group
-- matches keep the global tournament-start lock unchanged.
--
-- New column: `predictions.advancer` (team code) — mandatory on
-- knockout-stage tie predictions to credit "correct outcome via
-- penalties / extra time". See README.

alter table public.predictions
  add column if not exists advancer text;

-- The lock function now branches by stage.
--   - Group matches: trava no apito inicial do mundial (global).
--   - Mata-mata: trava no kickoff individual, e só abre quando ambos
--     os times estão definidos.
create or replace function public.is_match_open(match_id_in text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select stage, kickoff_at, home_team, away_team
    from public.matches
    where id = match_id_in
  )
  select case
    when (select stage from m) = 'group' then
      coalesce(
        (select tournament_starts_at > now() from public.config where id = 'tournament'),
        false
      )
    else
      coalesce(
        (select kickoff_at > now()
                and home_team is not null
                and away_team is not null
         from m),
        false
      )
  end;
$$;
