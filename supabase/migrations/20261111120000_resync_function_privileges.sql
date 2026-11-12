-- Re-sync live function security with supabase-schema.sql (Supabase linter, 2026-11-11).
--
-- The AWS-era project was built before the definer-hardening migrations
-- (20261016150000, 20261017120000, …) reached it, so the linter found anon able to
-- execute ~35 SECURITY DEFINER functions. Two of them were real leaks:
--   · get_gym_dashboard(p_gym_id, …) was still SECURITY DEFINER with no owner check,
--     so anyone with the anon key could read any gym's dashboard (members, phones,
--     collections, dues).
--   · search_gym_owner_contacts / gym_id_for_owner_email / check_gym_active read
--     auth.users, so anyone could list every gym owner's e-mail and name.
-- The rest let anon or members call internal helpers (usage counters, subscription
-- audit log, outbox replay) on any gym.
--
-- In priority order:
--   1. get_gym_dashboard -> SECURITY INVOKER (RLS scopes it to the caller's gym).
--   2. Service-role only: the auth.users lookups, the gym-id-taking writers, outbox.
--   3. Trigger-only functions: no API execute grant at all (firing a trigger does
--      not check EXECUTE, so the triggers keep working).
--   4. Member / owner RPCs that derive the caller from auth.uid(): authenticated only.
--   5. Pin search_path on the functions that had none.
--
-- Revoking from anon alone does nothing while PUBLIC holds the default grant, so
-- every revoke names PUBLIC too.
--
-- Idempotent. A function missing from this database is skipped with a NOTICE.

DO $mig$
DECLARE
  r RECORD;
BEGIN
  -- 1. Owner dashboard: let RLS decide the rows. The body uses unqualified table
  --    names, so search_path is public (search_path = '' would make every query
  --    fail and silently drop the dashboard to its slow fallback).
  IF to_regprocedure('public.get_gym_dashboard(uuid, date)') IS NOT NULL THEN
    ALTER FUNCTION public.get_gym_dashboard(UUID, DATE) SECURITY INVOKER SET search_path = public, pg_temp;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      -- 2. Service-role only (admin app / server jobs).
      ('public.check_gym_active(text)',                         'service_role'),
      ('public.gym_id_for_owner_email(text)',                   'service_role'),
      ('public.search_gym_owner_contacts(text, integer)',       'service_role'),
      ('public.log_subscription_action(uuid, text, text, text, text, text, timestamptz, timestamptz, text, text)', 'service_role'),
      ('public.increment_gym_usage_stat(uuid, text, integer)',  'service_role'),
      ('public.record_whatsapp_sent(uuid, integer)',            'service_role'),
      ('public.delete_old_whatsapp_webhook_logs()',             'service_role'),
      ('public.outbox_dismiss_event(uuid)',                     'service_role'),
      ('public.outbox_get_stats()',                             'service_role'),
      ('public.outbox_poll_events(integer)',                    'service_role'),
      ('public.outbox_recover_stuck_events(integer)',           'service_role'),
      ('public.outbox_replay_by_type(text, integer)',           'service_role'),
      ('public.outbox_replay_event(uuid)',                      'service_role'),
      -- 3. Trigger-only / internal: nobody calls these over the API.
      ('public.broadcast_admin_realtime_invalidation()',        NULL),
      ('public.broadcast_owner_delete_invalidation()',          NULL),
      ('public.dispatch_push_on_notification()',                NULL),
      ('public.email_thread_on_message()',                      NULL),
      ('public.notify_on_inbound_email()',                      NULL),
      ('public.notify_on_new_gym()',                            NULL),
      ('public.notify_on_subscription_request()',               NULL),
      ('public.notify_on_support_ticket()',                     NULL),
      ('public.sync_usage_on_attendance_insert()',              NULL),
      ('public.sync_usage_on_member_insert()',                  NULL),
      ('public.sync_usage_on_membership_insert()',              NULL),
      ('public.trg_evaluate_events_on_attendance()',            NULL),
      ('public.evaluate_member_events(uuid)',                   NULL),
      ('public.update_outbox_events_updated_at()',              NULL),
      ('public.update_whatsapp_messages_updated_at()',          NULL),
      -- 4. Called by signed-in owners / members; each derives the caller from auth.uid().
      ('public.get_gym_dashboard(uuid, date)',                  'authenticated'),
      ('public.current_member_gym_id()',                        'authenticated'),
      ('public.get_member_gym()',                               'authenticated'),
      ('public.record_member_login(uuid)',                      'authenticated'),
      ('public.get_member_gamification()',                      'authenticated'),
      ('public.set_leaderboard_visibility(boolean)',            'authenticated'),
      ('public.record_member_achievements(text[])',             'authenticated'),
      ('public.get_gym_leaderboard(text, integer)',             'authenticated'),
      ('public.get_member_events()',                            'authenticated'),
      ('public.evaluate_gym_events(uuid)',                      'authenticated'),
      ('public.increment_inventory_stock(uuid, integer)',       'authenticated'),
      ('public.sell_inventory_item(uuid, integer, numeric, text)', 'authenticated')
    ) AS t(sig, grantee)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE NOTICE 'skipped (function missing): %', r.sig;
      CONTINUE;
    END IF;
    IF r.grantee = 'authenticated' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', to_regprocedure(r.sig));
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', to_regprocedure(r.sig));
    END IF;
    IF r.grantee IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', to_regprocedure(r.sig), r.grantee);
    END IF;
  END LOOP;

  -- 5. Pin search_path on the remaining functions that had none.
  FOR r IN
    SELECT * FROM (VALUES
      ('public.delete_old_whatsapp_webhook_logs()'),
      ('public.update_whatsapp_messages_updated_at()'),
      ('public.update_outbox_events_updated_at()'),
      ('public.outbox_dismiss_event(uuid)'),
      ('public.outbox_get_stats()'),
      ('public.outbox_poll_events(integer)'),
      ('public.outbox_recover_stuck_events(integer)'),
      ('public.outbox_replay_by_type(text, integer)'),
      ('public.outbox_replay_event(uuid)')
    ) AS t(sig)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE NOTICE 'skipped (function missing): %', r.sig;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', to_regprocedure(r.sig));
  END LOOP;
END
$mig$;
