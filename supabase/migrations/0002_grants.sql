-- ============================================================
-- 0002_grants.sql — Postgres table-level privileges.
-- ============================================================
-- The previous migration created tables with RLS on, but disabling
-- "Automatically expose new tables" in the Supabase project means we
-- also have to GRANT table privileges manually. RLS still gates which
-- rows each role sees; this grants the ability to issue the SQL at all.
-- ============================================================

grant usage on schema public to authenticated, anon, service_role;

-- service_role bypasses RLS but still needs table privileges.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines  in schema public to service_role;

-- authenticated: broad table privileges; precise gating happens via RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Helper functions called from RLS policies need to be executable by
-- the authenticated role (they're SECURITY DEFINER, so they read using
-- the function owner's privileges).
grant execute on function public.is_admin()              to authenticated;
grant execute on function public.is_match_open(text)     to authenticated;
grant execute on function public.is_tournament_open()    to authenticated;
grant execute on function public.is_poll_voting_open()   to authenticated;

-- Future-proofing: any tables/sequences we add in later migrations
-- inherit these grants automatically.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant usage on sequences to authenticated;
