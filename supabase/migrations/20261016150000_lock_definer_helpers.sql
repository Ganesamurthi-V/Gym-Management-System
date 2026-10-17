-- Lock down SECURITY DEFINER helpers that act on a caller-supplied gym id.
--
-- log_subscription_action, increment_gym_usage_stat and record_whatsapp_sent run as
-- the function owner and write to any gym the caller names, with no check of who is
-- calling. They were never revoked, so Postgres' default EXECUTE grant to PUBLIC let
-- any API caller (anon or authenticated) forge subscription audit-log entries and
-- tamper with usage counters for every gym. Only the admin app calls the first one,
-- and it uses the service role; the other two have no application caller.
--
-- increment_inventory_stock also gains a pinned search_path, like every other
-- SECURITY DEFINER function here (its owner check via auth.uid() is unchanged).
--
-- Idempotent: safe to run more than once.

REVOKE ALL ON FUNCTION public.log_subscription_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_subscription_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.increment_gym_usage_stat(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_gym_usage_stat(UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.record_whatsapp_sent(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_sent(UUID, INTEGER) TO service_role;

ALTER FUNCTION public.increment_inventory_stock(UUID, INTEGER) SET search_path = public;
