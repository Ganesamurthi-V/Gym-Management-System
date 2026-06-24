-- Fix Supabase database linter warnings
-- 1. Change SECURITY DEFINER to SECURITY INVOKER
-- 2. Set search_path = '' for functions to prevent search path mutation
-- 3. Revoke EXECUTE from anon role for these functions

ALTER FUNCTION get_gym_dashboard(UUID, DATE) SECURITY INVOKER SET search_path = '';
ALTER FUNCTION get_gym_reports(UUID, DATE) SECURITY INVOKER SET search_path = '';
ALTER FUNCTION increment_inventory_stock(UUID, INTEGER) SECURITY INVOKER SET search_path = '';

-- Handle rls_auto_enable if it exists (wrap in DO block to avoid errors if missing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
    ALTER FUNCTION rls_auto_enable() SECURITY INVOKER SET search_path = '';
    REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM anon;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION get_gym_dashboard(UUID, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION get_gym_reports(UUID, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_inventory_stock(UUID, INTEGER) FROM anon;
