-- ============================================================
-- Make the whatsapp_conversations view respect RLS
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================================
--
-- Why: a Postgres view runs with its OWNER's rights unless it is declared with
-- security_invoker. whatsapp_conversations is owned by `postgres`, and a table
-- owner bypasses RLS, so the view read every gym's rows regardless of who
-- queried it. Supabase additionally grants SELECT on new views in `public` to
-- anon and authenticated by default, so any signed-in user could run
--
--     select * from whatsapp_conversations
--
-- and get the inbound contact numbers and message counts of EVERY tenant. The
-- underlying whatsapp_messages policies were correct; the view sidestepped them.
-- This is the "security definer view" case the Supabase linter warns about.
--
-- security_invoker = true makes the view evaluate whatsapp_messages with the
-- privileges and policies of whoever queries it, so an owner sees only their
-- own gym. The service role still bypasses RLS, so the admin app is unaffected.
--
-- No application code selects from this view today (it is defined in SQL only),
-- so nothing should change in behaviour for the apps.
--
-- Requires Postgres 15 or newer, which every current Supabase project is on.

CREATE OR REPLACE VIEW public.whatsapp_conversations
WITH (security_invoker = true) AS
SELECT
  gym_id,
  from_number AS contact_number,
  MAX(created_at) AS last_message_at,
  COUNT(*) AS message_count,
  COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound_count,
  COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound_count,
  COUNT(*) FILTER (WHERE status = 'read') AS read_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM public.whatsapp_messages
WHERE direction = 'inbound'
GROUP BY gym_id, from_number
ORDER BY last_message_at DESC;

COMMENT ON VIEW public.whatsapp_conversations IS 'Aggregated view of conversations by contact';

NOTIFY pgrst, 'reload schema';
