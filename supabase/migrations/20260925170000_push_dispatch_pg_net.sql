-- ================================================================
-- Instant push delivery via pg_net (no external cron)
-- ================================================================
--
-- Instead of a scheduled job polling for unpushed notifications, each new
-- notifications row fires an HTTP POST to the admin app's /api/push/dispatch
-- endpoint straight from Postgres using the pg_net extension. The endpoint then
-- reads unpushed rows and sends them through FCM (batching any that arrived
-- close together), so delivery is effectively immediate and costs no Vercel Pro
-- cron.
--
-- Secrets (the endpoint URL and the shared CRON_SECRET) live in a private
-- app_config table that only the service role / SECURITY DEFINER functions can
-- read — never hard-coded into the function body, and never exposed to
-- anon/authenticated.

BEGIN;

-- pg_net ships with Supabase but is not enabled by default.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── app_config ───────────────────────────────────────────────
-- Single-row key/value store for server-side secrets consumed by triggers.
-- RLS on with no policies => only the service role (and SECURITY DEFINER
-- functions) can read it.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Seed the dispatch config. Update the CRON_SECRET value to match the
-- CRON_SECRET env var set in the admin app (gymflow-admin/.env.local + Vercel).
-- Re-running is safe: ON CONFLICT keeps whatever is already there for the secret
-- so a later manual change from the SQL editor is not clobbered by a redeploy.
INSERT INTO app_config (key, value) VALUES
  ('push_dispatch_url', 'https://admin.gymflow.sbs/api/push/dispatch')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO app_config (key, value) VALUES
  ('push_cron_secret', 'REPLACE_WITH_CRON_SECRET')
ON CONFLICT (key) DO NOTHING;

-- ── Trigger: ping the dispatch endpoint on each new notification ──
-- SECURITY DEFINER so it can read app_config and call extensions.net; wrapped in
-- its own BEGIN/EXCEPTION so a transient pg_net failure never rolls back the
-- notification insert (the row still shows in-app and a later insert re-triggers
-- a dispatch that will pick up any it missed).
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  BEGIN
    SELECT value INTO v_url    FROM public.app_config WHERE key = 'push_dispatch_url';
    SELECT value INTO v_secret FROM public.app_config WHERE key = 'push_cron_secret';

    -- No config, no secret, or the placeholder still in place => do nothing.
    IF v_url IS NULL OR v_secret IS NULL OR v_secret = 'REPLACE_WITH_CRON_SECRET' THEN
      RETURN NULL;
    END IF;

    PERFORM extensions.net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', v_secret
      ),
      body    := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_push_on_notification failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_push_on_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dispatch_push_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();

COMMIT;
