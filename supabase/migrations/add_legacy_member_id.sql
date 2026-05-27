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
  'The canonical GymDesk ID is derived from member_number as GF + zero-padded 4 digits.';
