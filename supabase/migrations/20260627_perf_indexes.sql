-- Performance indexes for Issues 8 & 9 from the 27 June 2026 production audit.
-- Run: supabase db push

-- Issue 8: Compound index for the most common attendance query pattern.
-- Both dashboard RPC and attendance page query: WHERE gym_id = ? AND date = ?
-- A compound index allows an index-only scan instead of two separate single-column index scans.
CREATE INDEX IF NOT EXISTS idx_attendance_gym_date
  ON attendance(gym_id, date);

-- Issue 9: Compound index for membership expiry status queries.
-- The idx_memberships_end_date single-column index has no gym_id, meaning it covers all gyms.
-- When the query planner uses it for a gym-scoped query, it must re-filter by gym_id after the scan.
-- This compound index enables an index-only scan for the dashboard RPC and expiring members logic.
CREATE INDEX IF NOT EXISTS idx_memberships_gym_end_date
  ON memberships(gym_id, end_date);

-- Bonus: Partial index for dues queries — only indexes rows that actually have outstanding dues.
-- This makes the "Total Dues" dashboard stat query significantly faster on large datasets.
CREATE INDEX IF NOT EXISTS idx_members_gym_dues
  ON members(gym_id, pending_amount)
  WHERE pending_amount > 0;
