-- Verified owner mobile numbers (WhatsApp OTP at signup). One number can belong to one owner.
-- Service role only: RLS on with no policies, every client role revoked.
CREATE TABLE IF NOT EXISTS owner_verified_phones (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164  TEXT        NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE owner_verified_phones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.owner_verified_phones FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.owner_verified_phones TO service_role;
