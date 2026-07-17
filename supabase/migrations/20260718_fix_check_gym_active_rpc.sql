-- ============================================================
-- Fix check_gym_active RPC to handle cancelled and suspended statuses
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Update the check_gym_active RPC to return false for cancelled/suspended accounts
-- Previously only checked: is_active=false, expired, lapsed trial, lapsed paid
-- Now also blocks: cancelled, suspended
CREATE OR REPLACE FUNCTION check_gym_active(p_email text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN g.is_active = false                   THEN false
      WHEN g.subscription_status = 'expired'     THEN false
      WHEN g.subscription_status = 'cancelled'   THEN false
      WHEN g.subscription_status = 'suspended'   THEN false
      WHEN g.subscription_status = 'trial'
           AND g.trial_ends_at < now()           THEN false
      WHEN g.subscription_status = 'active'
           AND g.subscription_ends_at IS NOT NULL
           AND g.subscription_ends_at < now()    THEN false
      ELSE true
    END
  FROM auth.users u
  JOIN gyms g ON g.owner_id = u.id
  WHERE u.email = p_email
  LIMIT 1;
$$;
