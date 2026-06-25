-- 1. Add is_active column to gyms table
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Create an RPC function to safely check a gym's active status by email
-- This uses SECURITY DEFINER so it can query the gyms table (and auth.users) without the user needing to be logged in.
CREATE OR REPLACE FUNCTION check_gym_active(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_owner_id UUID;
  v_is_active BOOLEAN;
BEGIN
  -- Find the user ID for this email from auth.users
  SELECT id INTO v_owner_id FROM auth.users WHERE email = p_email LIMIT 1;
  
  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Find the gym for this user
  SELECT is_active INTO v_is_active FROM public.gyms WHERE owner_id = v_owner_id LIMIT 1;
  
  IF v_is_active IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN v_is_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
