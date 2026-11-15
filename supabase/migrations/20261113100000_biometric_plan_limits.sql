-- Biometric plan limits in the database, and the member app gate on delete_body_log().
-- Idempotent: safe to run more than once. Run in the Supabase SQL editor; it can go out before
-- or after the app deploy of the same release (the app already checks the same rules first and
-- only reads the new error names to show a clearer message).
--
--   A. biometric_device_limit(plan): the one source of the device limit (trial 1, paid 5).
--   B. enforce_biometric_device_limit(): every insert into attendance_devices is checked under
--      the gym row lock, so two requests at the same instant cannot both pass, and no insert
--      path (owner session, service role, SQL) can exceed the limit. Free gyms cannot add one.
--      Existing rows are never touched: a Free gym keeps the devices it set up during the trial.
--   C. delete_body_log(): refuses when the member app is off for the member's gym, like every
--      other member write.

-- ════════════════════════════════════════════════════════════
-- A. Single source of the device limit
-- ════════════════════════════════════════════════════════════
-- ── biometric_device_limit: how many biometric devices a plan may register ──
-- A trial gets one device, every paid plan five. Must equal biometricDeviceLimit() in
-- lib/subscription-utils.ts (a test compares the two). Free is refused by the trigger
-- before this is read.
CREATE OR REPLACE FUNCTION public.biometric_device_limit(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_plan = 'trial' THEN 1 ELSE 5 END
$$;
REVOKE ALL ON FUNCTION public.biometric_device_limit(TEXT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.biometric_device_limit(TEXT) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- B. Device limit on every insert
-- ════════════════════════════════════════════════════════════
-- ── attendance_devices: the plan decides how many devices a gym may register ──
-- Enforced in the database so every insert path is covered, including the service role.
-- The gym row lock serialises concurrent inserts (otherwise two requests on a trial with no
-- device would both pass the count) and orders them against plan changes. Definer so the lock
-- and the count do not depend on the caller's grants.
CREATE OR REPLACE FUNCTION public.enforce_biometric_device_limit()
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

  IF v_plan = 'free' THEN
    RAISE EXCEPTION 'biometric_not_in_plan' USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM public.attendance_devices WHERE gym_id = NEW.gym_id)
     >= public.biometric_device_limit(v_plan)
  THEN
    RAISE EXCEPTION 'biometric_device_limit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_biometric_device_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_biometric_device_limit ON public.attendance_devices;
CREATE TRIGGER trg_enforce_biometric_device_limit
  BEFORE INSERT ON public.attendance_devices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_biometric_device_limit();

-- ════════════════════════════════════════════════════════════
-- C. Member app gate on delete_body_log
-- ════════════════════════════════════════════════════════════
-- Same signature, so the existing grants stay.
CREATE OR REPLACE FUNCTION public.delete_body_log(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id UUID;
  v_deleted   INTEGER;
BEGIN
  SELECT m.id INTO v_member_id
    FROM public.members m
   WHERE m.auth_user_id = auth.uid()
   LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_MEMBER';
  END IF;
  IF NOT public.member_app_allowed() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_APP_BLOCKED';
  END IF;

  DELETE FROM public.member_body_logs b
   WHERE b.id = p_id AND b.member_id = v_member_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;
