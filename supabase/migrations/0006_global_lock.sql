-- 0006_global_lock.sql
-- Tudo (placares E palpites longos) trava junto no momento em que o
-- mundial começa. Antes era trava por jogo (kickoff_at de cada partida).
-- Agora usamos `config.tournament_starts_at` como gate único.

create or replace function public.is_match_open(match_id_in text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- The match_id_in argument is no longer consulted; the lock is global.
  -- It stays in the signature so existing RLS policies keep compiling.
  select coalesce(
    (select tournament_starts_at > now() from public.config where id = 'tournament'),
    false
  );
$$;

-- Side benefit: predictions written before kickoff for a still-scheduled
-- match keep working. Predictions for matches that already finished are
-- still blocked by their points-must-be-zero check in the policy.
