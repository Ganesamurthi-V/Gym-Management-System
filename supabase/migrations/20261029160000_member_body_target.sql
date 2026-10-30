-- Member body target: a target weight and a target date saved with the goal.
--
-- Run in the Supabase SQL editor AFTER 20261029100000_member_body_profile.sql and BEFORE deploying the code
-- that sends the target fields to save_body_profile. Idempotent.

ALTER TABLE public.member_body_profile
  ADD COLUMN IF NOT EXISTS target_weight_kg NUMERIC(5,2) CHECK (target_weight_kg BETWEEN 20 AND 300),
  ADD COLUMN IF NOT EXISTS target_date      DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'member_body_profile_target_both_or_none'
       AND conrelid = 'public.member_body_profile'::regclass
  ) THEN
    ALTER TABLE public.member_body_profile
      ADD CONSTRAINT member_body_profile_target_both_or_none
      CHECK ((target_weight_kg IS NULL) = (target_date IS NULL));
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.save_body_profile(NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.save_body_profile(NUMERIC, TEXT, NUMERIC, DATE);
CREATE FUNCTION public.save_body_profile(
  p_height_cm        NUMERIC,
  p_goal             TEXT,
  p_target_weight_kg NUMERIC DEFAULT NULL,
  p_target_date      DATE    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id UUID;
  v_gym_id    UUID;
  v_today     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT m.id, m.gym_id INTO v_member_id, v_gym_id
    FROM public.members m
   WHERE m.auth_user_id = auth.uid()
   LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_MEMBER';
  END IF;
  IF NOT public.member_app_allowed() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_APP_BLOCKED';
  END IF;

  IF p_height_cm IS NULL OR p_height_cm NOT BETWEEN 100 AND 230
     OR p_goal IS NULL OR p_goal NOT IN ('lose_fat', 'build_muscle', 'gain_weight', 'stay_fit') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_VALUE';
  END IF;

  -- Both target fields together or neither; the date must be after today (India) and within 2 years.
  IF (p_target_weight_kg IS NULL) <> (p_target_date IS NULL)
     OR (p_target_weight_kg IS NOT NULL AND (
           p_target_weight_kg NOT BETWEEN 20 AND 300
        OR p_target_date <= v_today
        OR p_target_date > v_today + 730)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_VALUE';
  END IF;

  INSERT INTO public.member_body_profile (member_id, gym_id, height_cm, goal, target_weight_kg, target_date)
  VALUES (v_member_id, v_gym_id, round(p_height_cm, 1), p_goal, round(p_target_weight_kg, 2), p_target_date)
  ON CONFLICT (member_id) DO UPDATE
    SET height_cm        = EXCLUDED.height_cm,
        goal             = EXCLUDED.goal,
        target_weight_kg = EXCLUDED.target_weight_kg,
        target_date      = EXCLUDED.target_date,
        updated_at       = now();
END;
$$;

REVOKE ALL ON FUNCTION public.save_body_profile(NUMERIC, TEXT, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_body_profile(NUMERIC, TEXT, NUMERIC, DATE) TO authenticated;
