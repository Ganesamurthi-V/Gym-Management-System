-- ================================================================
-- Admin push + in-app notifications
-- ================================================================
--
-- Two tables and a set of AFTER-INSERT triggers that turn meaningful business
-- events into durable notification rows. The rows drive:
--   1. the in-app notification centre (read live via the admin API), and
--   2. lock-screen push. Each insert pings /api/push/dispatch via pg_net (see
--      20260925170000_push_dispatch_pg_net.sql) for instant, cron-free delivery.
--
-- The admin apps authenticate with a shared application session (not Supabase
-- Auth), and read exclusively through the service-role admin API — so, exactly
-- like support_tickets, these tables carry RLS that denies anon/authenticated
-- and is bypassed by the service role. No owner-facing policies are added.
--
-- Naming, SECURITY DEFINER + empty search_path, and the "realtime is an
-- enhancement, never roll back the business txn" guard all mirror
-- 20260722130000_secure_realtime_activities.sql.

BEGIN;

-- ── notifications ────────────────────────────────────────────
-- One row per admin-facing event. `entity_id` points back at the source row
-- (ticket id, request id, gym id) so the app can deep-link. `pushed_at` is the
-- dispatch watermark: NULL means "not yet sent to FCM".
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('ticket', 'feedback', 'payment_request', 'new_gym')),
  gym_id      UUID        REFERENCES gyms(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  -- The source row this notification refers to (kept as text: sources have
  -- different id types and we only ever echo it back for deep-linking).
  entity_id   TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  pushed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read) WHERE is_read = false;
-- Partial index the dispatcher scans every run: only rows still awaiting push.
CREATE INDEX IF NOT EXISTS idx_notifications_unpushed   ON notifications(created_at) WHERE pushed_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- No policies: RLS on with zero policies denies anon/authenticated entirely.
-- The service-role admin API bypasses RLS, which is the only reader/writer.

-- ── device_push_tokens ───────────────────────────────────────
-- FCM registration tokens per device. Admin auth is a single shared password
-- with no per-user identity, so a token is bound to a device, not a user.
-- `token` is the natural key; re-registration upserts and bumps last_seen_at.
CREATE TABLE IF NOT EXISTS device_push_tokens (
  token        TEXT        PRIMARY KEY,
  platform     TEXT        NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;
-- Same as above: service-role only.

-- ── Realtime invalidation hint ───────────────────────────────
-- Broadcast a payload-free 'admin:notifications' hint so the in-app centre
-- re-fetches through the authenticated admin API (identical pattern to the
-- existing admin:* hints; broadcast payloads are never trusted as data).
--
-- Deliberately NOT added to the supabase_realtime publication: that is only
-- needed for postgres_changes, which no client uses for this table (owner clients
-- are denied by RLS and admin clients consume broadcast only). Publishing a
-- frequently-inserted table would add WAL/realtime overhead for nothing.
DROP TRIGGER IF EXISTS trg_realtime_admin_notifications ON public.notifications;
CREATE TRIGGER trg_realtime_admin_notifications
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:notifications'
  );

-- ── Event → notification trigger functions ───────────────────
-- Each mirrors the "never roll back the business txn" guard: a failure to log a
-- notification must not abort the ticket/payment/gym insert that caused it.

-- Support tickets AND feedback both land in support_tickets; the type column
-- discriminates. Owner-sent rows are the ones worth alerting on.
CREATE OR REPLACE FUNCTION public.notify_on_support_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
BEGIN
  BEGIN
    SELECT name INTO v_gym_name FROM public.gyms WHERE id = NEW.gym_id;

    IF NEW.type = 'feedback' THEN
      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'feedback',
        NEW.gym_id,
        'New feedback' || CASE WHEN NEW.rating IS NOT NULL THEN ' (' || NEW.rating || '★)' ELSE '' END,
        COALESCE(v_gym_name, 'A gym') || ': ' || NEW.subject,
        NEW.id::text
      );
    ELSE
      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'ticket',
        NEW.gym_id,
        'New support ticket',
        COALESCE(v_gym_name, 'A gym') || ': ' || NEW.subject,
        NEW.id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_support_ticket failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_subscription_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
BEGIN
  BEGIN
    -- Only a brand-new pending request is an actionable alert.
    IF NEW.status = 'pending' THEN
      SELECT name INTO v_gym_name FROM public.gyms WHERE id = NEW.gym_id;
      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'payment_request',
        NEW.gym_id,
        'New payment proof',
        COALESCE(v_gym_name, 'A gym') || ' submitted a payment for review',
        NEW.id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_subscription_request failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_gym()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
    VALUES (
      'new_gym',
      NEW.id,
      'New gym signup',
      COALESCE(NEW.name, 'A new gym') || ' just registered',
      NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_new_gym failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- These functions run as definer and are called only by triggers; keep them off
-- the public execute grant, matching the existing broadcast helper.
REVOKE ALL ON FUNCTION public.notify_on_support_ticket()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_subscription_request()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_new_gym()               FROM PUBLIC, anon, authenticated;

-- ── Wire the triggers ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_notify_support_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_support_ticket();

DROP TRIGGER IF EXISTS trg_notify_subscription_request ON public.subscription_requests;
CREATE TRIGGER trg_notify_subscription_request
  AFTER INSERT ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_subscription_request();

DROP TRIGGER IF EXISTS trg_notify_new_gym ON public.gyms;
CREATE TRIGGER trg_notify_new_gym
  AFTER INSERT ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_gym();

-- Keep PostgREST's schema cache in step so the new tables are queryable now.
NOTIFY pgrst, 'reload schema';

COMMIT;
