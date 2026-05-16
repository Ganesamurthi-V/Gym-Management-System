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
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  admission_fee INTEGER NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, date)
);


-- INDEXES (for performance)

CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_memberships_gym_id ON memberships(gym_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_end_date ON memberships(end_date);
CREATE INDEX IF NOT EXISTS idx_memberships_start_date ON memberships(gym_id, start_date);
CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance(gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);

-- ROW LEVEL SECURITY (RLS)

ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- GYMS policies
CREATE POLICY "Users can view their own gym"
  ON gyms FOR SELECT
  USING (owner_id = auth.uid());

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

CREATE POLICY "Gym owners can update memberships"
  ON memberships FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete memberships"
  ON memberships FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid())
  );

-- ATTENDANCE policies
CREATE POLICY "Gym owners can view attendance"
  ON attendance FOR SELECT
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

-- Hardened: Only service role or admins should modify global localities/aliases
-- For this SaaS, we restrict to SELECT for regular authenticated users.

CREATE POLICY "Gym owners can manage their own gym aliases"
  ON geo_gym_aliases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = geo_gym_aliases.gym_id AND owner_id = auth.uid())
    AND (created_by = auth.uid() OR created_by IS NULL)
  );

CREATE POLICY "Gym owners can view their normalization logs"
  ON geo_normalization_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = geo_normalization_log.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert normalization logs"
  ON geo_normalization_log FOR INSERT
  WITH CHECK (
    gym_id IS NULL OR
    EXISTS (SELECT 1 FROM gyms WHERE id = geo_normalization_log.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can view their review queue"
  ON geo_review_queue FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = geo_review_queue.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can manage their review queue"
  ON geo_review_queue FOR ALL
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = geo_review_queue.gym_id AND owner_id = auth.uid()));

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
