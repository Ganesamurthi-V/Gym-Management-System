-- Drop the unused transactional-outbox objects.
--
-- outbox_events and its outbox_* functions exist only in the live database: no code
-- in this repo (app, admin, workers, infra) references them, and they were never in
-- supabase-schema.sql. Checked 2026-11-11: 0 rows, 0 inserts/updates/deletes ever,
-- no view, function, publication or foreign key depends on the table. Leaving them
-- only kept dead SECURITY DEFINER functions (replay / dismiss events) in the API.
--
-- Idempotent.

DROP TABLE IF EXISTS public.outbox_events CASCADE;  -- also drops trg_outbox_events_updated_at

DROP FUNCTION IF EXISTS public.outbox_get_stats();
DROP FUNCTION IF EXISTS public.outbox_poll_events(INTEGER);
DROP FUNCTION IF EXISTS public.outbox_recover_stuck_events(INTEGER);
DROP FUNCTION IF EXISTS public.outbox_dismiss_event(UUID);
DROP FUNCTION IF EXISTS public.outbox_replay_by_type(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.outbox_replay_event(UUID);
DROP FUNCTION IF EXISTS public.update_outbox_events_updated_at();
