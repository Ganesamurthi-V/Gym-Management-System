-- Secure Realtime convergence for owner, admin web, and admin mobile clients.
--
-- Owner browsers use RLS-filtered INSERT/UPDATE postgres_changes plus private,
-- RLS-authorized delete invalidations. Admin clients use custom application sessions (not Supabase Auth), so they receive only payload-free
-- public invalidation hints and then re-fetch through authenticated admin APIs.
-- Broadcast hints are untrusted and contain no row IDs, tenant IDs, or data.
--
-- Supabase database broadcast signature:
-- https://supabase.com/docs/guides/realtime/broadcast#broadcast-from-the-database
-- Content was rephrased for compliance with licensing restrictions.

BEGIN;

-- Tables consumed directly by authenticated owner clients must be part of the
-- Realtime publication. RLS remains the authorization boundary for delivery.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'gyms',
    'subscription_requests',
    'admin_messages',
    'support_tickets',
    'whatsapp_messages',
    'whatsapp_automation_logs',
    'whatsapp_send_queue'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;

-- One generic AFTER-trigger function emits an empty invalidation signal to one
-- or more public topics. Public is intentional because admin web/mobile use a
-- separate app-session system; consumers debounce and securely re-fetch data.
CREATE OR REPLACE FUNCTION public.broadcast_admin_realtime_invalidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_topic TEXT;
BEGIN
  FOREACH v_topic IN ARRAY TG_ARGV
  LOOP
    BEGIN
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        v_topic,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      -- Realtime is an enhancement; a transient broadcast failure must never
      -- roll back the authoritative business transaction.
      RAISE WARNING 'Realtime invalidation failed for topic %: %', v_topic, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_admin_realtime_invalidation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_admin_gyms ON public.gyms;
CREATE TRIGGER trg_realtime_admin_gyms
  AFTER INSERT OR UPDATE OR DELETE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:gyms',
    'admin:subscriptions'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_requests ON public.subscription_requests;
CREATE TRIGGER trg_realtime_admin_subscription_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:subscriptions',
    'admin:gyms'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_support_tickets ON public.support_tickets;
CREATE TRIGGER trg_realtime_admin_support_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:support'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_messages ON public.admin_messages;
CREATE TRIGGER trg_realtime_admin_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:support'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_audit ON public.subscription_audit_logs;
CREATE TRIGGER trg_realtime_admin_subscription_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_logs ON public.whatsapp_automation_logs;
CREATE TRIGGER trg_realtime_admin_whatsapp_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_automation_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_messages ON public.whatsapp_messages;
CREATE TRIGGER trg_realtime_admin_whatsapp_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_queue ON public.whatsapp_send_queue;
CREATE TRIGGER trg_realtime_admin_whatsapp_queue
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_send_queue
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_member_activity ON public.members;
CREATE TRIGGER trg_realtime_admin_member_activity
  AFTER INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

-- DELETE events from Postgres Changes cannot be filtered. Route them through
-- private Broadcast topics whose join is authorized by realtime.messages RLS.
DROP POLICY IF EXISTS "gym owners receive tenant realtime invalidations"
  ON realtime.messages;
CREATE POLICY "gym owners receive tenant realtime invalidations"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND split_part((SELECT realtime.topic()), ':', 1) = 'gym'
    AND split_part((SELECT realtime.topic()), ':', 3) IN ('support', 'subscription')
    AND EXISTS (
      SELECT 1
      FROM public.gyms
      WHERE public.gyms.id::text = split_part((SELECT realtime.topic()), ':', 2)
        AND public.gyms.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.broadcast_owner_delete_invalidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record JSONB;
  v_gym_id TEXT;
  v_scope TEXT;
  v_topic TEXT;
BEGIN
  v_record := to_jsonb(OLD);
  v_gym_id := COALESCE(v_record ->> 'gym_id', v_record ->> 'id');
  IF v_gym_id IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_scope IN ARRAY TG_ARGV
  LOOP
    v_topic := format('gym:%s:%s', v_gym_id, v_scope);
    BEGIN
      PERFORM realtime.send('{}'::jsonb, 'invalidate', v_topic, true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Private Realtime invalidation failed for topic %: %', v_topic, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_owner_delete_invalidation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_admin_message ON public.admin_messages;
CREATE TRIGGER trg_realtime_owner_deleted_admin_message
  AFTER DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_realtime_owner_deleted_support_ticket
  AFTER DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_subscription_request ON public.subscription_requests;
CREATE TRIGGER trg_realtime_owner_deleted_subscription_request
  AFTER DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('subscription');

COMMIT;
