-- =============================================================
-- GymFlow — subscription_requests.plan_requested + approve_whatsapp_addon()
--
-- * subscription_requests.plan_requested: what the payment proof is for
--   (monthly | yearly | whatsapp_addon). NULL on older rows. The owner INSERT
--   policy is unchanged: it never restricted this column, and an owner can only
--   file a 'pending' row anyway.
-- * notify_on_subscription_request(): admin notification says what was requested.
-- * approve_whatsapp_addon(): atomic, service-role-only approval that extends
--   gyms.whatsapp_addon_until by 30 days.
--
-- Deploy together with the app release. Safe to re-run.
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

ALTER TABLE public.subscription_requests ADD COLUMN IF NOT EXISTS plan_requested TEXT;
ALTER TABLE public.subscription_requests DROP CONSTRAINT IF EXISTS subscription_requests_plan_requested_check;
ALTER TABLE public.subscription_requests
  ADD CONSTRAINT subscription_requests_plan_requested_check
  CHECK (plan_requested IN ('monthly', 'yearly', 'whatsapp_addon'));

CREATE OR REPLACE FUNCTION public.notify_on_subscription_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
  v_gym      TEXT;
  v_plan     TEXT;
  v_txn      TEXT;
  v_notes    TEXT;
  v_what     TEXT;
  v_title    TEXT;
  v_body     TEXT;
BEGIN
  BEGIN
    IF NEW.status = 'pending' THEN
      SELECT name, plan_type INTO v_gym_name, v_plan FROM public.gyms WHERE id = NEW.gym_id;
      v_gym   := COALESCE(NULLIF(btrim(v_gym_name), ''), 'A gym');
      v_txn   := public.notification_snippet(NEW.transaction_id, 40);
      v_notes := public.notification_snippet(NEW.notes, 120);

      -- What was paid for goes first: a push preview cuts the body short, and an
      -- add-on request must not be mistaken for a plan renewal.
      v_what := CASE NEW.plan_requested
                  WHEN 'whatsapp_addon' THEN ' Requested: WhatsApp automation add-on (Rs 299 / 30 days).'
                  WHEN 'monthly'        THEN ' Requested plan: Monthly.'
                  WHEN 'yearly'         THEN ' Requested plan: Yearly.'
                  ELSE ''
                END;
      v_title := CASE WHEN NEW.plan_requested = 'whatsapp_addon'
                      THEN 'WhatsApp add-on request — '
                      ELSE 'Payment proof awaiting review — '
                 END || v_gym;

      -- e.g. "Fit Zone Gym submitted a payment proof and is waiting for approval.
      --       Requested plan: Monthly. Current plan: trial. Txn: ABC123. Note: paid via GPay"
      v_body := v_gym || ' submitted a payment proof and is waiting for approval.'
                || v_what
                || CASE WHEN COALESCE(v_plan, '') <> '' THEN ' Current plan: ' || v_plan || '.' ELSE '' END
                || CASE WHEN v_txn   <> '' THEN ' Txn: '  || v_txn   || '.' ELSE '' END
                || CASE WHEN v_notes <> '' THEN ' Note: ' || v_notes        ELSE '' END;

      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'payment_request',
        NEW.gym_id,
        v_title,
        v_body,
        NEW.id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_subscription_request failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ── approve_whatsapp_addon: atomic admin approval of an add-on payment ──
-- Service-role only (the admin app). Request lock, gym lock and both writes are
-- one transaction so a double click or two admins cannot approve the same
-- request twice and stack 60 days. It runs as the definer, so the gyms column
-- guard treats the billing writes as trusted. plan_type and subscription_status
-- are deliberately left alone: the add-on is independent of the plan.
CREATE OR REPLACE FUNCTION public.approve_whatsapp_addon(
  p_request_id  UUID,
  p_gym_id      UUID,
  p_reviewed_by TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req   public.subscription_requests%ROWTYPE;
  v_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_req
    FROM public.subscription_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- The caller's gym id must match the stored one, so a stale or forged pair
  -- cannot extend a different gym's add-on.
  IF v_req.gym_id <> p_gym_id OR v_req.plan_requested IS DISTINCT FROM 'whatsapp_addon' THEN
    RAISE EXCEPTION 'request_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = 'P0001';
  END IF;

  -- Renewing early extends from the current end date instead of losing days.
  SELECT greatest(now(), coalesce(whatsapp_addon_until, now())) + interval '30 days'
    INTO v_until
    FROM public.gyms
   WHERE id = p_gym_id
   FOR UPDATE;

  UPDATE public.subscription_requests
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = p_reviewed_by
   WHERE id = p_request_id;

  UPDATE public.gyms
     SET whatsapp_addon_until = v_until,
         last_payment_amount  = 299,
         last_payment_date    = now(),
         last_payment_status  = 'paid',
         last_transaction_id  = v_req.transaction_id
   WHERE id = p_gym_id;

  RETURN v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_whatsapp_addon(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_whatsapp_addon(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
