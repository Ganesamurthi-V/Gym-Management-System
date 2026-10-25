-- Trial gyms: bulk imports stop at 50 members for the whole gym.
-- Replaces the body of enforce_free_plan_member_cap(); the trigger and grants from
-- 20261026090000_free_plan.sql stay as they are. Safe to run more than once.
--
-- Why it lives in the database: the import route reads the member count and then
-- inserts, so two imports started together both see room. The gym row lock below
-- serialises the inserts, and the loser hits this check and raises
-- 'trial_import_member_limit', which the route turns into the upgrade message
-- instead of a generic failure.
-- Trial manual adds (is_imported false) stay uncapped on purpose; only imports are capped.
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

    -- Trial: imports (not manual adds) stop at 50 members for the whole gym. The
    -- lock makes a concurrent second import fail here, which the import route
    -- reports as the upgrade message rather than a generic error.
    IF v_plan = 'trial'
       AND NEW.is_imported IS TRUE
       AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= 50
    THEN
      RAISE EXCEPTION 'trial_import_member_limit' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-issued here (idempotent) for databases that ran 20261026090000_free_plan.sql
-- before it carried this grant: owners read gyms through column-level grants,
-- and getGymCore selects this column on every owner page.
GRANT SELECT (whatsapp_addon_until) ON public.gyms TO authenticated;
