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
     AND NEW.is_imported IS TRUE
     AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= 50
  THEN
    RAISE EXCEPTION 'trial_import_member_limit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
