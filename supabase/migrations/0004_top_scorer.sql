-- 0004_top_scorer.sql
-- Adds the 4th award: top scorer ("Chuteira de Ouro").

alter table public.award_predictions
  add column if not exists top_scorer text;

-- config.results is a jsonb blob, no schema change needed there.
