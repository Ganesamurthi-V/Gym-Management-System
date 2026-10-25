-- =============================================================
-- GymFlow — Free plan (up to 50 members) and paid WhatsApp add-on
--
-- * gyms.plan_type accepts 'free'.
-- * gyms.whatsapp_addon_until: paid add-on end date (admin/billing state; the
--   existing gyms column guard already rejects owner writes to it).
-- * Owners cannot downgrade a paid plan to free/trial (trigger).
-- * owner_switch_to_free(): the only owner route onto the free plan, trial-end only.
-- * Free gyms are capped at 50 members by a BEFORE INSERT trigger on members.
-- * subscription_requests.plan_requested is added separately (20261026100000).
--
-- Deploy together with the app release. Safe to re-run.
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

ALTER TABLE gyms DROP CONSTRAINT IF EXISTS gyms_plan_type_check;
ALTER TABLE gyms
  ADD CONSTRAINT gyms_plan_type_check
  CHECK (plan_type IN ('free', 'trial', 'monthly', 'quarterly', 'yearly', 'lifetime'));

ALTER TABLE gyms ADD COLUMN IF NOT EXISTS whatsapp_addon_until TIMESTAMPTZ;
-- Owners read gyms through a column-level SELECT grant (20261008160000), so a new
-- column is unreadable until granted. getGymCore selects this column on every
-- owner page; without the grant the whole owner console fails with
-- "permission denied for column". Read-only for owners: the column guard still
-- rejects writes.
GRANT SELECT (whatsapp_addon_until) ON public.gyms TO authenticated;

-- Owner-created gyms must not start with a paid WhatsApp add-on, so the insert
-- branch of the gyms column guard also resets whatsapp_addon_until.
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
    NEW.last_payment_amount   := NULL;
    NEW.last_payment_method   := NULL;
    NEW.last_transaction_id   := NULL;
    NEW.last_payment_date     := NULL;
    NEW.last_payment_status   := 'none';
    NEW.subscription_started_at := NULL;
    NEW.whatsapp_addon_until  := NULL;
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

-- ── 1b. gyms: a paid plan cannot be downgraded to free/trial by hand ──
-- Without this a paid gym could be flipped to 'free' by a bug or a stray
-- service call and silently keep its data under a 50-member cap, or be reset
-- to 'trial' to get fresh trial days. Only trusted server roles (admin app,
-- SQL editor) may do it.
CREATE OR REPLACE FUNCTION public.guard_gyms_plan_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.plan_type IN ('monthly', 'quarterly', 'yearly', 'lifetime')
     AND NEW.plan_type IN ('free', 'trial')
     AND NOT public.is_trusted_db_caller()
  THEN
    RAISE EXCEPTION 'gyms: a paid plan cannot be changed to %', NEW.plan_type
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 1c. owner_switch_to_free: the only owner path onto the free plan ──
-- Takes no arguments: the gym comes from auth.uid() and every eligibility rule
-- is re-checked here under a row lock, so the client cannot pick a gym, skip
-- the trial, or race a member import past the 50-member cap. It runs as the
-- definer, so the gyms column guard treats the write as trusted.
CREATE OR REPLACE FUNCTION public.owner_switch_to_free()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id   UUID;
  v_plan     TEXT;
  v_trial_end TIMESTAMPTZ;
BEGIN
  SELECT id, plan_type, trial_ends_at
    INTO v_gym_id, v_plan, v_trial_end
    FROM public.gyms
   WHERE owner_id = auth.uid()
   FOR UPDATE;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'no gym for caller' USING ERRCODE = '42501';
  END IF;
  IF v_plan <> 'trial' THEN
    RAISE EXCEPTION 'free plan is only available at trial end' USING ERRCODE = '42501';
  END IF;
  IF v_trial_end IS NULL OR v_trial_end > now() THEN
    RAISE EXCEPTION 'trial has not ended' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.members WHERE gym_id = v_gym_id) > 50 THEN
    RAISE EXCEPTION 'free plan allows 50 members' USING ERRCODE = '23514';
  END IF;

  UPDATE public.gyms
     SET plan_type = 'free',
         subscription_status = 'active',
         subscription_ends_at = NULL
   WHERE id = v_gym_id;
END;
$$;

-- ── 1d. members: free plan is capped at 50 members ──
-- Enforced in the database so every insert path (owner API, bulk import,
-- member self-signup) is covered. The gym row lock serialises concurrent
-- inserts, otherwise two requests at 49 members would both pass the count.
CREATE OR REPLACE FUNCTION public.enforce_free_plan_member_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT plan_type INTO v_plan
    FROM public.gyms
   WHERE id = NEW.gym_id
   FOR UPDATE;

  IF v_plan = 'free'
     AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= 50
  THEN
    RAISE EXCEPTION 'free_plan_member_limit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_gyms_plan_downgrade ON public.gyms;
CREATE TRIGGER trg_guard_gyms_plan_downgrade
  BEFORE UPDATE OF plan_type ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.guard_gyms_plan_downgrade();

DROP TRIGGER IF EXISTS trg_enforce_free_plan_member_cap ON public.members;
CREATE TRIGGER trg_enforce_free_plan_member_cap
  BEFORE INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_member_cap();

REVOKE ALL ON FUNCTION public.guard_gyms_plan_downgrade()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_free_plan_member_cap()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_switch_to_free()   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_switch_to_free() TO authenticated;

NOTIFY pgrst, 'reload schema';
