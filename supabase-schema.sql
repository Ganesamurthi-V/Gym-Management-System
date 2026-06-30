-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- TABLES
-- ================================================

-- Gyms table
CREATE TABLE IF NOT EXISTS gyms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  area TEXT,
  pending_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, phone),
  UNIQUE(gym_id, member_number)
);

-- Memberships table (one per payment/renewal)
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- TABLES
-- ================================================

-- Gyms table
CREATE TABLE IF NOT EXISTS gyms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  area TEXT,
  pending_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, phone),
  UNIQUE(gym_id, member_number)
);

-- Memberships table (one per payment/renewal)
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'quarterly', 'annual')),
  category TEXT CHECK (category IN ('strength', 'cardio', 'both')) DEFAULT 'both',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  admission_fee INTEGER NOT NULL DEFAULT 0,
  due_amount INTEGER NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Due Payments table
CREATE TABLE IF NOT EXISTS due_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  session TEXT CHECK (session IN ('morning', 'evening')) DEFAULT 'morning',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  check_out_time TIMESTAMPTZ,
  UNIQUE(member_id, date, session)
);


-- Admin Messages table (Super admin support)
CREATE TABLE IF NOT EXISTS admin_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by TEXT NOT NULL DEFAULT 'super_admin',
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_cleared_by_owner BOOLEAN DEFAULT false,
  is_cleared_by_admin BOOLEAN DEFAULT false
);

-- INDEXES (for performance)

-- Covering index for the RLS subquery pattern used on every protected table:
-- EXISTS (SELECT 1 FROM gyms WHERE id = table.gym_id AND owner_id = auth.uid())
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);

CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_memberships_gym_id ON memberships(gym_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_end_date ON memberships(end_date);
CREATE INDEX IF NOT EXISTS idx_memberships_start_date ON memberships(gym_id, start_date);
CREATE INDEX IF NOT EXISTS idx_memberships_member_created ON memberships(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance(gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);

-- Issue 10 fix: Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_gym_date ON attendance(gym_id, date);

-- Issue 11 fix: Add partial index for dues aggregation
CREATE INDEX IF NOT EXISTS idx_members_gym_dues ON members(gym_id, pending_amount) WHERE pending_amount > 0;

CREATE INDEX IF NOT EXISTS idx_due_payments_gym_id ON due_payments(gym_id);

CREATE POLICY "Users can insert their own gym"
  ON gyms FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own gym"
  ON gyms FOR UPDATE
  USING (owner_id = auth.uid());

-- MEMBERS policies
CREATE POLICY "Gym owners can view their members"
  ON members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert members"
  ON members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update members"
  ON members FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete members"
  ON members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())
  );

-- MEMBERSHIPS policies
CREATE POLICY "Gym owners can view memberships"
  ON memberships FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert memberships"
  ON memberships FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid())
  );

  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update attendance"
  ON attendance FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert attendance"
  ON attendance FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete attendance"
  ON attendance FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  );

-- ADMIN_MESSAGES policies
CREATE POLICY "Gym owners can read their admin messages"
  ON admin_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

-- ================================================
-- MIGRATIONS (run these if upgrading existing DB)
-- ================================================

-- [Migration 1] Add gender and area to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS pending_amount INTEGER NOT NULL DEFAULT 0;

-- [Migration 2] Add member_number to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS member_number INTEGER;

-- Assign sequential numbers to existing members (per gym, ordered by join date)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY gym_id ORDER BY created_at) AS rn
  FROM members
)
UPDATE members SET member_number = numbered.rn
FROM numbered WHERE members.id = numbered.id;

-- Make member_number required and unique per gym
ALTER TABLE members ALTER COLUMN member_number SET NOT NULL;
ALTER TABLE members ADD CONSTRAINT IF NOT EXISTS members_gym_id_member_number_key UNIQUE (gym_id, member_number);

-- [Migration 3] Add admission_fee to memberships
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS admission_fee INTEGER NOT NULL DEFAULT 0;

-- [Migration 4] Add performance indexes
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(gym_id, member_number);
CREATE INDEX IF NOT EXISTS idx_members_gym_created ON members(gym_id, created_at DESC);

-- [Migration 5] Add age to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age > 0 AND age < 120);

-- [Migration 7] Add profile info to gyms
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS gst_number TEXT;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS phone TEXT;


-- ================================================
-- GEO NORMALIZATION ENGINE (Migration 6)
-- Run this entire block in Supabase SQL Editor
-- ================================================

-- Enable pg_trgm for fast fuzzy text search
-- Install in extensions schema to avoid extension_in_public warning
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- geo_localities: canonical place database
CREATE TABLE IF NOT EXISTS geo_localities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  name_phonetic TEXT,
  district TEXT,
  state TEXT NOT NULL DEFAULT 'Tamil Nadu',
  country TEXT NOT NULL DEFAULT 'India',
  locality_type TEXT,
  population INTEGER,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  geonames_id INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name_normalized, state)
);

CREATE INDEX IF NOT EXISTS idx_geo_localities_name_norm ON geo_localities(name_normalized);
CREATE INDEX IF NOT EXISTS idx_geo_localities_state ON geo_localities(state);
CREATE INDEX IF NOT EXISTS idx_geo_localities_district ON geo_localities(district);
CREATE INDEX IF NOT EXISTS idx_geo_localities_trgm ON geo_localities USING gin(name_normalized extensions.gin_trgm_ops);

-- geo_aliases: alternate spellings → canonical locality
CREATE TABLE IF NOT EXISTS geo_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alias_raw TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  locality_id UUID NOT NULL REFERENCES geo_localities(id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL DEFAULT 'common',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_geo_aliases_norm ON geo_aliases(alias_normalized);
CREATE INDEX IF NOT EXISTS idx_geo_aliases_locality ON geo_aliases(locality_id);

-- geo_gym_aliases: gym-specific learned aliases
CREATE TABLE IF NOT EXISTS geo_gym_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  alias_raw TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alias_normalized, gym_id)
);

CREATE INDEX IF NOT EXISTS idx_geo_gym_aliases_gym ON geo_gym_aliases(gym_id);
CREATE INDEX IF NOT EXISTS idx_geo_gym_aliases_norm ON geo_gym_aliases(alias_normalized);

-- geo_normalization_log: audit trail
CREATE TABLE IF NOT EXISTS geo_normalization_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID REFERENCES gyms(id) ON DELETE SET NULL,
  raw_input TEXT NOT NULL,
  normalized_value TEXT,
  canonical_locality_id UUID REFERENCES geo_localities(id) ON DELETE SET NULL,
  confidence_score NUMERIC(5,4),
  matched_by TEXT,
  geo_hierarchy JSONB,
  requires_review BOOLEAN NOT NULL DEFAULT false,
  import_session_id TEXT,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_log_gym ON geo_normalization_log(gym_id);
CREATE INDEX IF NOT EXISTS idx_geo_log_raw ON geo_normalization_log(raw_input);
CREATE INDEX IF NOT EXISTS idx_geo_log_review ON geo_normalization_log(requires_review) WHERE requires_review = true;
CREATE INDEX IF NOT EXISTS idx_geo_log_created ON geo_normalization_log(created_at DESC);

-- geo_review_queue: unresolved matches waiting for admin decision
CREATE TABLE IF NOT EXISTS geo_review_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
  raw_input TEXT NOT NULL,
  top_suggestion TEXT,
  top_confidence NUMERIC(5,4),
  all_suggestions JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_to TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  log_id UUID REFERENCES geo_normalization_log(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_queue_gym ON geo_review_queue(gym_id);
CREATE INDEX IF NOT EXISTS idx_geo_queue_status ON geo_review_queue(status) WHERE status = 'pending';

-- RLS
ALTER TABLE geo_localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_gym_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_normalization_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read localities"
  ON geo_localities FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read aliases"
  ON geo_aliases FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE on geo_localities and geo_aliases is intentionally blocked for regular users.
-- In Postgres RLS, when ENABLE ROW LEVEL SECURITY is on and no matching policy exists for an
-- operation, the default is DENY. There are intentionally no INSERT/UPDATE/DELETE policies here.
-- Use the service role (admin client) for bulk seed operations only.
-- Do NOT add a permissive mutation policy thinking you are filling a gap - this is by design.

CREATE POLICY "Gym owners can manage their own gym aliases"
  ON geo_gym_aliases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = geo_gym_aliases.gym_id AND owner_id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Gym owners can view their normalization logs"
  ON geo_normalization_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = geo_normalization_log.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert normalization logs"
  ON geo_normalization_log FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = geo_normalization_log.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can view their review queue"
  ON geo_review_queue FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = geo_review_queue.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can manage their review queue"
  ON geo_review_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = geo_review_queue.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = geo_review_queue.gym_id AND owner_id = auth.uid()));

-- ── Helper functions (called by API routes via supabase.rpc) ─────────────────

-- Trigram similarity search
CREATE OR REPLACE FUNCTION search_localities_trigram(
  query_text TEXT,
  result_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  name_normalized TEXT,
  name_phonetic TEXT,
  district TEXT,
  state TEXT,
  trgm_score FLOAT
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT
    id, name, name_normalized, name_phonetic, district, state,
    similarity(name_normalized, query_text)::FLOAT AS trgm_score
  FROM geo_localities
  WHERE similarity(name_normalized, query_text) > 0.15
    AND is_active = true
  ORDER BY trgm_score DESC
  LIMIT result_limit;
$$;

-- Autocomplete search (prefix + trigram)
CREATE OR REPLACE FUNCTION search_localities_autocomplete(
  query_text TEXT,
  prefix_text TEXT,
  result_limit INTEGER DEFAULT 8
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  district TEXT,
  state TEXT
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT id, name, district, state
  FROM geo_localities
  WHERE (
    name_normalized ILIKE prefix_text || '%'
    OR similarity(name_normalized, query_text) > 0.20
  )
  AND is_active = true
  ORDER BY
    CASE WHEN name_normalized ILIKE prefix_text || '%' THEN 1 ELSE 2 END,
    similarity(name_normalized, query_text) DESC
  LIMIT result_limit;
$$;

-- ── Security hardening ────────────────────────────────────────────────────
-- Revoke EXECUTE on rls_auto_enable from anon and authenticated roles
-- Fixes: anon_security_definer_function_executable warning
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- Create the gym plan prices table
CREATE TABLE IF NOT EXISTS gym_plan_prices (
  gym_id    UUID PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  monthly   INTEGER NOT NULL DEFAULT 1500,
  quarterly INTEGER NOT NULL DEFAULT 4000,
  annual    INTEGER NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: only the gym owner can read their own prices
ALTER TABLE gym_plan_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own plan prices"
  ON gym_plan_prices FOR SELECT
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );


-- ================================================
-- [Migration 8] Onboarding system
-- ================================================

ALTER TABLE gyms ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS onboarding_data JSONB;

-- Update existing gyms to mark onboarding as completed (they were created before this feature)
UPDATE gyms SET onboarding_completed = TRUE WHERE onboarding_completed IS NULL OR onboarding_completed = FALSE;

-- RLS already covers gyms table

-- Allow gym owners to update onboarding_data and onboarding_completed on their own gym
-- (covered by the existing "Users can update their own gym" policy)

-- ================================================
-- [Migration 9] Joining fees per plan in gym_plan_prices
-- ================================================

ALTER TABLE gym_plan_prices ADD COLUMN IF NOT EXISTS joining_fee_monthly   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gym_plan_prices ADD COLUMN IF NOT EXISTS joining_fee_quarterly  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gym_plan_prices ADD COLUMN IF NOT EXISTS joining_fee_annual     INTEGER NOT NULL DEFAULT 0;

-- Allow owners to write their own plan prices
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'gym_plan_prices' AND policyname = 'Owner can upsert own plan prices'
  ) THEN
    CREATE POLICY "Owner can upsert own plan prices"
      ON gym_plan_prices FOR INSERT
      WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'gym_plan_prices' AND policyname = 'Owner can update own plan prices'
  ) THEN
    CREATE POLICY "Owner can update own plan prices"
      ON gym_plan_prices FOR UPDATE
      USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- ================================================
-- [Migration 10] Google Places hybrid geo metadata
-- Stores supplementary Google data alongside existing canonical area columns.
-- The canonical area columns (area, _area_confidence, etc.) remain unchanged.
-- ================================================

-- Add Google Places metadata columns to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_place_id       TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_formatted_addr TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_locality_raw   TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_city_raw       TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_state_raw      TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_postal_code    TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_latitude       NUMERIC(10, 7);
ALTER TABLE members ADD COLUMN IF NOT EXISTS google_longitude      NUMERIC(10, 7);

-- Index for place_id lookups (deduplication, analytics)
CREATE INDEX IF NOT EXISTS idx_members_google_place_id ON members(google_place_id) WHERE google_place_id IS NOT NULL;

-- NOTE: google_place_id is supplementary metadata only.
-- The canonical area is still stored in members.area (free text, normalized by GymFlow pipeline).
-- Do NOT use google_place_id as a foreign key or canonical identifier.

-- Migration: Add legacy_member_id column to members table
-- Run this in your Supabase SQL editor or via the Supabase CLI.
--
-- Purpose:
--   When importing members from external systems (e.g. old gym software),
--   the original ID (e.g. "C1006", "MEM-042") is preserved here.
--   The new canonical ID format is GF-prefixed: GF0001, GF0042, etc.,
--   derived from the integer member_number column.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS legacy_member_id TEXT DEFAULT NULL;

COMMENT ON COLUMN members.legacy_member_id IS
  'Original member ID from an external/legacy system, preserved during import. '
  'The canonical GymFlow ID is derived from member_number as GF + zero-padded 4 digits.';

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

-- ================================================
-- FUNCTIONS
-- ================================================

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ================================================
-- INVENTORY SALES (Revenue Tracking)
-- ================================================

CREATE TABLE IF NOT EXISTS inventory_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'upi', 'card')),
  sold_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_sales_gym_id ON inventory_sales(gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sales_inventory_id ON inventory_sales(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sales_sold_at ON inventory_sales(gym_id, sold_at DESC);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE inventory_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gym owners can view their inventory sales"
  ON inventory_sales FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert inventory sales"
  ON inventory_sales FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete inventory sales"
  ON inventory_sales FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update inventory sales"
  ON inventory_sales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

-- ================================================
-- WORKOUT PROGRAMS
-- ================================================

CREATE TABLE IF NOT EXISTS workout_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT,
  notes TEXT,
  duration INTEGER NOT NULL,
  frequency INTEGER,
  difficulty TEXT,
  goal TEXT,
  category TEXT,
  equipment TEXT,
  target_audience TEXT,
  experience_level TEXT,
  schedule JSONB NOT NULL,
  is_draft BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_programs_gym_id ON workout_programs(gym_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_created ON workout_programs(gym_id, created_at DESC);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gym owners can view their programs"
  ON workout_programs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert programs"
  ON workout_programs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update programs"
  ON workout_programs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

-- ================================================
-- [Migration 11] Add Category to Memberships
-- ================================================

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('strength', 'cardio', 'both')) DEFAULT 'both';


-- ================================================
-- [Migration 14] Add check_out_time to Attendance
-- ================================================

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ;

-- ================================================
-- [Migration 15] Gym Deactivation
-- ================================================

-- Create an RPC function to safely check a gym's active status by email
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

-- ================================================
-- [Migration 16] Support Tickets
-- ================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('query', 'issue', 'bug', 'high_priority')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  is_cleared_by_owner BOOLEAN DEFAULT false,
  is_cleared_by_admin BOOLEAN DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_gym_id ON support_tickets(gym_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gym owners can view their support tickets"
  ON support_tickets FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert support tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));


-- ================================================
-- [Migration 17] Enable Realtime for Support & Messages
-- ================================================

-- Add tables to the supabase_realtime publication to enable WebSocket broadcasting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;
  END IF;
END $$;


-- ================================================
-- [Migration 12] Dashboard RPC
-- ================================================

CREATE OR REPLACE FUNCTION get_gym_dashboard(p_gym_id UUID, p_today DATE)
RETURNS JSON AS $$
DECLARE
  v_total_active INT;
  v_expiring_this_week INT;
  v_expired_count INT;
  v_today_attendance INT;
  v_today_collection NUMERIC;
  v_total_dues NUMERIC;
  v_expiring_members JSON;
BEGIN
  -- 1. Attendance today
  SELECT COUNT(*) INTO v_today_attendance
  FROM attendance
  WHERE gym_id = p_gym_id AND date = p_today;

  -- 2. Today's collection
  SELECT COALESCE(SUM(amount + admission_fee), 0) INTO v_today_collection
  FROM memberships
  WHERE gym_id = p_gym_id AND start_date = p_today;

  -- 3. Total dues
  SELECT COALESCE(SUM(pending_amount), 0) INTO v_total_dues
  FROM members
  WHERE gym_id = p_gym_id AND pending_amount > 0;

  -- 4. Member Statuses & Expiring Members
  -- We use a CTE to get the latest membership for each member
  WITH latest_memberships AS (
    SELECT 
      m.id AS member_id,
      m.name,
      m.phone,
      m.member_number,
      ms.end_date,
      ms.id AS membership_id,
      ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY ms.created_at DESC) as rn
    FROM members m
    LEFT JOIN memberships ms ON ms.member_id = m.id
    WHERE m.gym_id = p_gym_id
  ),
  member_statuses AS (
    SELECT 
      member_id,
      name,
      phone,
      member_number,
      end_date,
      CASE 
        WHEN end_date IS NULL THEN 'expired'
        WHEN end_date < p_today THEN 'expired'
        WHEN end_date >= p_today AND end_date <= (p_today + INTERVAL '7 days')::DATE THEN 'expiring'
        ELSE 'active'
      END as status,
      (end_date - p_today) as days_remaining
    FROM latest_memberships
    WHERE rn = 1
  )
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('active', 'expiring'))::INT,
    COUNT(*) FILTER (WHERE status = 'expiring')::INT,
    COUNT(*) FILTER (WHERE status = 'expired')::INT,
    COALESCE(
      json_agg(
        json_build_object(
          'id', member_id,
          'name', name,
          'phone', phone,
          'member_number', member_number,
          'status', status,
          'days_remaining', days_remaining,
          'latest_membership', json_build_object('end_date', end_date)
        ) ORDER BY days_remaining ASC
      ) FILTER (WHERE status = 'expiring'), 
      '[]'::json
    )
  INTO 
    v_total_active, 
    v_expiring_this_week, 
    v_expired_count,
    v_expiring_members
  FROM member_statuses;

  RETURN json_build_object(
    'stats', json_build_object(
      'total_active', COALESCE(v_total_active, 0),
      'expiring_this_week', COALESCE(v_expiring_this_week, 0),
      'expired_count', COALESCE(v_expired_count, 0),
      'today_attendance', COALESCE(v_today_attendance, 0),
      'today_collection', COALESCE(v_today_collection, 0),
      'total_dues', COALESCE(v_total_dues, 0)
    ),
    'expiringMembers', v_expiring_members
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ================================================
-- [Migration 13] Reports RPC
-- ================================================

CREATE OR REPLACE FUNCTION get_gym_reports(p_gym_id UUID, p_today DATE)
RETURNS JSON AS $$
DECLARE
  v_months JSON;
  v_inventory_sales JSON;
  v_recent_inventory_sales JSON;
  v_expired_count INT;
  v_active_count INT;
  v_churn_count INT;
  v_plan_counts JSON;
  v_gender_counts JSON;
  v_age_buckets JSON;
  v_new_members_by_month JSON;
  v_attendance_by_day JSON;
  v_top_areas JSON;
  v_members_with_dues JSON;
  v_total_dues_amount NUMERIC;
  v_expiring_members JSON;
  v_attendance_today_count INT;
BEGIN
  -- 1. Generate 6-month ranges
  -- We'll use a temporary table or just CTEs within queries. 
  -- Since we need it across multiple queries, let's create a temp table to make it cleaner,
  -- or just calculate the boundaries.
  
  -- Monthly Revenue (months)
  WITH month_ranges AS (
    SELECT 
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'total', COALESCE(rev.total, 0),
      'cash', COALESCE(rev.cash, 0),
      'upi', COALESCE(rev.upi, 0),
      'card', COALESCE(rev.card, 0),
      'transactions', COALESCE(rev.transactions, 0),
      'newMembers', COALESCE(rev.new_members, 0)
    ) ORDER BY mr.idx DESC -- We want oldest first (idx 5 down to 0)
  ), '[]'::json) INTO v_months
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT 
      SUM(amount + admission_fee) AS total,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'cash') AS cash,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'upi') AS upi,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'card') AS card,
      COUNT(*) AS transactions,
      COUNT(DISTINCT member_id) AS new_members
    FROM memberships
    WHERE gym_id = p_gym_id AND start_date >= mr.start_dt AND start_date <= mr.end_dt
  ) rev ON true;

  -- Monthly Inventory Sales
  WITH month_ranges AS (
    SELECT 
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'total', COALESCE(inv.total, 0),
      'quantity', COALESCE(inv.quantity, 0)
    ) ORDER BY mr.idx DESC
  ), '[]'::json) INTO v_inventory_sales
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT 
      SUM(total_price) AS total,
      SUM(quantity) AS quantity
    FROM inventory_sales
    WHERE gym_id = p_gym_id AND sold_at >= mr.start_dt AND sold_at <= (mr.end_dt + interval '1 day - 1 second')
  ) inv ON true;

  -- Recent Inventory Sales (Last 20)
  SELECT COALESCE(json_agg(row_to_json(inv_sales)), '[]'::json) INTO v_recent_inventory_sales
  FROM (
    SELECT total_price, quantity, product_name, variant_name, payment_mode, sold_at
    FROM inventory_sales
    WHERE gym_id = p_gym_id
    ORDER BY sold_at DESC
    LIMIT 20
  ) inv_sales;

  -- Latest Memberships & Member Statuses
  -- Using a CTE for latest membership per member
  WITH latest_memberships AS (
    SELECT DISTINCT ON (m.id)
      m.id AS member_id,
      m.name,
      m.phone,
      m.gender,
      m.age,
      m.area,
      m.pending_amount,
      m.created_at,
      ms.end_date,
      ms.plan
    FROM members m
    LEFT JOIN memberships ms ON ms.member_id = m.id AND ms.gym_id = p_gym_id
    WHERE m.gym_id = p_gym_id
    ORDER BY m.id, ms.created_at DESC
  )
  SELECT 
    COUNT(*) FILTER (WHERE end_date < p_today),
    COUNT(*) FILTER (WHERE end_date >= p_today),
    COUNT(*) FILTER (WHERE end_date < p_today), -- Churn is same as expired currently
    json_build_object(
      'monthly', COUNT(*) FILTER (WHERE plan = 'monthly'),
      'quarterly', COUNT(*) FILTER (WHERE plan = 'quarterly'),
      'annual', COUNT(*) FILTER (WHERE plan = 'annual')
    ),
    json_build_object(
      'male', COUNT(*) FILTER (WHERE gender = 'male'),
      'female', COUNT(*) FILTER (WHERE gender = 'female'),
      'other', COUNT(*) FILTER (WHERE gender = 'other'),
      'unknown', COUNT(*) FILTER (WHERE gender IS NULL)
    ),
    json_build_object(
      '<18', COUNT(*) FILTER (WHERE age < 18),
      '18-25', COUNT(*) FILTER (WHERE age >= 18 AND age <= 25),
      '26-35', COUNT(*) FILTER (WHERE age >= 26 AND age <= 35),
      '36-45', COUNT(*) FILTER (WHERE age >= 36 AND age <= 45),
      '46+', COUNT(*) FILTER (WHERE age >= 46),
      'unknown', COUNT(*) FILTER (WHERE age IS NULL)
    ),
    COALESCE(
      json_agg(
        json_build_object(
          'name', name,
          'phone', phone,
          'endDate', end_date,
          'plan', COALESCE(plan, 'None')
        ) ORDER BY end_date ASC
      ) FILTER (WHERE end_date IS NOT NULL), '[]'::json
    )
  INTO 
    v_expired_count,
    v_active_count,
    v_churn_count,
    v_plan_counts,
    v_gender_counts,
    v_age_buckets,
    v_expiring_members
  FROM latest_memberships;

  -- New Members By Month (Using same 6 month logic)
  WITH month_ranges AS (
    SELECT 
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'count', COALESCE(mem.new_count, 0)
    ) ORDER BY mr.idx DESC
  ), '[]'::json) INTO v_new_members_by_month
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS new_count
    FROM members
    WHERE gym_id = p_gym_id AND created_at >= mr.start_dt AND created_at <= (mr.end_dt + interval '1 day - 1 second')
  ) mem ON true;

  -- Attendance By Day (Last 3 months)
  WITH day_names (idx, name) AS (
    VALUES (0, 'Sun'), (1, 'Mon'), (2, 'Tue'), (3, 'Wed'), (4, 'Thu'), (5, 'Fri'), (6, 'Sat')
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'name', dn.name,
      'count', COALESCE(att.cnt, 0)
    ) ORDER BY dn.idx ASC
  ), '[]'::json) INTO v_attendance_by_day
  FROM day_names dn
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM attendance
    WHERE gym_id = p_gym_id AND date >= (p_today - interval '3 months')::date
      AND EXTRACT(DOW FROM date) = dn.idx
  ) att ON true;

  -- Attendance Today Count
  SELECT COUNT(*) INTO v_attendance_today_count
  FROM attendance
  WHERE gym_id = p_gym_id AND date = p_today;

  -- Top 5 Areas (Changed to Top 10 in JS previously, let's keep Top 10)
  SELECT COALESCE(json_agg(area_agg), '[]'::json) INTO v_top_areas
  FROM (
    SELECT json_build_object('area', area, 'count', COUNT(*)) AS area_agg
    FROM members
    WHERE gym_id = p_gym_id AND area IS NOT NULL
    GROUP BY area
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) a;

  -- Dues Analytics
  SELECT 
    COALESCE(json_agg(
      json_build_object(
        'name', name,
        'phone', phone,
        'amount', pending_amount
      )
    ), '[]'::json),
    COALESCE(SUM(pending_amount), 0)
  INTO 
    v_members_with_dues,
    v_total_dues_amount
  FROM members
  WHERE gym_id = p_gym_id AND pending_amount > 0;

  -- Return final JSON
  RETURN json_build_object(
    'months', v_months,
    'inventorySales', v_inventory_sales,
    'recentInventorySales', v_recent_inventory_sales,
    'expiredCount', COALESCE(v_expired_count, 0),
    'activeCount', COALESCE(v_active_count, 0),
    'churnCount', COALESCE(v_churn_count, 0),
    'planCounts', COALESCE(v_plan_counts, '{}'::json),
    'genderCounts', COALESCE(v_gender_counts, '{}'::json),
    'ageBuckets', COALESCE(v_age_buckets, '{}'::json),
    'newMembersByMonth', v_new_members_by_month,
    'attendanceByDay', v_attendance_by_day,
    'topAreas', v_top_areas,
    'membersWithDues', v_members_with_dues,
    'totalDuesAmount', COALESCE(v_total_dues_amount, 0),
    'expiringMembers', v_expiring_members,
    'attendanceTodayCount', COALESCE(v_attendance_today_count, 0)
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
