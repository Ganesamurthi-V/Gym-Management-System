-- Migration: Add Category to Memberships
-- Purpose: Support 'strength', 'cardio', or 'both' for memberships.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('strength', 'cardio', 'both')) DEFAULT 'both';
