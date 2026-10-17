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
-- Idempotent: safe to run more than once. Defensive: a function that does not exist
-- in this database is skipped with a NOTICE instead of aborting the script (live
-- databases were upgraded by hand and may lack some objects).

DO $mig$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.log_subscription_action(uuid, text, text, text, text, text, timestamptz, timestamptz, text, text)',
    'public.increment_gym_usage_stat(uuid, text, integer)',
    'public.record_whatsapp_sent(uuid, integer)'
  ] LOOP
    IF to_regprocedure(f) IS NULL THEN
      RAISE NOTICE 'skipped (function missing): %', f;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  IF to_regprocedure('public.increment_inventory_stock(uuid, integer)') IS NOT NULL THEN
    ALTER FUNCTION public.increment_inventory_stock(UUID, INTEGER) SET search_path = public;
  ELSE
    RAISE NOTICE 'skipped (function missing): public.increment_inventory_stock(uuid, integer)';
  END IF;
END
$mig$;
