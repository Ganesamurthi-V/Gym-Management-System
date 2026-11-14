-- =============================================================
-- GymFlow — WhatsApp add-on during the free trial
--
-- Paying for the WhatsApp add-on while still on the trial ends the trial and
-- moves the gym to the free forever plan (same end state as
-- owner_switch_to_free(): plan_type 'free', status 'active', no end date).
-- A trial gym with more than 50 members cannot be moved (the free-plan cap),
-- so the approval is refused with free_plan_member_limit.
-- Free and paid gyms behave exactly as before.
--
-- Deploy together with the app release. Safe to re-run.
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

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
  v_plan  TEXT;
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
  SELECT greatest(now(), coalesce(whatsapp_addon_until, now())) + interval '30 days', plan_type
    INTO v_until, v_plan
    FROM public.gyms
   WHERE id = p_gym_id
   FOR UPDATE;

  IF v_plan = 'trial'
     AND (SELECT count(*) FROM public.members WHERE gym_id = p_gym_id) > 50
  THEN
    RAISE EXCEPTION 'free_plan_member_limit' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.subscription_requests
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = p_reviewed_by
   WHERE id = p_request_id;

  UPDATE public.gyms
     SET whatsapp_addon_until = v_until,
         plan_type            = CASE WHEN v_plan = 'trial' THEN 'free' ELSE plan_type END,
         subscription_status  = CASE WHEN v_plan = 'trial' THEN 'active' ELSE subscription_status END,
         subscription_ends_at = CASE WHEN v_plan = 'trial' THEN NULL ELSE subscription_ends_at END,
         -- The amount stamped on the request at submit time; the current price
         -- only for legacy rows filed before expected_amount_inr existed.
         last_payment_amount  = COALESCE(
                                  v_req.expected_amount_inr,
                                  (SELECT ps.whatsapp_addon_price_inr
                                     FROM public.platform_settings ps
                                    WHERE ps.id = 1)
                                ),
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
