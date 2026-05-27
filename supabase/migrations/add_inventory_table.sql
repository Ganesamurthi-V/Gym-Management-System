-- ================================================
-- INVENTORY
-- ================================================

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  sku TEXT,
  description TEXT,
  variant_name TEXT NOT NULL,
  cost_price NUMERIC NOT NULL,
  selling_price NUMERIC NOT NULL,
  member_price NUMERIC,
  initial_stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_gym_id ON inventory(gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(gym_id, category);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(gym_id, sku);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- INVENTORY policies
CREATE POLICY "Gym owners can view their inventory"
  ON inventory FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert inventory"
  ON inventory FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update inventory"
  ON inventory FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete inventory"
  ON inventory FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid())
  );
