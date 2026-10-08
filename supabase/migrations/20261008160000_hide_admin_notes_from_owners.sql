-- ============================================================
-- Hide gyms.admin_notes (super-admin private notes) from gym owners
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================================
--
-- Why: owners could read their own gyms row through PostgREST with their JWT,
-- including admin_notes. Only gymflow-admin (service role) and the admin mobile
-- app (via the admin API) ever read or write that column; no owner/member code
-- selects it (checked: owner queries use explicit column lists, the admin
-- dashboard counts with the service role).
--
-- Postgres cannot revoke a single column from a table-level grant, so the
-- table-level SELECT is replaced by a column-level grant of every column
-- except admin_notes. service_role / postgres are unaffected.
--
-- MAINTENANCE: a column added to gyms in future is NOT readable by owners until
-- it is granted, e.g.
--     GRANT SELECT (new_column) ON public.gyms TO authenticated;
-- That fails closed on purpose; a forgotten grant shows up as
-- "permission denied for column" in the first test, instead of leaking.
-- INSERT/UPDATE privileges are untouched (the guard trigger from
-- 20261008140000 restricts what owners can write).

DO $$
DECLARE
  v_cols TEXT;
BEGIN
  IF to_regclass('public.gyms') IS NULL THEN
    RAISE NOTICE 'public.gyms missing, skipping';
    RETURN;
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'gyms'
     AND column_name <> 'admin_notes';

  REVOKE SELECT ON public.gyms FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.gyms TO authenticated', v_cols);
END $$;

NOTIFY pgrst, 'reload schema';
