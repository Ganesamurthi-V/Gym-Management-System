-- ============================================================
-- Lock platform_settings (platform UPI id + plan prices)
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================================
--
-- Why: platform_settings never had ROW LEVEL SECURITY enabled. With Supabase's
-- default grants, any signed-in gym owner (or even the public anon key) could
-- PATCH /rest/v1/platform_settings and change upi_id/upi_name — redirecting
-- every owner's subscription payment to an attacker's UPI — or change prices.
--
-- Owners must still READ it (app/owner/subscription and /api/subscription/status
-- use the user client to show where to pay). Writes happen only through the
-- service role (admin app), which bypasses RLS and these grants.
DO $$
BEGIN
  IF to_regclass('public.platform_settings') IS NULL THEN
    RAISE NOTICE 'platform_settings missing, skipping';
    RETURN;
  END IF;

  ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Gym owners can read platform settings" ON public.platform_settings;
  CREATE POLICY "Gym owners can read platform settings"
    ON public.platform_settings FOR SELECT
    TO authenticated
    USING (true);

  REVOKE ALL ON public.platform_settings FROM PUBLIC, anon;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.platform_settings FROM authenticated;
  GRANT SELECT ON public.platform_settings TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';
