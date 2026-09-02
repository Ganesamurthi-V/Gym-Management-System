-- Run: supabase db push
--
-- Partial index for the unread notification badge.
--
-- The query behind it (app/api/support/unread-count/route.ts, and the RLS policy
-- on admin_messages) is:
--
--     SELECT count(*) FROM admin_messages
--     WHERE gym_id = ? AND read_at IS NULL
--
-- The existing idx_admin_messages_gym_id covers only gym_id, so Postgres has to
-- read every message the gym has ever received and re-filter on read_at. Unread
-- rows are a small and shrinking subset of that, which is exactly the case a
-- partial index is for: it indexes only the rows the query wants, so the index
-- stays tiny regardless of message history.
--
-- Measured before this change: ~214ms for the count, versus ~157ms for a plain
-- single-row lookup on gyms — i.e. it was the slowest query in the owner shell.
-- That query has since been moved off the server render path (see the note in
-- lib/dal.ts), so this now speeds up the client-side badge fetch rather than
-- page load. Still worth having: it is the last unindexed predicate on the
-- owner critical path.
--
-- Safe to run on a live database: admin_messages is small, and CREATE INDEX on a
-- small table completes in milliseconds. Deliberately NOT using CONCURRENTLY,
-- because the Supabase CLI wraps migrations in a transaction and CONCURRENTLY
-- cannot run inside one.

CREATE INDEX IF NOT EXISTS idx_admin_messages_gym_unread
  ON admin_messages(gym_id)
  WHERE read_at IS NULL;
