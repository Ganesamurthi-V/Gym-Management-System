-- Subscription hardening. Idempotent: safe to run more than once. Apply in the
-- Supabase SQL editor together with the app deploy of the same release (the
-- admin app calls approve_plan_payment(), which exists only after this runs).
--
--   F. One gym per owner (unique index) and members.gym_id fixed after insert.
--   G. A trial with no end date is closed, not endless.
--   H. approve_plan_payment(): atomic paid-plan approval that renews from the
--      remaining time.
--   I. subscription_requests.expected_amount_inr stamped from platform_settings.
--   K. member_app_allowed(): the member app gate in the database, applied to
--      every member-facing RLS policy and member RPC.
--   M. gyms.login_disabled always mirrors is_active.
--   N. plan_member_limit() and platform_settings.whatsapp_addon_price_inr as the
--      single sources of the 50-member limit and the add-on price.
--
-- BEHAVIOUR NOTE: the member RPCs now raise 'member_app_not_allowed' (42501) for a
-- blocked member, and member policies return no rows for one. The app already
-- gates these members itself, so this only closes direct PostgREST access.

-- ════════════════════════════════════════════════════════════
-- N. Single sources (first: later objects call plan_member_limit())
-- ════════════════════════════════════════════════════════════
-- ── plan_member_limit: the one member limit of Free and trial ──
-- Free gyms are capped at this many members; a trial's Member App and imports
-- cover this many. Every SQL rule reads it from here so the number lives in one
-- place, and PLAN_MEMBER_LIMIT in lib/subscription-utils.ts must equal it (a
-- test compares the two).
CREATE OR REPLACE FUNCTION public.plan_member_limit()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 50
$$;
REVOKE ALL ON FUNCTION public.plan_member_limit()     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_member_limit()  TO authenticated, service_role;

-- The add-on price, read by the request trigger, the approval function and the
-- admin notification. platform_settings has a table-level SELECT grant for
-- authenticated, so owners can read the new column without a column grant.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS whatsapp_addon_price_inr INT NOT NULL DEFAULT 299;
ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_whatsapp_addon_price_inr_check;
ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_whatsapp_addon_price_inr_check
  CHECK (whatsapp_addon_price_inr > 0);

-- ════════════════════════════════════════════════════════════
-- F. One gym per owner; members stay in their gym
-- ════════════════════════════════════════════════════════════

-- Fails loudly instead of deleting anything: the operator decides which gym
-- each listed owner keeps, then re-runs this file.
DO $$
DECLARE
  v_owners TEXT;
BEGIN
  SELECT string_agg(owner_id::text, ', ')
    INTO v_owners
    FROM (SELECT owner_id FROM public.gyms GROUP BY owner_id HAVING count(*) > 1) d;
  IF v_owners IS NOT NULL THEN
    RAISE EXCEPTION 'owners with more than one gym, resolve before adding uq_gyms_owner_id: %', v_owners;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gyms_owner_id ON public.gyms(owner_id);

-- ── 1f. members: gym_id is fixed after insert ──
-- The Free member cap is enforced on INSERT only, so moving existing members
-- from a trial gym into a Free gym by UPDATE would bypass it (and would move a
-- member's history across tenants). Only trusted server roles may re-home one.
CREATE OR REPLACE FUNCTION public.guard_members_gym_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.gym_id IS DISTINCT FROM OLD.gym_id AND NOT public.is_trusted_db_caller() THEN
    RAISE EXCEPTION 'members: gym_id cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_members_gym_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_members_gym_id ON public.members;
CREATE TRIGGER trg_guard_members_gym_id
  BEFORE UPDATE OF gym_id ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_members_gym_id();

-- ════════════════════════════════════════════════════════════
-- G. NULL trial end
-- ════════════════════════════════════════════════════════════

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
      -- A trial with no end date is not open-ended: without the IS NULL arm the
      -- comparison is NULL and the row fell through to ELSE true.
      WHEN g.subscription_status = 'trial'
           AND (g.trial_ends_at IS NULL
                OR g.trial_ends_at < now())      THEN false
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
       -- A NULL trial end would be an endless trial (check_gym_active and the
       -- paywall read it as expired, but nothing should depend on that).
       OR NEW.trial_ends_at IS NULL
       OR NEW.trial_ends_at > now() + interval '31 days'
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

-- ════════════════════════════════════════════════════════════
-- I. Expected amount on payment requests
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS expected_amount_inr INTEGER;

-- ── subscription_requests: stamp the expected amount ──
-- Owners insert their own payment proofs under RLS, so a client-supplied
-- amount cannot be trusted: the price is always read from platform_settings at
-- submit time, overriding whatever was sent. The admin compares it with the
-- UPI screenshot, and approval records it as last_payment_amount. Definer so it
-- can read platform_settings whatever the caller's grants.
CREATE OR REPLACE FUNCTION public.set_subscription_request_expected_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.expected_amount_inr := CASE NEW.plan_requested
    WHEN 'monthly'        THEN (SELECT ps.price_monthly            FROM public.platform_settings ps WHERE ps.id = 1)
    WHEN 'yearly'         THEN (SELECT ps.price_yearly             FROM public.platform_settings ps WHERE ps.id = 1)
    WHEN 'whatsapp_addon' THEN (SELECT ps.whatsapp_addon_price_inr FROM public.platform_settings ps WHERE ps.id = 1)
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_subscription_request_expected_amount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_subscription_request_expected_amount ON public.subscription_requests;
CREATE TRIGGER trg_set_subscription_request_expected_amount
  BEFORE INSERT ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_request_expected_amount();

-- ════════════════════════════════════════════════════════════
-- H. Atomic paid-plan approval
-- ════════════════════════════════════════════════════════════

-- ── approve_plan_payment: atomic admin approval of a plan payment ──
-- Service-role only (the admin app). Request lock, gym lock and both writes are
-- one transaction, so a double click or two admins cannot approve the same
-- proof twice and stack two periods. An early renewal of a running paid plan
-- extends from its current end date, so the owner does not lose the days left;
-- anything else (trial, Free, lapsed) starts from now. lifetime is an admin
-- grant and may be given for any request. Runs as the definer, so the gyms
-- column guard treats the billing writes as trusted.
CREATE OR REPLACE FUNCTION public.approve_plan_payment(
  p_request_id  UUID,
  p_gym_id      UUID,
  p_plan        TEXT,
  p_reviewed_by TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req     public.subscription_requests%ROWTYPE;
  v_gym     public.gyms%ROWTYPE;
  v_renewal BOOLEAN;
  v_base    TIMESTAMPTZ;
  v_end     TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_req
    FROM public.subscription_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- The caller's gym id must match the stored one, so a stale or forged pair
  -- cannot activate a different gym.
  IF v_req.gym_id <> p_gym_id THEN
    RAISE EXCEPTION 'request_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = 'P0001';
  END IF;
  -- Add-on payments go through approve_whatsapp_addon().
  IF v_req.plan_requested = 'whatsapp_addon' THEN
    RAISE EXCEPTION 'request_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('monthly', 'yearly', 'lifetime') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = 'P0001';
  END IF;
  -- A monthly payment cannot be approved as a year. NULL plan_requested is a
  -- legacy row, where the admin picks the plan.
  IF v_req.plan_requested IS NOT NULL
     AND p_plan <> v_req.plan_requested
     AND p_plan <> 'lifetime'
  THEN
    RAISE EXCEPTION 'plan_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_gym
    FROM public.gyms
   WHERE id = p_gym_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_renewal := v_gym.subscription_status = 'active'
               AND v_gym.plan_type IN ('monthly', 'quarterly', 'yearly')
               AND v_gym.subscription_ends_at > now();
  v_renewal := COALESCE(v_renewal, false);
  v_base := CASE WHEN v_renewal THEN v_gym.subscription_ends_at ELSE now() END;
  v_end  := CASE p_plan
              WHEN 'monthly' THEN v_base + interval '1 month'
              WHEN 'yearly'  THEN v_base + interval '1 year'
              ELSE NULL  -- lifetime: no end date
            END;

  UPDATE public.gyms
     SET plan_type               = p_plan,
         subscription_status     = 'active',
         subscription_ends_at    = v_end,
         -- A renewal keeps the original start date.
         subscription_started_at = CASE WHEN v_renewal THEN subscription_started_at ELSE now() END,
         is_payment_verified     = true,
         last_payment_status     = 'paid',
         last_payment_date       = now(),
         last_payment_amount     = v_req.expected_amount_inr,
         last_transaction_id     = v_req.transaction_id
   WHERE id = p_gym_id;

  UPDATE public.subscription_requests
     SET status      = 'approved',
         reviewed_at = now(),
         reviewed_by = p_reviewed_by
   WHERE id = p_request_id;

  RETURN v_end;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_plan_payment(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_plan_payment(UUID, UUID, TEXT, TEXT) TO service_role;

-- ════════════════════════════════════════════════════════════
-- N (cont.). Limit and price read from the single sources
-- ════════════════════════════════════════════════════════════

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
  v_status   TEXT;
  v_active   BOOLEAN;
BEGIN
  SELECT id, plan_type, trial_ends_at, subscription_status, is_active
    INTO v_gym_id, v_plan, v_trial_end, v_status, v_active
    FROM public.gyms
   WHERE owner_id = auth.uid()
   FOR UPDATE;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'no gym for caller' USING ERRCODE = '42501';
  END IF;
  -- The switch sets status 'active', so it must not run on a gym an admin suspended,
  -- cancelled or deactivated: that would let the owner undo the admin's action.
  IF v_active IS NOT TRUE OR v_status NOT IN ('trial', 'expired') THEN
    RAISE EXCEPTION 'free plan is not available for a suspended or cancelled gym' USING ERRCODE = '42501';
  END IF;
  IF v_plan <> 'trial' THEN
    RAISE EXCEPTION 'free plan is only available at trial end' USING ERRCODE = '42501';
  END IF;
  IF v_trial_end IS NULL OR v_trial_end > now() THEN
    RAISE EXCEPTION 'trial has not ended' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.members WHERE gym_id = v_gym_id) > public.plan_member_limit() THEN
    RAISE EXCEPTION 'free plan allows 50 members' USING ERRCODE = '23514';
  END IF;

  UPDATE public.gyms
     SET plan_type = 'free',
         subscription_status = 'active',
         subscription_ends_at = NULL
   WHERE id = v_gym_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_free_plan_member_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  -- Unlocked read first. Paid gyms (most inserts) can never move to free or
  -- trial (guard_gyms_plan_downgrade), so they skip the gym row lock and their
  -- inserts do not queue behind other updates to the gyms row.
  SELECT plan_type INTO v_plan
    FROM public.gyms
   WHERE id = NEW.gym_id;

  IF v_plan IN ('free', 'trial') THEN
    -- Re-read under the row lock: serialises concurrent inserts (two requests
    -- at 49 members cannot both pass) and orders them against
    -- owner_switch_to_free, which counts members under the same lock.
    SELECT plan_type INTO v_plan
      FROM public.gyms
     WHERE id = NEW.gym_id
     FOR UPDATE;

    IF v_plan = 'free'
       AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= public.plan_member_limit()
    THEN
      RAISE EXCEPTION 'free_plan_member_limit' USING ERRCODE = '23514';
    END IF;

    -- Trial: imports (not manual adds) stop at 50 members for the whole gym. The
    -- lock makes a concurrent second import fail here, which the import route
    -- reports as the upgrade message rather than a generic error.
    IF v_plan = 'trial'
       AND NEW.is_imported IS TRUE
       AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= public.plan_member_limit()
    THEN
      RAISE EXCEPTION 'trial_import_member_limit' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_whatsapp_addon(
  p_request_id  UUID,
  p_gym_id      UUID,
  p_reviewed_by TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req   public.subscription_requests%ROWTYPE;
  v_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_req
    FROM public.subscription_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- The caller's gym id must match the stored one, so a stale or forged pair
  -- cannot extend a different gym's add-on.
  IF v_req.gym_id <> p_gym_id OR v_req.plan_requested IS DISTINCT FROM 'whatsapp_addon' THEN
    RAISE EXCEPTION 'request_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = 'P0001';
  END IF;

  -- Renewing early extends from the current end date instead of losing days.
  SELECT greatest(now(), coalesce(whatsapp_addon_until, now())) + interval '30 days'
    INTO v_until
    FROM public.gyms
   WHERE id = p_gym_id
   FOR UPDATE;

  UPDATE public.subscription_requests
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = p_reviewed_by
   WHERE id = p_request_id;

  UPDATE public.gyms
     SET whatsapp_addon_until = v_until,
         -- The amount stamped on the request at submit time; the current price
         -- only for legacy rows filed before expected_amount_inr existed.
         last_payment_amount  = COALESCE(
                                  v_req.expected_amount_inr,
                                  (SELECT ps.whatsapp_addon_price_inr
                                     FROM public.platform_settings ps
                                    WHERE ps.id = 1)
                                ),
         last_payment_date    = now(),
         last_payment_status  = 'paid',
         last_transaction_id  = v_req.transaction_id
   WHERE id = p_gym_id;

  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_subscription_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
  v_gym      TEXT;
  v_plan     TEXT;
  v_txn      TEXT;
  v_notes    TEXT;
  v_what     TEXT;
  v_title    TEXT;
  v_body     TEXT;
  v_addon_price INT;
BEGIN
  BEGIN
    IF NEW.status = 'pending' THEN
      SELECT name, plan_type INTO v_gym_name, v_plan FROM public.gyms WHERE id = NEW.gym_id;
      SELECT whatsapp_addon_price_inr INTO v_addon_price FROM public.platform_settings WHERE id = 1;
      v_gym   := COALESCE(NULLIF(btrim(v_gym_name), ''), 'A gym');
      v_txn   := public.notification_snippet(NEW.transaction_id, 40);
      v_notes := public.notification_snippet(NEW.notes, 120);

      -- What was paid for goes first: a push preview cuts the body short, and an
      -- add-on request must not be mistaken for a plan renewal.
      v_what := CASE NEW.plan_requested
                  WHEN 'whatsapp_addon' THEN ' Requested: WhatsApp automation add-on (Rs '
                                             || COALESCE(v_addon_price::text, '?') || ' / 30 days).'
                  WHEN 'monthly'        THEN ' Requested plan: Monthly.'
                  WHEN 'yearly'         THEN ' Requested plan: Yearly.'
                  ELSE ''
                END;
      v_title := CASE WHEN NEW.plan_requested = 'whatsapp_addon'
                      THEN 'WhatsApp add-on request — '
                      ELSE 'Payment proof awaiting review — '
                 END || v_gym;

      -- e.g. "Fit Zone Gym submitted a payment proof and is waiting for approval.
      --       Requested plan: Monthly. Current plan: trial. Txn: ABC123. Note: paid via GPay"
      v_body := v_gym || ' submitted a payment proof and is waiting for approval.'
                || v_what
                || CASE WHEN COALESCE(v_plan, '') <> '' THEN ' Current plan: ' || v_plan || '.' ELSE '' END
                || CASE WHEN v_txn   <> '' THEN ' Txn: '  || v_txn   || '.' ELSE '' END
                || CASE WHEN v_notes <> '' THEN ' Note: ' || v_notes        ELSE '' END;

      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'payment_request',
        NEW.gym_id,
        v_title,
        v_body,
        NEW.id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_subscription_request failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- M. login_disabled mirrors is_active
-- ════════════════════════════════════════════════════════════

-- ── 1e. gyms: login_disabled always mirrors is_active ──
-- Two flags for one ban drifted apart (an admin re-activated a gym but the old
-- login_disabled stayed set, or the other way round). is_active is the one the
-- admin writes; login_disabled is derived here so older readers stay correct.
--
-- Trigger ORDER matters: Postgres fires BEFORE ROW triggers in name order, and
-- trg_sync_gyms_login_disabled sorts after trg_guard_gyms_privileged_columns
-- and trg_guard_gyms_plan_downgrade. The owner column guard therefore compares
-- the owner's own NEW against OLD before this trigger touches the row, so a
-- stale login_disabled on an old row can never make an owner's profile save
-- fail. After that, an owner cannot change is_active (the guard rejects it), so
-- for owners this only re-derives the value the row already holds.
CREATE OR REPLACE FUNCTION public.sync_gyms_login_disabled()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.login_disabled := NOT COALESCE(NEW.is_active, true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_gyms_login_disabled() FROM PUBLIC, anon, authenticated;

-- Backfill before the trigger exists. Runs as the migration operator, which the
-- column guard treats as trusted.
UPDATE public.gyms
   SET login_disabled = NOT is_active
 WHERE login_disabled IS DISTINCT FROM NOT is_active;

-- Named to sort after both trg_guard_gyms_* triggers (BEFORE triggers fire in
-- name order); see sync_gyms_login_disabled() for why that order matters.
DROP TRIGGER IF EXISTS trg_sync_gyms_login_disabled ON public.gyms;
CREATE TRIGGER trg_sync_gyms_login_disabled
  BEFORE INSERT OR UPDATE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.sync_gyms_login_disabled();

-- ════════════════════════════════════════════════════════════
-- K. Member app gate in the database
-- ════════════════════════════════════════════════════════════

-- member_app_allowed() ranks a trial gym's members by (created_at, id) on every
-- gated member query; this serves that ordered LIMIT without a sort.
CREATE INDEX IF NOT EXISTS idx_members_gym_created_id ON public.members(gym_id, created_at, id);

-- ── member_app_allowed: may the signed-in member use the member app? ──
-- The database copy of the member app gate, so a member JWT cannot read app
-- data straight through PostgREST once the gym loses access. Mirrors
-- computeSubscriptionState() in lib/subscription-utils.ts exactly (a NULL status
-- is a legacy gym and counts as active; any unknown status counts as expired),
-- plus the plan rules: no app on Free, and on a trial only the gym's first
-- plan_member_limit() members by (created_at, id), the same order
-- getTrialEligibleMemberIds() uses.
--
-- Deliberately NOT applied to the members own-row policy, get_member_gym() or
-- current_member_gym_id(): the app must still tell a blocked member from a
-- non-member and show the right screen. Takes no argument; the member comes
-- from auth.uid(). plpgsql so it can be created before the tables' policies
-- and RPCs that call it without ordering concerns.
CREATE OR REPLACE FUNCTION public.member_app_allowed()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id UUID;
  v_gym_id    UUID;
  v_plan      TEXT;
  v_active    BOOLEAN;
  v_status    TEXT;
  v_sub_end   TIMESTAMPTZ;
  v_trial_end TIMESTAMPTZ;
BEGIN
  SELECT m.id, m.gym_id INTO v_member_id, v_gym_id
    FROM public.members m
   WHERE m.auth_user_id = auth.uid()
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT g.plan_type, g.is_active, g.subscription_status, g.subscription_ends_at, g.trial_ends_at
    INTO v_plan, v_active, v_status, v_sub_end, v_trial_end
    FROM public.gyms g
   WHERE g.id = v_gym_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_plan = 'free' OR v_active IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF v_status IS NOT NULL THEN
    IF v_status IN ('cancelled', 'suspended', 'expired') THEN
      RETURN false;
    END IF;
    -- The cron may not have flipped a lapsed row yet; NULL end = lifetime.
    IF v_status = 'active' AND v_sub_end IS NOT NULL AND v_sub_end <= now() THEN
      RETURN false;
    END IF;
    IF v_status = 'trial' AND (v_trial_end IS NULL OR v_trial_end <= now()) THEN
      RETURN false;
    END IF;
    IF v_status NOT IN ('trial', 'active') THEN
      RETURN false;
    END IF;
  END IF;

  IF v_plan = 'trial' AND NOT EXISTS (
    SELECT 1
      FROM (SELECT m.id
              FROM public.members m
             WHERE m.gym_id = v_gym_id
             ORDER BY m.created_at, m.id
             LIMIT public.plan_member_limit()) first_members
     WHERE first_members.id = v_member_id
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.member_app_allowed()    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_app_allowed() TO authenticated;

-- Member RPCs: same bodies, plus the gate. get_gym_leaderboard checks it only on
-- the member branch, since owners call it too.

CREATE OR REPLACE FUNCTION public.get_member_gamification()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_member_id   UUID;
  v_gym_id      UUID;
  v_portal      BOOLEAN;
  v_visible     BOOLEAN;
  -- The real IST calendar date, and the date used to decide whether a streak
  -- is still alive (see RULES above).
  v_ist_today   DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_gym_today   DATE := ((now() - INTERVAL '5 hours') AT TIME ZONE 'Asia/Kolkata')::date;
  -- settings
  v_enabled     BOOLEAN;
  v_xp_checkin  INT;
  v_xp_renewal  INT;
  v_xp_portal   INT;
  v_weekly_goal INT;
  v_multipliers JSONB;
  v_badge_rules JSONB;
  v_weekly_prize  TEXT;
  v_monthly_prize TEXT;
  -- results
  v_total_days  INT;
  v_d7          INT;
  v_d30         INT;
  v_checkin_xp  INT;
  v_longest     INT;
  v_cur_len     INT;
  v_last_day    DATE;
  v_streak      INT := 0;
  v_pending     BOOLEAN := false;
  v_memberships INT;
  v_morning     INT;
  v_xp          INT;
  v_event_xp    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.id, m.gym_id, (m.portal_activated_at IS NOT NULL), m.show_on_leaderboard
    INTO v_member_id, v_gym_id, v_portal, v_visible
    FROM members m
   WHERE m.auth_user_id = v_uid
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Member app is off for this member's gym (Free plan, lapsed or blocked
  -- subscription, or outside the trial's first members). Raised rather than
  -- returning NULL so the app can tell "blocked" from "not a member".
  IF NOT public.member_app_allowed() THEN
    RAISE EXCEPTION 'member_app_not_allowed' USING ERRCODE = '42501';
  END IF;

  -- LEFT JOIN from a one-row source so a gym with no settings row still yields
  -- a row of defaults (SELECT INTO on zero rows would null every variable).
  SELECT COALESCE(s.leaderboards_enabled, true),
         COALESCE(s.xp_per_checkin, 10),
         COALESCE(s.xp_per_renewal, 50),
         COALESCE(s.xp_portal_activation, 25),
         COALESCE(s.weekly_goal_days, 4),
         COALESCE(s.xp_multipliers, '[]'::jsonb),
         COALESCE(s.badge_rules, '{}'::jsonb),
         s.weekly_prize,
         s.monthly_prize
    INTO v_enabled, v_xp_checkin, v_xp_renewal, v_xp_portal, v_weekly_goal,
         v_multipliers, v_badge_rules, v_weekly_prize, v_monthly_prize
    FROM (SELECT 1) AS one
    LEFT JOIN gym_gamification_settings s ON s.gym_id = v_gym_id;

  WITH days AS (
    -- Effective day per row. The nested CASE guarantees the previous-day probe
    -- only runs for the rare row saved before 05:00 IST on its own date.
    SELECT DISTINCT
           CASE
             WHEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date = a.date
                  AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::time < TIME '05:00'
             THEN CASE
                    WHEN NOT EXISTS (
                      SELECT 1 FROM attendance p
                       WHERE p.member_id = a.member_id
                         AND p.date = a.date - 1
                    )
                    THEN a.date - 1
                    ELSE a.date
                  END
             ELSE a.date
           END AS day
      FROM attendance a
     WHERE a.member_id = v_member_id
  ),
  runs AS (
    -- Gaps and islands: consecutive days share (day - row_number). Days after
    -- the real today (forward-dated by the owner) cannot be part of a streak.
    SELECT d.day,
           d.day - (ROW_NUMBER() OVER (ORDER BY d.day))::int AS grp
      FROM days d
     WHERE d.day <= v_ist_today
  ),
  islands AS (
    SELECT COUNT(*)::int AS len, MAX(r.day) AS last_day
      FROM runs r
     GROUP BY r.grp
  )
  SELECT
    (SELECT COUNT(*)::int FROM days),
    (SELECT COUNT(*)::int FROM days d WHERE d.day BETWEEN v_gym_today - 6  AND v_gym_today),
    (SELECT COUNT(*)::int FROM days d WHERE d.day BETWEEN v_gym_today - 29 AND v_gym_today),
    (SELECT COALESCE(ROUND(SUM(v_xp_checkin * public.gamification_day_factor(v_multipliers, d.day))), 0)::int
       FROM days d),
    (SELECT COALESCE(MAX(i.len), 0) FROM islands i),
    (SELECT i.len FROM islands i ORDER BY i.last_day DESC LIMIT 1),
    (SELECT MAX(i.last_day) FROM islands i)
  INTO v_total_days, v_d7, v_d30, v_checkin_xp, v_longest, v_cur_len, v_last_day;

  IF v_last_day IS NOT NULL AND v_last_day >= v_gym_today - 1 THEN
    v_streak  := v_cur_len;
    v_pending := v_last_day < v_ist_today;
  END IF;

  SELECT COUNT(*)::int INTO v_memberships
    FROM memberships ms
   WHERE ms.member_id = v_member_id;

  -- Raw morning-session rows (not days): the "early bird" achievement counts
  -- sessions, and reading it here avoids the 6-month window of the member app's
  -- attendance query.
  SELECT COUNT(*)::int INTO v_morning
    FROM attendance a
   WHERE a.member_id = v_member_id
     AND a.session = 'morning';

  -- Bonus XP from completed gym events: a snapshot per completion, so editing
  -- an event later never changes what a member already earned.
  SELECT COALESCE(SUM(c.xp_awarded), 0)::int INTO v_event_xp
    FROM gym_event_completions c
   WHERE c.member_id = v_member_id;

  v_xp := v_checkin_xp
        + v_xp_renewal * v_memberships
        + (CASE WHEN v_portal THEN v_xp_portal ELSE 0 END)
        + v_event_xp;

  RETURN jsonb_build_object(
    'xp',                   v_xp,
    'event_xp',             v_event_xp,
    'level_xp_per_level',   300,
    'streak',               v_streak,
    'streak_pending',       v_pending,
    'longest_streak',       v_longest,
    'total_days',           v_total_days,
    'days_last_7',          v_d7,
    'days_last_30',         v_d30,
    'attended_today',       COALESCE(v_last_day = v_ist_today, false),
    'weekly_goal_days',     v_weekly_goal,
    'memberships',          v_memberships,
    'portal_activated',     v_portal,
    'leaderboards_enabled', v_enabled,
    'show_on_leaderboard',  v_visible,
    'total_morning',        v_morning,
    'badge_rules',          v_badge_rules,
    'weekly_prize',         v_weekly_prize,
    'monthly_prize',        v_monthly_prize,
    -- Legacy keys read by app/m/rewards/page.tsx. They now carry day counts
    -- (not session rows) over the rolling windows.
    'total_attendance',     v_total_days,
    'this_week',            v_d7,
    'this_month',           v_d30
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_gym_leaderboard(
  p_board TEXT DEFAULT 'week',
  p_limit INT  DEFAULT 50
)
RETURNS TABLE(
  member_id      UUID,
  display_name   TEXT,
  rank           INT,
  value          INT,
  xp             INT,
  streak         INT,
  streak_pending BOOLEAN,
  days_last_7    INT,
  days_last_30   INT,
  is_me          BOOLEAN,
  total_members  INT,
  total_days     INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
-- ^ The OUT columns above are also PL/pgSQL variables; without the directive a
--   bare column of the same name inside the query is "ambiguous".
DECLARE
  v_uid         UUID := auth.uid();
  v_gym_id      UUID;
  v_me          UUID;
  v_is_owner    BOOLEAN := false;
  v_board       TEXT := COALESCE(p_board, 'week');
  v_limit       INT  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_ist_today   DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_gym_today   DATE := ((now() - INTERVAL '5 hours') AT TIME ZONE 'Asia/Kolkata')::date;
  v_enabled     BOOLEAN;
  v_xp_checkin  INT;
  v_xp_renewal  INT;
  v_xp_portal   INT;
  v_multipliers JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF v_board NOT IN ('week', 'month', 'streak', 'all') THEN
    RAISE EXCEPTION 'invalid leaderboard board: %', v_board USING ERRCODE = '22023';
  END IF;

  SELECT g.id INTO v_gym_id
    FROM gyms g
   WHERE g.owner_id = v_uid
   ORDER BY g.created_at
   LIMIT 1;

  IF v_gym_id IS NOT NULL THEN
    v_is_owner := true;
  ELSE
    SELECT m.id, m.gym_id INTO v_me, v_gym_id
      FROM members m
     WHERE m.auth_user_id = v_uid
     LIMIT 1;

    IF v_gym_id IS NULL THEN
      RETURN;
    END IF;

    -- Members only: owners preview their own board whatever the plan.
    IF NOT public.member_app_allowed() THEN
      RAISE EXCEPTION 'member_app_not_allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(s.leaderboards_enabled, true),
         COALESCE(s.xp_per_checkin, 10),
         COALESCE(s.xp_per_renewal, 50),
         COALESCE(s.xp_portal_activation, 25),
         COALESCE(s.xp_multipliers, '[]'::jsonb)
    INTO v_enabled, v_xp_checkin, v_xp_renewal, v_xp_portal, v_multipliers
    FROM (SELECT 1) AS one
    LEFT JOIN gym_gamification_settings s ON s.gym_id = v_gym_id;

  IF NOT v_is_owner AND NOT v_enabled THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH days AS (
    -- Effective day per row; same expression as get_member_gamification().
    SELECT DISTINCT
           a.member_id AS mid,
           CASE
             WHEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date = a.date
                  AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::time < TIME '05:00'
             THEN CASE
                    WHEN NOT EXISTS (
                      SELECT 1 FROM attendance p
                       WHERE p.member_id = a.member_id
                         AND p.date = a.date - 1
                    )
                    THEN a.date - 1
                    ELSE a.date
                  END
             ELSE a.date
           END AS day
      FROM attendance a
     WHERE a.gym_id = v_gym_id
  ),
  factors AS (
    -- The multiplier depends on the day only, so it is resolved once per
    -- distinct day in the gym instead of once per member-day.
    SELECT f.day, public.gamification_day_factor(v_multipliers, f.day) AS factor
      FROM (SELECT DISTINCT d.day FROM days d) f
  ),
  agg AS (
    SELECT d.mid,
           COUNT(*)::int AS tdays,
           (COUNT(*) FILTER (WHERE d.day BETWEEN v_gym_today - 6  AND v_gym_today))::int AS d7,
           (COUNT(*) FILTER (WHERE d.day BETWEEN v_gym_today - 29 AND v_gym_today))::int AS d30,
           SUM(v_xp_checkin * f.factor) AS checkin_xp
      FROM days d
      JOIN factors f ON f.day = d.day
     GROUP BY d.mid
  ),
  runs AS (
    SELECT d.mid,
           d.day,
           d.day - (ROW_NUMBER() OVER (PARTITION BY d.mid ORDER BY d.day))::int AS grp
      FROM days d
     WHERE d.day <= v_ist_today
  ),
  islands AS (
    SELECT r.mid, COUNT(*)::int AS len, MAX(r.day) AS last_day
      FROM runs r
     GROUP BY r.mid, r.grp
  ),
  cur AS (
    -- The run that contains the member's most recent attended day.
    SELECT DISTINCT ON (i.mid) i.mid, i.len, i.last_day
      FROM islands i
     ORDER BY i.mid, i.last_day DESC
  ),
  ms AS (
    SELECT s.member_id AS mid, COUNT(*)::int AS cnt
      FROM memberships s
     WHERE s.gym_id = v_gym_id
     GROUP BY s.member_id
  ),
  evx AS (
    -- Bonus XP from completed gym events (see get_member_gamification()).
    SELECT c.member_id AS mid, SUM(c.xp_awarded)::int AS xp
      FROM gym_event_completions c
     WHERE c.gym_id = v_gym_id
     GROUP BY c.member_id
  ),
  stats AS (
    SELECT m.id   AS mid,
           m.name AS nm,
           m.show_on_leaderboard AS visible,
           COALESCE(m.id = v_me, false) AS me,
           COALESCE(a.tdays, 0) AS tdays,
           COALESCE(a.d7, 0)    AS d7,
           COALESCE(a.d30, 0)   AS d30,
           (ROUND(COALESCE(a.checkin_xp, 0))
              + v_xp_renewal * COALESCE(ms.cnt, 0)
              + (CASE WHEN m.portal_activated_at IS NOT NULL THEN v_xp_portal ELSE 0 END)
              + COALESCE(ev.xp, 0)
           )::int AS xp_total,
           (CASE WHEN c.last_day >= v_gym_today - 1 THEN c.len ELSE 0 END)::int AS cur_streak,
           COALESCE(c.last_day >= v_gym_today - 1 AND c.last_day < v_ist_today, false) AS pending
      FROM members m
      LEFT JOIN agg a ON a.mid = m.id
      LEFT JOIN cur c ON c.mid = m.id
      LEFT JOIN ms    ON ms.mid = m.id
      LEFT JOIN evx ev ON ev.mid = m.id
     WHERE m.gym_id = v_gym_id
  ),
  valued AS (
    SELECT st.*,
           (CASE v_board
              WHEN 'week'   THEN st.d7
              WHEN 'month'  THEN st.d30
              WHEN 'streak' THEN st.cur_streak
              ELSE st.xp_total
            END)::int AS val
      FROM stats st
  ),
  eligible AS (
    SELECT v.*
      FROM valued v
     WHERE (v_is_owner OR v.visible OR v.me)
       AND (v.val > 0 OR v.me)
  ),
  ranked AS (
    SELECT e.*,
           (RANK()       OVER (ORDER BY e.val DESC, e.nm ASC))::int        AS rnk,
           -- RANK can tie; the cut-off needs a strict position.
           (ROW_NUMBER() OVER (ORDER BY e.val DESC, e.nm ASC, e.mid))::int AS pos,
           (COUNT(*)     OVER ())::int                                     AS total
      FROM eligible e
  )
  SELECT (CASE WHEN v_is_owner OR r.me THEN r.mid ELSE NULL END)::uuid,
         (CASE WHEN v_is_owner THEN btrim(r.nm) ELSE public.gamification_mask_name(r.nm) END)::text,
         r.rnk,
         r.val,
         r.xp_total,
         r.cur_streak,
         r.pending,
         r.d7,
         r.d30,
         r.me,
         r.total,
         r.tdays
    FROM ranked r
   WHERE r.pos <= v_limit OR r.me
   ORDER BY r.pos;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_events()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_member_id UUID;
  v_gym_id    UUID;
  v_today     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_result    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.id, m.gym_id INTO v_member_id, v_gym_id
    FROM members m
   WHERE m.auth_user_id = v_uid
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Member app is off for this member's gym (Free plan, lapsed or blocked
  -- subscription, or outside the trial's first members). Raised rather than
  -- returning NULL so the app can tell "blocked" from "not a member".
  IF NOT public.member_app_allowed() THEN
    RAISE EXCEPTION 'member_app_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.end_date, x.start_date, x.created_at), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT e.end_date, e.start_date, e.created_at,
             jsonb_build_object(
               'id',                e.id,
               'title',             e.title,
               'description',       e.description,
               'goalType',          e.goal_type,
               'goalTarget',        e.goal_target,
               'minSessionMinutes', e.min_session_minutes,
               'sessionFilter',     e.session_filter,
               'startDate',         e.start_date,
               'endDate',           e.end_date,
               'rewardXp',          COALESCE(c.xp_awarded, e.reward_xp),
               -- Not COALESCE: a completion with no item must not pick up an item
               -- the owner added to the event afterwards.
               'rewardText',        CASE WHEN c.id IS NOT NULL THEN c.reward_text ELSE e.reward_text END,
               -- A completed event reads as full even if the rule would now be
               -- evaluated against fewer days (e.g. an attendance row deleted).
               'progress',          CASE WHEN c.id IS NOT NULL
                                         THEN GREATEST(pr.p, e.goal_target)
                                         ELSE pr.p END,
               'completed',         c.id IS NOT NULL,
               'completedAt',       c.completed_at,
               'rewardGiven',       c.reward_given_at IS NOT NULL
             ) AS item
        FROM gym_events e
        LEFT JOIN gym_event_completions c
               ON c.event_id = e.id AND c.member_id = v_member_id
        CROSS JOIN LATERAL (
          SELECT public.gym_event_progress(
                   v_member_id, e.goal_type, e.start_date, e.end_date,
                   e.min_session_minutes, e.session_filter
                 ) AS p
        ) pr
       WHERE e.gym_id = v_gym_id
         AND e.is_active
         AND e.end_date >= v_today - 14
    ) x;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_leaderboard_visibility(p_visible BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_result BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  -- Member app is off for this member's gym (Free plan, lapsed or blocked
  -- subscription, or outside the trial's first members). Raised rather than
  -- returning NULL so the app can tell "blocked" from "not a member".
  IF NOT public.member_app_allowed() THEN
    RAISE EXCEPTION 'member_app_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_visible IS NULL THEN
    RAISE EXCEPTION 'p_visible must be true or false' USING ERRCODE = '22004';
  END IF;

  UPDATE members
     SET show_on_leaderboard = p_visible
   WHERE auth_user_id = v_uid
  RETURNING show_on_leaderboard INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_member_achievements(p_codes TEXT[])
RETURNS TABLE(code TEXT, earned_at TIMESTAMPTZ, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid       UUID := auth.uid();
  v_member_id UUID;
  v_gym_id    UUID;
  v_codes     TEXT[] := COALESCE(p_codes, ARRAY[]::TEXT[]);
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT m.id, m.gym_id INTO v_member_id, v_gym_id
    FROM members m
   WHERE m.auth_user_id = v_uid
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN;
  END IF;

  -- Member app is off for this member's gym (Free plan, lapsed or blocked
  -- subscription, or outside the trial's first members). Raised rather than
  -- returning NULL so the app can tell "blocked" from "not a member".
  IF NOT public.member_app_allowed() THEN
    RAISE EXCEPTION 'member_app_not_allowed' USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_codes) > 100 THEN
    RAISE EXCEPTION 'too many achievement codes (max 100)' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_codes) AS u(c)
     WHERE u.c IS NULL OR u.c !~ '^[a-z0-9-]{1,60}$'
  ) THEN
    RAISE EXCEPTION 'invalid achievement code' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO member_achievements (member_id, gym_id, code)
    SELECT v_member_id, v_gym_id, x.c
      FROM (SELECT DISTINCT u.c FROM unnest(v_codes) AS u(c)) x
    -- Named constraint, not a column list: (member_id, code) would collide with
    -- the OUT column `code`.
    ON CONFLICT ON CONSTRAINT member_achievements_member_code_key DO NOTHING
    RETURNING member_achievements.code AS c, member_achievements.earned_at AS earned
  )
  -- The second branch reads the pre-statement snapshot, so it never sees the
  -- rows `ins` just wrote: the two branches cannot overlap.
  SELECT i.c, i.earned, true
    FROM ins i
  UNION ALL
  SELECT ma.code, ma.earned_at, false
    FROM member_achievements ma
   WHERE ma.member_id = v_member_id
   ORDER BY 2, 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_member_login(p_member_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Member app is off for this member's gym (Free plan, lapsed or blocked
  -- subscription, or outside the trial's first members). Raised rather than
  -- returning NULL so the app can tell "blocked" from "not a member".
  IF NOT public.member_app_allowed() THEN
    RAISE EXCEPTION 'member_app_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.members
  SET last_portal_login = NOW()
  WHERE id = p_member_id
    AND auth_user_id = auth.uid();
END;
$$;

-- Member-facing policies: same names and conditions, plus the gate. The owner
-- policies, the members own-row policy, get_member_gym() and
-- current_member_gym_id() stay ungated so the app can still tell a blocked
-- member from a non-member.

DROP POLICY IF EXISTS "Members can view their own attendance" ON public.attendance;
CREATE POLICY "Members can view their own attendance"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
    -- Blocked gyms (Free, lapsed, suspended, outside the trial's first members)
    -- lose member app data here too, not only behind the app's own gate.
    AND (SELECT public.member_app_allowed())
  );

DROP POLICY IF EXISTS "Members can view their own memberships" ON public.memberships;
CREATE POLICY "Members can view their own memberships"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
    -- Blocked gyms (Free, lapsed, suspended, outside the trial's first members)
    -- lose member app data here too, not only behind the app's own gate.
    AND (SELECT public.member_app_allowed())
  );

DROP POLICY IF EXISTS "Members can view their own achievements" ON public.member_achievements;
CREATE POLICY "Members can view their own achievements"
  ON public.member_achievements FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
    -- Blocked gyms (Free, lapsed, suspended, outside the trial's first members)
    -- lose member app data here too, not only behind the app's own gate.
    AND (SELECT public.member_app_allowed())
  );

DROP POLICY IF EXISTS "Members can view their own activity" ON public.member_portal_activity;
CREATE POLICY "Members can view their own activity"
  ON public.member_portal_activity FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
    -- Blocked gyms (Free, lapsed, suspended, outside the trial's first members)
    -- lose member app data here too, not only behind the app's own gate.
    AND (SELECT public.member_app_allowed())
  );

DROP POLICY IF EXISTS "Members can insert their own login activity" ON public.member_portal_activity;
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
    -- Blocked gyms (Free, lapsed, suspended, outside the trial's first members)
    -- lose member app data here too, not only behind the app's own gate.
    AND (SELECT public.member_app_allowed())
  );

DROP POLICY IF EXISTS "Members can view their own assignments" ON public.program_assignments;
CREATE POLICY "Members can view their own assignments"
  ON public.program_assignments FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members WHERE auth_user_id = auth.uid()
    )
    -- Blocked gyms (Free, lapsed, suspended, outside the trial's first members)
    -- lose member app data here too, not only behind the app's own gate.
    AND (SELECT public.member_app_allowed())
  );

DROP POLICY IF EXISTS "Members can view their gym programs" ON public.workout_programs;
CREATE POLICY "Members can view their gym programs"
  ON public.workout_programs FOR SELECT
  TO authenticated
  USING (
    gym_id = public.current_member_gym_id()
    AND is_draft = false
    -- Blocked gyms (Free, lapsed, suspended, outside the trial's first members)
    -- lose member app data here too, not only behind the app's own gate.
    AND (SELECT public.member_app_allowed())
  );
