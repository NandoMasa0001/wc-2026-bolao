-- ============================================================
-- 0003_check_password_rpc.sql
-- ============================================================
-- Login is chicken-and-egg: the client needs to verify the shared
-- password before signing in, but the `config` table is RLS-gated
-- to authenticated users. Solution: a SECURITY DEFINER function
-- that compares the input to the stored password and returns
-- boolean, without ever exposing the password itself.
-- ============================================================

create or replace function public.check_shared_password(pwd text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select shared_password = pwd from public.config where id = 'tournament'),
    false
  );
$$;

-- Callable by unauthenticated visitors (anon role) and by signed-in users.
grant execute on function public.check_shared_password(text) to anon, authenticated;
