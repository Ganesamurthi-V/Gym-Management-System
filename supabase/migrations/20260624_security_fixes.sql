-- Migration: Security Fixes

-- Fix: Add ownership check to increment_inventory_stock
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
