-- ================================================
-- INVENTORY UNITS (Serialized Tracking)
-- ================================================

CREATE TABLE IF NOT EXISTS inventory_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'expired', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, barcode)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_units_gym_id ON inventory_units(gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_inventory_id ON inventory_units(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_barcode ON inventory_units(gym_id, barcode);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;

-- INVENTORY_UNITS policies
CREATE POLICY "Gym owners can view their inventory units"
  ON inventory_units FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert inventory units"
  ON inventory_units FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update inventory units"
  ON inventory_units FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete inventory units"
  ON inventory_units FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

-- ================================================
-- FUNCTIONS
-- ================================================

CREATE OR REPLACE FUNCTION increment_inventory_stock(p_inventory_id UUID, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory
  SET initial_stock = GREATEST(0, initial_stock + amount),
      updated_at = NOW()
  WHERE id = p_inventory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
