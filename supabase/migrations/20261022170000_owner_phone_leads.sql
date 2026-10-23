-- Every mobile number an owner types on the signup phone step, verified or not, kept for marketing.
-- user_id is a plain uuid with NO foreign key on purpose: the lead must outlive the owner's account,
-- so deleting the auth user or gym must never cascade here. Only marketing_consent = true rows with
-- unsubscribed_at null may be marketed to. Service role only (RLS on, no policies, client roles revoked).
CREATE TABLE IF NOT EXISTS owner_phone_leads (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164           TEXT        NOT NULL UNIQUE,
  email                TEXT,
  full_name            TEXT,
  user_id              UUID,
  source               TEXT        NOT NULL DEFAULT 'signup',
  first_entered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_entered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_count          INT         NOT NULL DEFAULT 1,
  verified_at          TIMESTAMPTZ,
  marketing_consent    BOOLEAN     NOT NULL DEFAULT false,
  marketing_consent_at TIMESTAMPTZ,
  unsubscribed_at      TIMESTAMPTZ
);

ALTER TABLE owner_phone_leads ENABLE ROW LEVEL SECURITY;

-- Remembers a number typed at signup. p_consent NULL leaves consent untouched; true/false is recorded
-- with a timestamp only when it changes. Ticking again after an unsubscribe is a fresh opt-in.
CREATE OR REPLACE FUNCTION public.record_owner_phone_lead(
  p_phone text, p_email text, p_full_name text, p_user_id uuid, p_consent boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.owner_phone_leads AS l
    (phone_e164, email, full_name, user_id, marketing_consent, marketing_consent_at)
  VALUES
    (p_phone, p_email, p_full_name, p_user_id,
     COALESCE(p_consent, false),
     CASE WHEN p_consent IS TRUE THEN pg_catalog.now() END)
  ON CONFLICT (phone_e164) DO UPDATE SET
    last_entered_at = pg_catalog.now(),
    entry_count     = l.entry_count + 1,
    user_id         = EXCLUDED.user_id,
    email           = COALESCE(EXCLUDED.email, l.email),
    full_name       = COALESCE(EXCLUDED.full_name, l.full_name),
    marketing_consent = CASE WHEN p_consent IS NULL THEN l.marketing_consent ELSE p_consent END,
    marketing_consent_at = CASE
      WHEN p_consent IS NULL THEN l.marketing_consent_at
      WHEN p_consent IS TRUE AND (NOT l.marketing_consent OR l.unsubscribed_at IS NOT NULL) THEN pg_catalog.now()
      WHEN p_consent IS FALSE AND l.marketing_consent THEN pg_catalog.now()
      ELSE l.marketing_consent_at
    END,
    unsubscribed_at = CASE WHEN p_consent IS TRUE THEN NULL ELSE l.unsubscribed_at END;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_owner_phone_lead_verified(p_phone text, p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.owner_phone_leads
     SET verified_at = COALESCE(verified_at, pg_catalog.now()),
         user_id     = p_user_id
   WHERE phone_e164 = p_phone;
$$;

-- ── owner_phone_leads: service role only ────────────────────
REVOKE ALL ON public.owner_phone_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.owner_phone_leads TO service_role;
REVOKE ALL ON FUNCTION public.record_owner_phone_lead(text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_owner_phone_lead(text, text, text, uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.mark_owner_phone_lead_verified(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_owner_phone_lead_verified(text, uuid) TO service_role;
