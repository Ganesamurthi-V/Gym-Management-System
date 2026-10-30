-- Member body profile: height and goal, collected once with the first body entry (the baseline).
--
-- Run in the Supabase SQL editor AFTER 20261028150000_member_progress.sql and BEFORE deploying the code
-- that calls save_body_profile. Idempotent.
--
-- Written only by the SECURITY DEFINER function below; no INSERT/UPDATE/DELETE policy exists.

CREATE TABLE IF NOT EXISTS member_body_profile (
  member_id  UUID         PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  gym_id     UUID         NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  height_cm  NUMERIC(4,1) NOT NULL CHECK (height_cm BETWEEN 100 AND 230),
  goal       TEXT         NOT NULL CHECK (goal IN ('lose_fat', 'build_muscle', 'gain_weight', 'stay_fit')),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_member_body_profile_member_same_gym'
       AND conrelid = 'public.member_body_profile'::regclass
  ) THEN
    ALTER TABLE public.member_body_profile
      ADD CONSTRAINT fk_member_body_profile_member_same_gym
      FOREIGN KEY (member_id, gym_id) REFERENCES public.members (id, gym_id) ON DELETE CASCADE;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.save_body_profile(NUMERIC, TEXT);
CREATE FUNCTION public.save_body_profile(p_height_cm NUMERIC, p_goal TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id UUID;
  v_gym_id    UUID;
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

  INSERT INTO public.member_body_profile (member_id, gym_id, height_cm, goal)
  VALUES (v_member_id, v_gym_id, round(p_height_cm, 1), p_goal)
  ON CONFLICT (member_id) DO UPDATE
    SET height_cm = EXCLUDED.height_cm,
        goal      = EXCLUDED.goal,
        updated_at = now();
END;
$$;

ALTER TABLE member_body_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view member body profiles" ON public.member_body_profile;
CREATE POLICY "Gym owners can view member body profiles"
  ON public.member_body_profile FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gyms WHERE id = member_body_profile.gym_id AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can view their own body profile" ON public.member_body_profile;
CREATE POLICY "Members can view their own body profile"
  ON public.member_body_profile FOR SELECT
  TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE auth_user_id = (SELECT auth.uid()))
    AND (SELECT public.member_app_allowed())
  );

REVOKE ALL ON public.member_body_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_body_profile TO authenticated;

REVOKE ALL ON FUNCTION public.save_body_profile(NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_body_profile(NUMERIC, TEXT) TO authenticated;
