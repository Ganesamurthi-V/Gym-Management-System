-- ============================================================
-- Move gyms.admin_notes into its own service-role-only table
--
-- Idempotent and defensive (prints NOTICE "skipped (...)" instead of failing).
-- Run in the Supabase SQL editor TOGETHER with the admin-app deploy that reads
-- public.gym_admin_notes. The same end state is folded into supabase-schema.sql.
--
-- Why: owners get Realtime UPDATE events for their own gyms row. A column-level
-- SELECT grant hides admin_notes from queries, but Realtime can still carry it in
-- the change payload. A separate table that only service_role can reach cannot
-- leak that way.
--
--  1. Create gym_admin_notes (RLS on, no policies, client roles revoked).
--  2. Copy existing non-empty gyms.admin_notes into it (only if the column exists).
--  3. Redefine guard_gyms_privileged_columns() without its NEW.admin_notes line
--     (it would raise on the first owner INSERT once the column is gone).
--  4. Drop gyms.admin_notes (its column grant goes with it).
--  5. Re-issue the owner column-level SELECT grant without the admin_notes filter.
-- ============================================================

-- ── 1. table ─────────────────────────────────────────────────
DO $mig$
BEGIN
  IF to_regclass('public.gyms') IS NULL THEN
    RAISE NOTICE 'skipped (table missing): public.gyms';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.gym_admin_notes (
    gym_id     UUID        PRIMARY KEY REFERENCES public.gyms(id) ON DELETE CASCADE,
    notes      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.gym_admin_notes ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.gym_admin_notes FROM PUBLIC, anon, authenticated;
  GRANT ALL ON public.gym_admin_notes TO service_role;
END $mig$;

-- ── 2. copy existing notes ───────────────────────────────────
DO $mig$
BEGIN
  IF to_regclass('public.gym_admin_notes') IS NULL THEN
    RAISE NOTICE 'skipped (table missing): public.gym_admin_notes';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'gyms' AND column_name = 'admin_notes'
  ) THEN
    RAISE NOTICE 'skipped (column already gone): public.gyms.admin_notes';
    RETURN;
  END IF;

  EXECUTE $q$
    INSERT INTO public.gym_admin_notes (gym_id, notes)
    SELECT id, admin_notes FROM public.gyms
     WHERE admin_notes IS NOT NULL AND btrim(admin_notes) <> ''
    ON CONFLICT (gym_id) DO NOTHING
  $q$;
END $mig$;

-- ── 3. guard trigger function without the admin_notes reset ──
DO $mig$
BEGIN
  IF to_regprocedure('public.guard_gyms_privileged_columns()') IS NULL THEN
    RAISE NOTICE 'skipped (function missing): public.guard_gyms_privileged_columns()';
    RETURN;
  END IF;
  IF to_regprocedure('public.is_trusted_db_caller()') IS NULL THEN
    RAISE NOTICE 'skipped (function missing): public.is_trusted_db_caller()';
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.guard_gyms_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $body$
DECLARE
  -- Columns an owner may write. Everything else is admin/billing state.
  v_allowed TEXT[] := ARRAY['name','city','phone','gst_number','onboarding_completed','onboarding_data'];
BEGIN
  IF public.is_trusted_db_caller() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Onboarding may create the owner's gym, but only as a plain trial.
    IF NEW.owner_id IS DISTINCT FROM auth.uid()
       OR NEW.subscription_status <> 'trial'
       OR NEW.plan_type <> 'trial'
       OR NEW.is_active IS NOT TRUE
       OR NEW.subscription_ends_at IS NOT NULL
       OR (NEW.trial_ends_at IS NOT NULL AND NEW.trial_ends_at > now() + interval '31 days')
    THEN
      RAISE EXCEPTION 'gyms: owners can only create their own gym as a trial'
        USING ERRCODE = '42501';
    END IF;

    -- Reset every admin/billing field to its default for owner-created rows.
    NEW.is_vip                := false;
    NEW.is_payment_verified   := false;
    NEW.whatsapp_enabled      := true;
    NEW.priority_support      := false;
    NEW.auto_renewal_eligible := false;
    NEW.lifetime_offer        := false;
    NEW.login_disabled        := false;
    NEW.last_payment_amount   := NULL;
    NEW.last_payment_method   := NULL;
    NEW.last_transaction_id   := NULL;
    NEW.last_payment_date     := NULL;
    NEW.last_payment_status   := 'none';
    NEW.subscription_started_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: any change outside the allowlist is rejected.
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'gyms: only profile and onboarding fields can be changed by the owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$body$
  $fn$;
  REVOKE ALL ON FUNCTION public.guard_gyms_privileged_columns() FROM PUBLIC, anon, authenticated;
END $mig$;

-- ── 4. drop the column ───────────────────────────────────────
-- Only once the notes are safely in the new table (or the column never existed).
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'gyms' AND column_name = 'admin_notes'
  ) THEN
    RAISE NOTICE 'skipped (column already gone): public.gyms.admin_notes';
    RETURN;
  END IF;
  IF to_regclass('public.gym_admin_notes') IS NULL THEN
    RAISE NOTICE 'skipped (new table missing, column kept): public.gyms.admin_notes';
    RETURN;
  END IF;

  ALTER TABLE public.gyms DROP COLUMN admin_notes;
END $mig$;

-- ── 5. owner column-level SELECT on gyms (no filter any more) ─
DO $mig$
DECLARE
  v_cols TEXT;
BEGIN
  IF to_regclass('public.gyms') IS NULL THEN
    RAISE NOTICE 'skipped (table missing): public.gyms';
    RETURN;
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'gyms';

  REVOKE SELECT ON public.gyms FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.gyms TO authenticated', v_cols);
END $mig$;

NOTIFY pgrst, 'reload schema';
