-- =============================================================
-- GymFlow — owner_switch_to_free: refuse suspended / cancelled gyms
--
-- The switch sets subscription_status = 'active'. Without a status check an
-- owner whose trial gym an admin had suspended, cancelled or deactivated could
-- call it and reactivate the gym on the Free plan, undoing the admin action.
-- Now only a gym that is active (is_active) with status 'trial' or 'expired'
-- may switch. Same end state as supabase-schema.sql.
--
-- Safe to re-run. Run in Supabase Dashboard -> SQL Editor, after
-- 20261026090000_free_plan.sql.
-- =============================================================

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

REVOKE ALL ON FUNCTION public.owner_switch_to_free()   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_switch_to_free() TO authenticated;

NOTIFY pgrst, 'reload schema';
