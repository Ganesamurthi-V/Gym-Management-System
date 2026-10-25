-- Trial gyms: EVERY member insert (manual add or import) stops at 50 members.
-- Supersedes the trial-import-only rule in 20261026120000_trial_import_member_cap.sql
-- (which left trial manual adds uncapped). Free keeps its own 50 cap.
-- Replaces only the body of enforce_free_plan_member_cap(); the trigger, REVOKE and
-- other grants from 20261026090000_free_plan.sql stay as they are. Safe to run more than once.
--
-- Both error strings contain 'member_limit': app/api/import/confirm/route.ts and
-- app/api/members/route.ts match on it to show the upgrade message.
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
       AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= 50
    THEN
      RAISE EXCEPTION 'free_plan_member_limit' USING ERRCODE = '23514';
    END IF;

    IF v_plan = 'trial'
       AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= 50
    THEN
      RAISE EXCEPTION 'trial_member_limit' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
