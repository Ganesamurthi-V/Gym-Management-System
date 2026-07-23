-- ============================================================
-- Gym UPI Merchant Configuration
--
-- Stores the normalized UPI merchant data parsed from the gym
-- owner's uploaded/scanned QR code. One row per gym.
-- ============================================================

CREATE TABLE IF NOT EXISTS gym_upi_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,

  -- Normalized merchant data (extracted from the QR code)
  upi_id TEXT NOT NULL,                -- pa: payee VPA e.g. 9384271126@ibl
  merchant_name TEXT NOT NULL,         -- pn: display name
  merchant_code TEXT,                  -- mc: merchant category code (optional)
  currency TEXT NOT NULL DEFAULT 'INR',-- cu: currency

  -- Raw parsed parameters from the original QR (for future compatibility)
  raw_params JSONB NOT NULL DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast gym lookup
CREATE INDEX IF NOT EXISTS idx_gym_upi_config_gym_id ON gym_upi_config(gym_id);

-- Row Level Security
ALTER TABLE gym_upi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gym owners can view their UPI config"
  ON gym_upi_config FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert their UPI config"
  ON gym_upi_config FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update their UPI config"
  ON gym_upi_config FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete their UPI config"
  ON gym_upi_config FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );
