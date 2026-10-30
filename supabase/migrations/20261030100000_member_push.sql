-- Member Web Push subscriptions.
--
-- Run in the Supabase SQL editor BEFORE deploying the code that calls these functions. Idempotent.
--
-- The table holds push keys, so nobody can touch it directly: RLS is on with NO policies and every
-- table privilege is revoked. Members register/unregister only through the SECURITY DEFINER functions
-- below (caller from auth.uid(), never a gym or member id). The sender reads it with the service role.
-- Limits mirror PUSH_LIMITS in types/push.ts.

CREATE TABLE IF NOT EXISTS member_push_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint        TEXT        NOT NULL UNIQUE CHECK (char_length(endpoint) <= 600),
  p256dh          TEXT        NOT NULL CHECK (char_length(p256dh) <= 200),
  auth            TEXT        NOT NULL CHECK (char_length(auth) <= 100),
  user_agent      TEXT        CHECK (char_length(user_agent) <= 300),
  failure_count   INTEGER     NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_member_push_subscriptions_member_same_gym'
       AND conrelid = 'public.member_push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.member_push_subscriptions
      ADD CONSTRAINT fk_member_push_subscriptions_member_same_gym
      FOREIGN KEY (member_id, gym_id) REFERENCES public.members (id, gym_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_push_subscriptions_gym
  ON member_push_subscriptions (gym_id);
CREATE INDEX IF NOT EXISTS idx_member_push_subscriptions_member
  ON member_push_subscriptions (member_id);

ALTER TABLE member_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_push_subscriptions FROM PUBLIC, anon, authenticated;

-- ── Functions ────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.register_push_subscription(TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.register_push_subscription(
  p_endpoint   TEXT,
  p_p256dh     TEXT,
  p_auth       TEXT,
  p_user_agent TEXT
)
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

  IF p_endpoint IS NULL OR char_length(p_endpoint) NOT BETWEEN 10 AND 600
     OR p_p256dh IS NULL OR char_length(p_p256dh) NOT BETWEEN 1 AND 200
     OR p_auth IS NULL OR char_length(p_auth) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_VALUE';
  END IF;

  -- A shared phone: the same endpoint moves to whoever is signed in now.
  INSERT INTO public.member_push_subscriptions
    (gym_id, member_id, endpoint, p256dh, auth, user_agent)
  VALUES
    (v_gym_id, v_member_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET gym_id        = EXCLUDED.gym_id,
        member_id     = EXCLUDED.member_id,
        p256dh        = EXCLUDED.p256dh,
        auth          = EXCLUDED.auth,
        user_agent    = EXCLUDED.user_agent,
        failure_count = 0;
END;
$$;

DROP FUNCTION IF EXISTS public.unregister_push_subscription(TEXT);
CREATE FUNCTION public.unregister_push_subscription(p_endpoint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id UUID;
  v_count     INTEGER;
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

  DELETE FROM public.member_push_subscriptions s
   WHERE s.endpoint = p_endpoint
     AND s.member_id = v_member_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.unregister_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_push_subscription(TEXT) TO authenticated;
