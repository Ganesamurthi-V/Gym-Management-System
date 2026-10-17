-- ============================================================
-- RLS / privilege hardening (database-layer review, 2026-10-17)
--
-- Idempotent. Run in the Supabase SQL editor. It changes no table data and no
-- application code path: every policy keeps the access the app already uses and
-- only closes the gaps below. The same end state is folded into
-- supabase-schema.sql.
--
-- DEFENSIVE BY DESIGN: live databases were upgraded by hand and do not all have
-- every table, column or function in supabase-schema.sql (one had never run
-- add_inventory_units_table.sql, so a plain `ON inventory_units` aborted the
-- whole script with 42P01). Every step below first checks that its target
-- exists and otherwise prints a NOTICE ("skipped: ...") and moves on. Read the
-- notices after running: each one names an object your database is missing.
--
--  1. SECURITY DEFINER functions with `search_path = public` (no pg_temp) could
--     resolve relations through pg_temp first. All definer functions now pin
--     `public, pg_temp`.
--  2. Function EXECUTE: `REVOKE ... FROM anon` does nothing while PUBLIC still
--     holds the default grant. get_gym_dashboard, increment_inventory_stock and
--     the helper / trigger functions that were never revoked now go through an
--     explicit REVOKE ... FROM PUBLIC, anon and a deliberate GRANT.
--  3. Table privileges: anon has no business reading or writing any public table
--     (RLS already returns nothing; this makes it fail closed), and nobody but
--     the owner role needs TRUNCATE / REFERENCES / TRIGGER. TRUNCATE is not
--     subject to RLS at all.
--  4. UPDATE policies get an explicit WITH CHECK identical to USING, so a row
--     can never be moved to another gym even if Postgres' fallback is removed.
--  5. platform_settings (platform UPI + SaaS prices) was readable by every
--     signed-in member, not only owners.
--  6. subscription_requests: uploaded_file_url must live in the caller's own
--     payment-proofs folder (the admin app signs whatever path is stored).
--  7. member_portal_activity: a member may only log themself as performed_by
--     'member' (the owner feed shows performed_by).
--  8. support_tickets: owners could INSERT a ticket that is already 'resolved'
--     or admin-cleared; the guard trigger now also covers INSERT.
--  9. Storage: payment-proofs gets a 10 MB / JPG-PNG-PDF limit and only gym
--     owners (not members, not anon) may write or read in their own folder.
-- ============================================================

-- ── 1. pin search_path on definer functions (pg_temp last) ────
DO $mig$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.increment_inventory_stock(uuid, integer)',
    'public.sell_inventory_item(uuid, integer, numeric, text)',
    'public.increment_gym_usage_stat(uuid, text, integer)',
    'public.record_whatsapp_sent(uuid, integer)',
    'public.log_subscription_action(uuid, text, text, text, text, text, timestamptz, timestamptz, text, text)',
    'public.sync_usage_on_membership_insert()',
    'public.sync_usage_on_member_insert()',
    'public.sync_usage_on_attendance_insert()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
    ELSE
      RAISE NOTICE 'skipped (function missing): %', f;
    END IF;
  END LOOP;
END
$mig$;

-- ── 8. support_tickets: guard INSERT as well as UPDATE ────────
DO $mig$
BEGIN
  IF to_regclass('public.support_tickets') IS NULL THEN
    RAISE NOTICE 'skipped (table missing): support_tickets guard';
    RETURN;
  END IF;
  IF to_regprocedure('public.is_trusted_db_caller()') IS NULL THEN
    RAISE NOTICE 'skipped (function missing): is_trusted_db_caller(), needed by the support_tickets guard';
    RETURN;
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'support_tickets'
         AND column_name IN ('status', 'resolved_at', 'is_cleared_by_admin', 'is_cleared_by_owner')) < 4 THEN
    RAISE NOTICE 'skipped (columns missing): support_tickets status/resolved_at/is_cleared_by_admin/is_cleared_by_owner';
    RETURN;
  END IF;

  EXECUTE $q$
    CREATE OR REPLACE FUNCTION public.guard_support_tickets_owner_update()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = ''
    AS $fn$
    DECLARE
      v_allowed TEXT[] := ARRAY['is_cleared_by_owner'];
    BEGIN
      IF public.is_trusted_db_caller() THEN RETURN NEW; END IF;

      IF TG_OP = 'INSERT' THEN
        -- A new ticket always starts open and uncleared; resolving and clearing
        -- belong to the admin.
        NEW.status               := 'open';
        NEW.resolved_at          := NULL;
        NEW.is_cleared_by_admin  := false;
        NEW.is_cleared_by_owner  := false;
        RETURN NEW;
      END IF;

      IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
        RAISE EXCEPTION 'support_tickets: owners can only clear their own ticket view'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END;
    $fn$
  $q$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_guard_support_tickets_owner_update ON public.support_tickets';
  EXECUTE 'CREATE TRIGGER trg_guard_support_tickets_owner_update
             BEFORE INSERT OR UPDATE ON public.support_tickets
             FOR EACH ROW EXECUTE FUNCTION public.guard_support_tickets_owner_update()';
END
$mig$;

-- ── 4. UPDATE policies: explicit WITH CHECK ───────────────────
-- (table, policy name, USING/WITH CHECK expression). Skipped if the table or its
-- gym_id column is missing.
DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('admin_messages',  'Gym owners can mark messages as read',
       'EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())'),
      ('attendance',      'Gym owners can update attendance',
       'EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())'),
      ('due_payments',    'Gym owners can update due payments',
       'EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid())'),
      ('gym_plan_prices', 'Owner can update own plan prices',
       'gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())'),
      ('gym_upi_config',  'Gym owners can update their UPI config',
       'EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())'),
      ('inventory',       'Gym owners can update inventory',
       'EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid())'),
      ('inventory_sales', 'Gym owners can update inventory sales',
       'EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid())'),
      ('inventory_units', 'Gym owners can update inventory units',
       'EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())'),
      ('members',         'Gym owners can update members',
       'EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())'),
      ('memberships',     'Gym owners can update memberships',
       'EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid())'),
      ('support_tickets', 'Gym owners can update their support tickets',
       'EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid())'),
      ('whatsapp_messages', 'whatsapp_messages_update_policy',
       'gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())'),
      ('workout_programs', 'Gym owners can update programs',
       'EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())')
    ) AS t(tbl, pol, expr)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      RAISE NOTICE 'skipped (table missing): % (policy "%")', r.tbl, r.pol;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = 'gym_id') THEN
      RAISE NOTICE 'skipped (no gym_id column): % (policy "%")', r.tbl, r.pol;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
                   r.pol, r.tbl, r.expr, r.expr);
  END LOOP;

  -- gyms is keyed by owner_id rather than gym_id.
  IF to_regclass('public.gyms') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their own gym" ON public.gyms';
    EXECUTE 'CREATE POLICY "Users can update their own gym" ON public.gyms FOR UPDATE
               USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())';
  END IF;
END
$mig$;

-- ── 5. platform_settings: owners only ─────────────────────────
DO $mig$
BEGIN
  IF to_regclass('public.platform_settings') IS NULL THEN
    RAISE NOTICE 'skipped (table missing): platform_settings';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "Gym owners can read platform settings" ON public.platform_settings';
  EXECUTE 'CREATE POLICY "Gym owners can read platform settings"
             ON public.platform_settings FOR SELECT
             TO authenticated
             USING (EXISTS (SELECT 1 FROM public.gyms WHERE owner_id = (SELECT auth.uid())))';
END
$mig$;

-- ── 6. subscription_requests: proof must be in the caller's folder ──
DO $mig$
BEGIN
  IF to_regclass('public.subscription_requests') IS NULL THEN
    RAISE NOTICE 'skipped (table missing): subscription_requests';
    RETURN;
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subscription_requests'
         AND column_name IN ('gym_id', 'status', 'reviewed_at', 'reviewed_by', 'rejection_reason', 'uploaded_file_url')) < 6 THEN
    RAISE NOTICE 'skipped (columns missing): subscription_requests gym_id/status/reviewed_at/reviewed_by/rejection_reason/uploaded_file_url';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "gym owner insert own requests" ON public.subscription_requests';
  EXECUTE $q$
    CREATE POLICY "gym owner insert own requests"
      ON public.subscription_requests FOR INSERT
      TO authenticated
      WITH CHECK (
        gym_id IN (SELECT id FROM public.gyms WHERE owner_id = (SELECT auth.uid()))
        AND status = 'pending'
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
        AND rejection_reason IS NULL
        AND uploaded_file_url LIKE (SELECT auth.uid())::text || '/%'
        AND uploaded_file_url NOT LIKE '%..%'
      )
  $q$;
END
$mig$;

-- ── 7. member_portal_activity: members log themselves only ────
DO $mig$
BEGIN
  IF to_regclass('public.member_portal_activity') IS NULL THEN
    RAISE NOTICE 'skipped (table missing): member_portal_activity';
    RETURN;
  END IF;
  IF to_regprocedure('public.current_member_gym_id()') IS NULL THEN
    RAISE NOTICE 'skipped (function missing): current_member_gym_id(), needed by the member_portal_activity policy';
    RETURN;
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'member_portal_activity'
         AND column_name IN ('activity', 'performed_by', 'member_id', 'gym_id')) < 4 THEN
    RAISE NOTICE 'skipped (columns missing): member_portal_activity activity/performed_by/member_id/gym_id';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "Members can insert their own login activity" ON public.member_portal_activity';
  EXECUTE $q$
    CREATE POLICY "Members can insert their own login activity"
      ON public.member_portal_activity FOR INSERT
      TO authenticated
      WITH CHECK (
        activity = 'logged_in'
        AND performed_by = 'member'
        AND member_id IN (
          SELECT id FROM public.members
          WHERE auth_user_id = (SELECT auth.uid())
        )
        AND gym_id = public.current_member_gym_id()
      )
  $q$;
END
$mig$;

-- ── 3. table privileges ───────────────────────────────────────
-- anon never uses a table directly; TRUNCATE / REFERENCES / TRIGGER bypass RLS
-- and are not needed by any API role. (Views are included by relkind.) This loop
-- only visits tables that exist, so it needs no guard.
DO $mig$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', r.relname);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', r.relname);
  END LOOP;
END
$mig$;

-- ── 2. function privileges ────────────────────────────────────
DO $mig$
DECLARE
  r RECORD;
BEGIN
  -- (signature, grant EXECUTE to)  NULL = nobody but the owner / service_role
  FOR r IN
    SELECT * FROM (VALUES
      ('public.get_gym_dashboard(uuid, date)',             'authenticated'),
      ('public.increment_inventory_stock(uuid, integer)',  'authenticated'),
      ('public.sync_usage_on_membership_insert()',         NULL),
      ('public.sync_usage_on_member_insert()',             NULL),
      ('public.sync_usage_on_attendance_insert()',         NULL),
      ('public.update_whatsapp_messages_updated_at()',     NULL),
      ('public.generate_member_code()',                    NULL),
      ('public.guard_member_auth_user_link()',             NULL),
      ('public.guard_gym_events()',                        NULL),
      ('public.delete_old_whatsapp_webhook_logs()',        'service_role')
    ) AS t(sig, grantee)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE NOTICE 'skipped (function missing): %', r.sig;
      CONTINUE;
    END IF;
    IF r.grantee = 'authenticated' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    ELSE
      -- Trigger-only / maintenance functions: nobody calls these over the API.
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    END IF;
    IF r.grantee IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', r.sig, r.grantee);
    END IF;
  END LOOP;
END
$mig$;

-- ── 9. storage: payment-proofs ────────────────────────────────
DO $mig$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'skipped (storage schema missing): payment-proofs bucket and policies';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'storage' AND table_name = 'buckets'
         AND column_name IN ('file_size_limit', 'allowed_mime_types')) = 2 THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('payment-proofs', 'payment-proofs', false, 10485760,
              ARRAY['image/jpeg', 'image/png', 'application/pdf'])
      ON CONFLICT (id) DO UPDATE
        SET public             = false,
            file_size_limit    = 10485760,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];
  ELSE
    RAISE NOTICE 'skipped (old storage schema): payment-proofs size/type limit';
    INSERT INTO storage.buckets (id, name, public)
      VALUES ('payment-proofs', 'payment-proofs', false)
      ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;

  IF to_regprocedure('storage.foldername(text)') IS NULL THEN
    RAISE NOTICE 'skipped (function missing): storage.foldername(text), payment-proof policies';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "gym owner upload payment proof" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "gym owner upload payment proof"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'payment-proofs'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        AND EXISTS (SELECT 1 FROM public.gyms WHERE owner_id = (SELECT auth.uid()))
      )
  $q$;

  EXECUTE 'DROP POLICY IF EXISTS "gym owner read own payment proofs" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "gym owner read own payment proofs"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'payment-proofs'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      )
  $q$;
END
$mig$;

NOTIFY pgrst, 'reload schema';
