-- ═══════════════════════════════════════════════════════════════════════════════
-- Publish remaining business tables to supabase_realtime
-- ═══════════════════════════════════════════════════════════════════════════════
-- Previously only gyms, subscription_requests, admin_messages, support_tickets,
-- and whatsapp tables were published. The core business tables (members,
-- memberships, attendance, workout_programs, inventory, payments) were NOT,
-- which meant:
--   - Owner dashboard/members/payments pages showed stale data until manual refresh
--   - Member PWA never received updates (subscription renewals, attendance, etc.)
--
-- RLS remains the delivery filter — a member can only receive changes to their
-- own rows, and an owner can only receive changes within their gym.

BEGIN;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'members',
    'memberships',
    'attendance',
    'workout_programs',
    'program_assignments',
    'inventory',
    'inventory_sales',
    'due_payments',
    'member_portal_activity'
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

COMMIT;
