-- enforce_free_plan_member_cap(): read the limit from public.plan_member_limit() again.
--
-- 20261027100000_trial_member_cap_all_inserts.sql (trial caps every insert, not only
-- imports) re-created this function with a literal 50, which dropped the single source of
-- the limit added in 20261026130000_subscription_hardening.sql. Same rule, no literal:
-- the limit now lives in one place (plan_member_limit()) and a test keeps it equal to
-- PLAN_MEMBER_LIMIT in lib/subscription-utils.ts. Same end state as supabase-schema.sql.
--
-- Run after 20261026130000_subscription_hardening.sql (it creates plan_member_limit()).
-- Safe to run more than once. Replaces only the function body; the trigger and grants stay.

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

    -- Trial: every insert (manual add or import) stops at 50 members for the whole
    -- gym. The lock makes a concurrent second insert fail here, which the routes
    -- report as the upgrade message rather than a generic error.
    IF v_plan = 'trial'
       AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= public.plan_member_limit()
    THEN
      RAISE EXCEPTION 'trial_member_limit' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
