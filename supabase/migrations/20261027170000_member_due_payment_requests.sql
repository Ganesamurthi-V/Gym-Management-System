-- Member-initiated DUE payments: a member pays all or part of their pending dues by UPI and uploads a proof,
-- exactly like a renewal request, but the request is of kind 'due'. Approving it does what the owner's Collect
-- action does (reduce members.pending_amount, insert a due_payments row, payment mode upi), atomically.
--
-- Run in the Supabase SQL editor AFTER 20261027150000_member_renewal_requests.sql and BEFORE deploying the code
-- that calls these functions. Idempotent.

-- ── Table: request kind + link to the ledger row ─────────────
ALTER TABLE public.member_renewal_requests
  ADD COLUMN IF NOT EXISTS request_type   TEXT NOT NULL DEFAULT 'renewal',
  ADD COLUMN IF NOT EXISTS due_payment_id UUID REFERENCES public.due_payments(id) ON DELETE SET NULL;

ALTER TABLE public.member_renewal_requests DROP CONSTRAINT IF EXISTS member_renewal_requests_request_type_check;
ALTER TABLE public.member_renewal_requests
  ADD CONSTRAINT member_renewal_requests_request_type_check CHECK (request_type IN ('renewal', 'due'));

-- A due row has no plan length. The existing IN checks already accept NULL.
ALTER TABLE public.member_renewal_requests ALTER COLUMN duration DROP NOT NULL;
ALTER TABLE public.member_renewal_requests ALTER COLUMN months   DROP NOT NULL;

ALTER TABLE public.member_renewal_requests DROP CONSTRAINT IF EXISTS member_renewal_requests_renewal_has_plan_check;
ALTER TABLE public.member_renewal_requests
  ADD CONSTRAINT member_renewal_requests_renewal_has_plan_check
  CHECK (request_type <> 'renewal' OR (duration IS NOT NULL AND months IS NOT NULL));

-- ── Indexes ──────────────────────────────────────────────────
-- One pending renewal AND one pending due payment per member.
DROP INDEX IF EXISTS public.uq_member_renewal_requests_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_renewal_requests_one_pending_per_type
  ON public.member_renewal_requests (member_id, request_type) WHERE status = 'pending';

-- ── Functions ────────────────────────────────────────────────

-- The renewal request creator must only see its own kind of pending request now that two can coexist.
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
     WHERE r.member_id = v_member_id AND r.status = 'pending' AND r.request_type = 'renewal'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_PENDING';
  END IF;

  BEGIN
    INSERT INTO public.member_renewal_requests
      (gym_id, member_id, request_type, plan_name, duration, months, category, amount, proof_path, transaction_id, notes)
    VALUES
      (v_gym_id, v_member_id, 'renewal', v_plan->>'name', v_plan->>'duration', (v_plan->>'months')::int,
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

DROP FUNCTION IF EXISTS public.create_member_due_payment_request(INTEGER, TEXT, TEXT, TEXT);
CREATE FUNCTION public.create_member_due_payment_request(
  p_amount         INTEGER,
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
  v_pending   INTEGER;
  v_id        UUID;
BEGIN
  SELECT m.id, m.gym_id, m.pending_amount INTO v_member_id, v_gym_id, v_pending
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

  IF COALESCE(v_pending, 0) <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOTHING_DUE';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > v_pending THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_AMOUNT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gym_upi_config u WHERE u.gym_id = v_gym_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_UPI';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_renewal_requests r
     WHERE r.member_id = v_member_id AND r.status = 'pending' AND r.request_type = 'due'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_PENDING';
  END IF;

  BEGIN
    INSERT INTO public.member_renewal_requests
      (gym_id, member_id, request_type, plan_name, category, amount, proof_path, transaction_id, notes)
    VALUES
      (v_gym_id, v_member_id, 'due', 'Due payment', 'both', p_amount, p_proof_path,
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
  -- A due-payment request never creates a membership, so it is "not found" here too.
  SELECT r.* INTO v_req
    FROM public.member_renewal_requests r
    JOIN public.gyms g ON g.id = r.gym_id
   WHERE r.id = p_request_id AND g.owner_id = auth.uid() AND r.request_type = 'renewal'
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

DROP FUNCTION IF EXISTS public.approve_member_due_payment_request(UUID);
CREATE FUNCTION public.approve_member_due_payment_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req            public.member_renewal_requests%ROWTYPE;
  v_pending        INTEGER;
  v_collect        INTEGER;
  v_due_payment_id UUID;
BEGIN
  SELECT r.* INTO v_req
    FROM public.member_renewal_requests r
    JOIN public.gyms g ON g.id = r.gym_id
   WHERE r.id = p_request_id AND g.owner_id = auth.uid() AND r.request_type = 'due'
     FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING';
  END IF;

  -- Lock the balance so a concurrent Collect cannot subtract from the same starting value.
  SELECT m.pending_amount INTO v_pending
    FROM public.members m
   WHERE m.id = v_req.member_id AND m.gym_id = v_req.gym_id
     FOR UPDATE;

  v_collect := LEAST(v_req.amount, COALESCE(v_pending, 0));
  IF v_collect <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOTHING_DUE';
  END IF;

  UPDATE public.members
     SET pending_amount = v_pending - v_collect
   WHERE id = v_req.member_id AND gym_id = v_req.gym_id;

  INSERT INTO public.due_payments (gym_id, member_id, amount, payment_mode)
  VALUES (v_req.gym_id, v_req.member_id, v_collect, 'upi')
  RETURNING id INTO v_due_payment_id;

  UPDATE public.member_renewal_requests
     SET status = 'approved', reviewed_at = now(), due_payment_id = v_due_payment_id
   WHERE id = v_req.id;

  RETURN jsonb_build_object('collected', v_collect, 'newPending', v_pending - v_collect);
END;
$$;

-- ── Privileges ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_member_renewal_request(TEXT, TEXT, TEXT, TEXT)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_renewal_request(TEXT, TEXT, TEXT, TEXT)  TO authenticated;
REVOKE ALL ON FUNCTION public.create_member_due_payment_request(INTEGER, TEXT, TEXT, TEXT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_due_payment_request(INTEGER, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_member_renewal_request(UUID, DATE, DATE)          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_member_renewal_request(UUID, DATE, DATE)       TO authenticated;
REVOKE ALL ON FUNCTION public.approve_member_due_payment_request(UUID)                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_member_due_payment_request(UUID)               TO authenticated;
