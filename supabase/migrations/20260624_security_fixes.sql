-- Migration: Security Fixes

-- Fix 1: Add WITH CHECK to geo_review_queue FOR ALL policy
DROP POLICY IF EXISTS "Gym owners can manage their review queue" ON geo_review_queue;
CREATE POLICY "Gym owners can manage their review queue"
  ON geo_review_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = geo_review_queue.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = geo_review_queue.gym_id AND owner_id = auth.uid()));

-- Fix 2: Remove NULL bypass for geo_normalization_log INSERT policy
DROP POLICY IF EXISTS "Gym owners can insert normalization logs" ON geo_normalization_log;
CREATE POLICY "Gym owners can insert normalization logs"
  ON geo_normalization_log FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = geo_normalization_log.gym_id AND owner_id = auth.uid())
  );

-- Fix 3: Remove NULL created_by condition from geo_gym_aliases
DROP POLICY IF EXISTS "Gym owners can manage their own gym aliases" ON geo_gym_aliases;
CREATE POLICY "Gym owners can manage their own gym aliases"
  ON geo_gym_aliases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = geo_gym_aliases.gym_id AND owner_id = auth.uid())
    AND created_by = auth.uid()
  );

-- Fix 4: Add ownership check to increment_inventory_stock
CREATE OR REPLACE FUNCTION increment_inventory_stock(p_inventory_id UUID, amount INTEGER)
RETURNS VOID AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM inventory WHERE id = p_inventory_id;
  IF NOT EXISTS (SELECT 1 FROM gyms WHERE id = v_gym_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE inventory
  SET initial_stock = GREATEST(0, initial_stock + amount),
      updated_at = NOW()
  WHERE id = p_inventory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
