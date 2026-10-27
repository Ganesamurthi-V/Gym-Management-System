-- Member-initiated renewals: a member picks one of the gym's saved plans, pays the gym's UPI account,
-- and uploads a screenshot/PDF of the payment. That creates a PENDING request. The owner reviews the proof
-- and approves (inserts the memberships row, payment mode upi) or rejects with a reason. GymFlow cannot see
-- UPI payments, so the owner's check is the confirmation.
--
-- Run in the Supabase SQL editor BEFORE deploying the code that calls these functions. Idempotent.
--
-- Writes happen only through the four SECURITY DEFINER functions below (no INSERT/UPDATE/DELETE policy
-- exists for anyone). Each derives the caller from auth.uid() and never accepts a gym or member id to act on.

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_renewal_requests (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id         UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id      UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_name      TEXT        NOT NULL,
  duration       TEXT        NOT NULL CHECK (duration IN ('monthly', 'quarterly', 'annual')),
  months         INTEGER     NOT NULL CHECK (months IN (1, 3, 12)),
  category       TEXT        NOT NULL DEFAULT 'both' CHECK (category IN ('strength', 'cardio', 'both')),
  amount         INTEGER     NOT NULL CHECK (amount >= 0),
  -- Path inside the private member_payment_proofs bucket: <gym_id>/<member_id>/<file>.
  proof_path     TEXT        NOT NULL,
  transaction_id TEXT        CHECK (char_length(transaction_id) <= 100),
  notes          TEXT        CHECK (char_length(notes) <= 500),
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason  TEXT        CHECK (char_length(reject_reason) <= 300),
  membership_id  UUID        REFERENCES memberships(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ
);

-- Tenant-check FK: the member must belong to the same gym as the request.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_member_renewal_requests_member_same_gym'
       AND conrelid = 'public.member_renewal_requests'::regclass
  ) THEN
    ALTER TABLE public.member_renewal_requests
      ADD CONSTRAINT fk_member_renewal_requests_member_same_gym
      FOREIGN KEY (member_id, gym_id) REFERENCES public.members (id, gym_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── Indexes ──────────────────────────────────────────────────
-- One pending request per member.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_renewal_requests_one_pending
  ON member_renewal_requests (member_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_member_renewal_requests_gym_status
  ON member_renewal_requests (gym_id, status, created_at DESC);

-- ── Functions ────────────────────────────────────────────────

-- Internal helper: the gym's renewable plans from gyms.onboarding_data.plans. key = zero-based index.
-- Skips custom durations, durations that are not 1/3/12 months and prices <= 0. Price is the plan's list
-- price, exactly what owners/members/new charges (it ignores hasDiscount/discountPercent, so this does too).
CREATE OR REPLACE FUNCTION public.renewal_plan_options(p_gym_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', t.idx::text, 'name', t.name, 'duration', t.duration,
        'months', t.months, 'category', t.category, 'price', t.price
      ) ORDER BY t.idx
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT (e.ord - 1)::int AS idx,
           left(trim(COALESCE(NULLIF(e.elem->>'planName', ''), 'Plan')), 100) AS name,
           e.elem->>'duration' AS duration,
           CASE e.elem->>'duration' WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'annual' THEN 12 END AS months,
           CASE WHEN e.elem->>'category' IN ('strength', 'cardio') THEN e.elem->>'category' ELSE 'both' END AS category,
           CASE WHEN (e.elem->>'price') ~ '^[0-9]{1,9}(\.[0-9]+)?$'
                THEN round((e.elem->>'price')::numeric)::int END AS price
      FROM public.gyms g,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(g.onboarding_data->'plans') = 'array'
                  THEN g.onboarding_data->'plans' ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS e(elem, ord)
     WHERE g.id = p_gym_id
  ) t
  WHERE t.months IS NOT NULL AND t.price IS NOT NULL AND t.price > 0
$$;

DROP FUNCTION IF EXISTS public.get_member_renewal_options();
CREATE FUNCTION public.get_member_renewal_options()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id   UUID;
  v_gym_name TEXT;
  v_upi      JSONB;
BEGIN
  SELECT m.gym_id INTO v_gym_id
    FROM public.members m
   WHERE m.auth_user_id = auth.uid()
   LIMIT 1;
  IF v_gym_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT g.name INTO v_gym_name FROM public.gyms g WHERE g.id = v_gym_id;

  SELECT jsonb_build_object('upiId', u.upi_id, 'merchantName', u.merchant_name, 'merchantCode', u.merchant_code)
    INTO v_upi
    FROM public.gym_upi_config u
   WHERE u.gym_id = v_gym_id;

  RETURN jsonb_build_object(
    'gymName', COALESCE(v_gym_name, ''),
    'plans', public.renewal_plan_options(v_gym_id),
    'upi', v_upi
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_member_renewal_request(TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.create_member_renewal_request(
  p_plan_key       TEXT,
  p_proof_path     TEXT,
  p_transaction_id TEXT DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id UUID;
  v_gym_id    UUID;
  v_plans     JSONB;
  v_plan      JSONB;
  v_id        UUID;
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

  IF p_proof_path IS NULL
     OR char_length(p_proof_path) NOT BETWEEN 1 AND 300
     OR p_proof_path NOT LIKE v_gym_id::text || '/' || v_member_id::text || '/%'
     OR p_proof_path LIKE '%..%' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_PROOF';
  END IF;
  IF char_length(COALESCE(p_transaction_id, '')) > 100 OR char_length(COALESCE(p_notes, '')) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_TEXT';
  END IF;

  v_plans := public.renewal_plan_options(v_gym_id);
  IF jsonb_array_length(v_plans) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_PLANS';
  END IF;

  SELECT p INTO v_plan FROM jsonb_array_elements(v_plans) p WHERE p->>'key' = p_plan_key LIMIT 1;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_PLAN';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gym_upi_config u WHERE u.gym_id = v_gym_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_UPI';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_renewal_requests r
     WHERE r.member_id = v_member_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_PENDING';
  END IF;

  BEGIN
    INSERT INTO public.member_renewal_requests
      (gym_id, member_id, plan_name, duration, months, category, amount, proof_path, transaction_id, notes)
    VALUES
      (v_gym_id, v_member_id, v_plan->>'name', v_plan->>'duration', (v_plan->>'months')::int,
       v_plan->>'category', (v_plan->>'price')::int, p_proof_path,
       NULLIF(btrim(p_transaction_id), ''), NULLIF(btrim(p_notes), ''))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Two taps racing past the check above: the partial unique index is the real guard.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_PENDING';
  END;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.approve_member_renewal_request(UUID, DATE, DATE);
CREATE FUNCTION public.approve_member_renewal_request(
  p_request_id UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req           public.member_renewal_requests%ROWTYPE;
  v_membership_id UUID;
BEGIN
  -- Ownership is part of the lookup: another gym's request is simply "not found".
  SELECT r.* INTO v_req
    FROM public.member_renewal_requests r
    JOIN public.gyms g ON g.id = r.gym_id
   WHERE r.id = p_request_id AND g.owner_id = auth.uid()
     FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR p_end_date > (p_start_date + interval '25 months')::date THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DATES';
  END IF;

  INSERT INTO public.memberships
    (member_id, gym_id, plan, category, start_date, end_date, amount, admission_fee, due_amount, payment_mode)
  VALUES
    (v_req.member_id, v_req.gym_id, v_req.duration, v_req.category, p_start_date, p_end_date,
     v_req.amount, 0, 0, 'upi')
  RETURNING id INTO v_membership_id;

  UPDATE public.member_renewal_requests
     SET status = 'approved', reviewed_at = now(), membership_id = v_membership_id
   WHERE id = v_req.id;

  INSERT INTO public.member_portal_activity (gym_id, member_id, activity, performed_by)
  VALUES (v_req.gym_id, v_req.member_id, 'membership_renewed', 'owner');

  RETURN v_membership_id;
END;
$$;

DROP FUNCTION IF EXISTS public.reject_member_renewal_request(UUID, TEXT);
CREATE FUNCTION public.reject_member_renewal_request(
  p_request_id UUID,
  p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req    public.member_renewal_requests%ROWTYPE;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  IF char_length(v_reason) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_REASON';
  END IF;

  SELECT r.* INTO v_req
    FROM public.member_renewal_requests r
    JOIN public.gyms g ON g.id = r.gym_id
   WHERE r.id = p_request_id AND g.owner_id = auth.uid()
     FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING';
  END IF;

  UPDATE public.member_renewal_requests
     SET status = 'rejected', reject_reason = v_reason, reviewed_at = now()
   WHERE id = v_req.id;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE member_renewal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view renewal requests" ON public.member_renewal_requests;
CREATE POLICY "Gym owners can view renewal requests"
  ON public.member_renewal_requests FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gyms WHERE id = member_renewal_requests.gym_id AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can view their own renewal requests" ON public.member_renewal_requests;
CREATE POLICY "Members can view their own renewal requests"
  ON public.member_renewal_requests FOR SELECT
  TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE auth_user_id = (SELECT auth.uid()))
    AND (SELECT public.member_app_allowed())
  );

-- ── Privileges ───────────────────────────────────────────────
REVOKE ALL ON public.member_renewal_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_renewal_requests TO authenticated;

-- Internal helper: only the definer functions above call it.
REVOKE ALL ON FUNCTION public.renewal_plan_options(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_member_renewal_options()                          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_renewal_options()                       TO authenticated;
REVOKE ALL ON FUNCTION public.create_member_renewal_request(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_renewal_request(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_member_renewal_request(UUID, DATE, DATE)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_member_renewal_request(UUID, DATE, DATE)   TO authenticated;
REVOKE ALL ON FUNCTION public.reject_member_renewal_request(UUID, TEXT)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_member_renewal_request(UUID, TEXT)          TO authenticated;

-- ── Storage ──────────────────────────────────────────────────
-- Private bucket, no storage policies: only the service role touches it. The member route uploads under a
-- server-built path; owners get short-lived signed URLs from a route that first checks the request's gym.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('member_payment_proofs', 'member_payment_proofs', false, 10485760,
          ARRAY['image/jpeg', 'image/png', 'application/pdf'])
  ON CONFLICT (id) DO NOTHING;
