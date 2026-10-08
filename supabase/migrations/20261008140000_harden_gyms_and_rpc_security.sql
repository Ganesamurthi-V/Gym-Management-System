-- ============================================================
-- Security hardening: stop owners editing privileged columns, close
-- check_gym_active to anonymous callers.
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================================
--
-- Why: the owner RLS policies on gyms / support_tickets / admin_messages /
-- subscription_requests are row-level only. With the public anon key an owner
-- can PATCH /rest/v1/gyms with their own JWT and set subscription_status =
-- 'active', plan_type = 'lifetime', subscription_ends_at = <far future>,
-- is_active, login_disabled, ... — a one-request paywall bypass.
--
-- Approach: BEFORE triggers with an ALLOWLIST of columns the owner app really
-- writes (checked against app/api/account/gym, onboarding/complete, tours,
-- support/clear, notifications page). An allowlist means any column added later
-- is protected by default. service_role / postgres (admin app, crons, SQL
-- editor) are exempt, so gymflow-admin keeps working.

-- ── helper: is the caller a trusted server role? ─────────────
CREATE OR REPLACE FUNCTION public.is_trusted_db_caller()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT current_user IN ('postgres', 'supabase_admin', 'service_role')
      OR coalesce(auth.role(), '') = 'service_role'
$$;
REVOKE ALL ON FUNCTION public.is_trusted_db_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trusted_db_caller() TO authenticated, service_role;

-- ── 1. gyms: owners may change only profile/onboarding fields ─
CREATE OR REPLACE FUNCTION public.guard_gyms_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
    NEW.admin_notes           := NULL;
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
$$;
REVOKE ALL ON FUNCTION public.guard_gyms_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_gyms_privileged_columns ON public.gyms;
CREATE TRIGGER trg_guard_gyms_privileged_columns
  BEFORE INSERT OR UPDATE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.guard_gyms_privileged_columns();

-- ── 2. support_tickets: owners may only clear their own copy ──
CREATE OR REPLACE FUNCTION public.guard_support_tickets_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY['is_cleared_by_owner'];
BEGIN
  IF public.is_trusted_db_caller() THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'support_tickets: owners can only clear their own ticket view'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_support_tickets_owner_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_support_tickets_owner_update ON public.support_tickets;
CREATE TRIGGER trg_guard_support_tickets_owner_update
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_tickets_owner_update();

-- ── 3. admin_messages: owners may only mark read / clear ──────
-- Without this an owner can rewrite subject/body/sent_by and forge a
-- "message from super admin".
CREATE OR REPLACE FUNCTION public.guard_admin_messages_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY['read_at','is_cleared_by_owner'];
BEGIN
  IF public.is_trusted_db_caller() THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'admin_messages: owners can only mark messages read or cleared'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admin_messages_owner_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_admin_messages_owner_update ON public.admin_messages;
CREATE TRIGGER trg_guard_admin_messages_owner_update
  BEFORE UPDATE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_messages_owner_update();

-- ── 4. subscription_requests: owners can only file 'pending' ──
-- Re-create the INSERT policy so an owner cannot insert a row that is already
-- approved/rejected or carries a reviewer.
DROP POLICY IF EXISTS "gym owner insert own requests" ON public.subscription_requests;
CREATE POLICY "gym owner insert own requests"
  ON public.subscription_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    gym_id IN (SELECT id FROM public.gyms WHERE owner_id = (SELECT auth.uid()))
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND rejection_reason IS NULL
  );

-- ── 5. check_gym_active: close to anonymous callers ───────────
-- It was SECURITY DEFINER, no search_path, executable by PUBLIC, so anyone
-- could probe /rest/v1/rpc/check_gym_active to learn which emails are gym
-- owners and whether the account is active/suspended.
-- Callers must now use the service role (server-side login route).
CREATE OR REPLACE FUNCTION public.check_gym_active(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN g.is_active = false                   THEN false
      WHEN g.subscription_status = 'expired'     THEN false
      WHEN g.subscription_status = 'cancelled'   THEN false
      WHEN g.subscription_status = 'suspended'   THEN false
      WHEN g.subscription_status = 'trial'
           AND g.trial_ends_at < now()           THEN false
      WHEN g.subscription_status = 'active'
           AND g.subscription_ends_at IS NOT NULL
           AND g.subscription_ends_at < now()    THEN false
      ELSE true
    END
  FROM auth.users u
  JOIN public.gyms g ON g.owner_id = u.id
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.check_gym_active(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_gym_active(TEXT) TO service_role;

-- ── 6. sell_inventory_item: not callable anonymously ──────────
REVOKE ALL ON FUNCTION public.sell_inventory_item(UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_inventory_item(UUID, INTEGER, NUMERIC, TEXT) TO authenticated;

-- ── 7. defense in depth for policy-less internal tables ───────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_config','notifications','device_push_tokens'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── 8. dead policy: service_role bypasses RLS, so this never matched ──
DROP POLICY IF EXISTS whatsapp_webhook_logs_admin_policy ON public.whatsapp_webhook_logs;
DO $$
BEGIN
  IF to_regclass('public.whatsapp_webhook_logs') IS NOT NULL THEN
    REVOKE ALL ON public.whatsapp_webhook_logs FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
