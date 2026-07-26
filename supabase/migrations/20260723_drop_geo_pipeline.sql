-- ============================================================
-- Drop the entire geo normalizer pipeline from the database.
--
-- This removes:
--   - geo_review_queue (unresolved areas pending manual review)
--   - geo_normalization_log (audit trail for normalizations)
--   - geo_gym_aliases (gym-specific learned area aliases)
--   - geo_aliases (global alternate spelling aliases)
--   - geo_localities (canonical locality reference data)
--   - Google Places metadata columns from the members table
--
-- The members.area column is KEPT as a simple free-text field.
--
-- Run this in Supabase Dashboard → SQL Editor.
-- ============================================================

-- Drop tables in dependency order (children before parents)

DROP TABLE IF EXISTS geo_review_queue CASCADE;
DROP TABLE IF EXISTS geo_normalization_log CASCADE;
DROP TABLE IF EXISTS geo_gym_aliases CASCADE;
DROP TABLE IF EXISTS geo_aliases CASCADE;
DROP TABLE IF EXISTS geo_localities CASCADE;

-- Drop Google Places metadata columns from members
-- (These were supplementary and are no longer populated)

ALTER TABLE members DROP COLUMN IF EXISTS google_place_id;
ALTER TABLE members DROP COLUMN IF EXISTS google_formatted_addr;
ALTER TABLE members DROP COLUMN IF EXISTS google_locality_raw;
ALTER TABLE members DROP COLUMN IF EXISTS google_city_raw;
ALTER TABLE members DROP COLUMN IF EXISTS google_state_raw;
ALTER TABLE members DROP COLUMN IF EXISTS google_postal_code;
ALTER TABLE members DROP COLUMN IF EXISTS google_latitude;
ALTER TABLE members DROP COLUMN IF EXISTS google_longitude;

-- Drop the index that referenced google_place_id
DROP INDEX IF EXISTS idx_members_google_place_id;
