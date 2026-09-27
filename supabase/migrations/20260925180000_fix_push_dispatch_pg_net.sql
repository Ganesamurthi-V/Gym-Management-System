-- ================================================================
-- Fix: push-dispatch pg_net setup (schema + function call)
-- ================================================================
--
-- A forward, idempotent correction for the pg_net wiring first introduced in
-- 20260925170000_push_dispatch_pg_net.sql.
--
-- Two defects in the original are corrected here:
--
--   1. `CREATE EXTENSION pg_net WITH SCHEMA extensions` — pg_net always creates
--      and owns its OWN `net` schema, so pointing it at a target schema is wrong.
--      On databases where the original ran, the extension is in `net` regardless.
--
--   2. `extensions.net.http_post(...)` — an invalid three-part name
--      (database.schema.function). The correct call is `net.http_post(...)`.
--      A trigger created with the bad call raises at INSERT time; because the
--      trigger body swallows exceptions, the symptom was "no push ever arrives"
--      rather than a hard error.
--
-- This migration is safe to run whether or not 20260925170000 was applied, and
-- safe to run more than once. It does not touch the notification tables/triggers
-- from 20260925160000 — only the pg_net dispatch path.
--
-- NOTE ON SECRETS: this migration does NOT reseed app_config, so a CRON_SECRET
-- you already set from the SQL editor is preserved. If app_config does not yet
-- hold the dispatch rows (i.e. 20260925170000 never ran), they are seeded with a
-- placeholder you must then update — see the block below.

BEGIN;

-- ── 1. Ensure pg_net exists in its own `net` schema ──────────────────────────
-- If a prior run somehow created it elsewhere, drop and recreate so the `net`
-- schema and its functions exist at the expected path. Dropping the extension
-- also removes its (unlogged, transient) queue tables — safe, as they only hold
-- in-flight HTTP requests, never business data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_extension e
       JOIN pg_namespace n ON n.oid = e.extnamespace
       WHERE e.extname = 'pg_net' AND n.nspname = 'net'
     )
  THEN
    DROP EXTENSION pg_net;
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Ensure app_config exists and is seeded (idempotent) ───────────────────
-- Present already if 20260925170000 ran; created here otherwise so this migration
-- stands alone. The secret row uses DO NOTHING so an existing value is preserved.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

INSERT INTO app_config (key, value) VALUES
  ('push_dispatch_url', 'https://admin.gymflow.sbs/api/push/dispatch')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO app_config (key, value) VALUES
  ('push_cron_secret', 'REPLACE_WITH_CRON_SECRET')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Recreate the dispatch trigger function with the correct call ──────────
-- CREATE OR REPLACE overwrites any earlier (broken) definition in place.
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

    -- pg_net lives in the `net` schema (the extension creates it). Fully
    -- qualified because this function runs with an empty search_path.
    PERFORM net.http_post(
      url     := v_url,
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', v_secret
      ),
      -- The dispatch endpoint does real work (cold start + FCM fan-out), so allow
      -- more than the 5s default. pg_net is async: a timeout here only loses the
      -- response row, never the request, and claimed rows are never re-sent.
      timeout_milliseconds := 15000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_push_on_notification failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_push_on_notification() FROM PUBLIC, anon, authenticated;

-- ── 4. Ensure the trigger is attached exactly once ───────────────────────────
DROP TRIGGER IF EXISTS trg_dispatch_push_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();

-- ── 5. Drop notifications from the realtime publication if an earlier run added it
-- The first cut of 20260925160000 published `notifications` for postgres_changes,
-- but no client consumes it that way (owner clients are RLS-denied; admin clients
-- use broadcast). Publishing a high-insert table just adds WAL/realtime overhead,
-- so remove it. Harmless no-op if it was never added.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications';
  END IF;
END
$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- AFTER APPLYING: set the shared secret so the trigger starts firing. It must
-- equal the CRON_SECRET env var in the admin app (and Vercel):
--
--   update app_config
--   set value = '<YOUR_CRON_SECRET>'
--   where key = 'push_cron_secret';
--
-- And, if your admin app is not at admin.gymflow.sbs:
--
--   update app_config
--   set value = 'https://YOUR-ADMIN-HOST/api/push/dispatch'
--   where key = 'push_dispatch_url';
-- ─────────────────────────────────────────────────────────────────────────────
