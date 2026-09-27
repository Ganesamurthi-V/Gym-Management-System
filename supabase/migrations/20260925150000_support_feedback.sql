-- ================================================
-- Support Tickets — add owner feedback
--
-- Owners can now leave feedback (a star rating + optional comment) from the same
-- Contact & Support surface they file tickets from. Feedback is stored as a
-- support_tickets row so the admin side sees it in one place, distinguished by
-- type = 'feedback' and carrying a 1-5 rating.
--
-- Two changes, both idempotent so this is safe to re-run:
--   1. widen the type CHECK to allow 'feedback'
--   2. add a nullable rating column (only feedback rows populate it)
--
-- Run in Supabase Dashboard -> SQL Editor.
-- ================================================

-- 1. Allow 'feedback' as a ticket type. Drop the existing named/anonymous CHECK
--    and recreate it with the extra value. The constraint name is deterministic
--    (Postgres names it <table>_<column>_check), so this drops the original from
--    migration 16 whether or not it was ever renamed.
ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_type_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_type_check
  CHECK (type IN ('query', 'issue', 'bug', 'high_priority', 'feedback'));

-- 2. Star rating for feedback rows. Nullable because support tickets do not carry
--    one; bounded 1-5 so a bad client cannot store nonsense.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS rating SMALLINT
  CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));

-- Keep PostgREST's schema cache in step so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
