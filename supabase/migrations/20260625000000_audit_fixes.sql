-- Add missing indexes to optimize report aggregations and window functions
CREATE INDEX IF NOT EXISTS idx_memberships_member_created ON memberships(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_gym_created ON members(gym_id, created_at DESC);

-- Add missing UPDATE policy on inventory_sales
CREATE POLICY "Gym owners can update inventory sales"
  ON inventory_sales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));
