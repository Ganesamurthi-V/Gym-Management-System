-- ================================================
-- GEO NORMALIZATION ENGINE
-- Copy and paste this entire block into Supabase SQL Editor
-- ================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
CREATE INDEX IF NOT EXISTS idx_geo_localities_trgm ON geo_localities USING gin(name_normalized gin_trgm_ops);

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

-- RLS Policies
ALTER TABLE geo_localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_normalization_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_review_queue ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can read localities" ON geo_localities;
DROP POLICY IF EXISTS "Authenticated users can insert localities" ON geo_localities;
DROP POLICY IF EXISTS "Authenticated users can update localities" ON geo_localities;
DROP POLICY IF EXISTS "Authenticated users can read aliases" ON geo_aliases;
DROP POLICY IF EXISTS "Authenticated users can insert aliases" ON geo_aliases;
DROP POLICY IF EXISTS "Gym owners can view their normalization logs" ON geo_normalization_log;
DROP POLICY IF EXISTS "Gym owners can insert normalization logs" ON geo_normalization_log;
DROP POLICY IF EXISTS "Gym owners can view their review queue" ON geo_review_queue;
DROP POLICY IF EXISTS "Gym owners can manage their review queue" ON geo_review_queue;

-- Create policies
CREATE POLICY "Authenticated users can read localities"
  ON geo_localities FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert localities"
  ON geo_localities FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update localities"
  ON geo_localities FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read aliases"
  ON geo_aliases FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert aliases"
  ON geo_aliases FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

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

-- Helper functions (called by API routes)
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
