-- Make the service-role-only tables explicit (Supabase linter 0008, 2026-11-11).
--
-- These 14 tables are read and written only by the service role (admin app, crons,
-- webhooks, push sender) and by SECURITY DEFINER functions. RLS is on with no
-- policy, which already denies anon and authenticated every row; the linter flags
-- that as "RLS enabled, no policy".
--
-- Two changes:
--   1. Revoke table privileges from PUBLIC / anon / authenticated. supabase-schema.sql
--      already does this for 13 of them, but the live database never got it: 9 still
--      granted anon/authenticated SELECT/INSERT/…, leaving RLS as the only barrier.
--      subscription_audit_logs is new here (it only had anon revoked).
--   2. Add an explicit deny-all policy, so the intent is written down and a later
--      permissive policy is not the first one on the table by accident.
--
-- The service role bypasses RLS and keeps its grants, so nothing in the app changes.
-- Idempotent. A table missing from this database is skipped with a NOTICE.

DO $mig$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_config', 'device_push_tokens', 'email_messages', 'email_threads',
    'gym_admin_notes', 'gym_whatsapp_config', 'member_push_subscriptions',
    'notifications', 'owner_activity_events', 'owner_phone_leads',
    'owner_verified_phones', 'subscription_audit_logs',
    'whatsapp_recipient_window', 'whatsapp_webhook_logs'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipped (table missing): %', t;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Service role only" ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t);
  END LOOP;
END
$mig$;
