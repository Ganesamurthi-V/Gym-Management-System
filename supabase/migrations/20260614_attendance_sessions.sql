-- ================================================
-- [Migration 15] Add session tracking to Attendance
-- ================================================

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS session TEXT CHECK (session IN ('morning', 'evening')) DEFAULT 'morning';

-- Drop the old unique constraint (member_id, date)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_member_id_date_key;

-- Add the new unique constraint (member_id, date, session)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_member_id_date_session_key;
ALTER TABLE attendance ADD CONSTRAINT attendance_member_id_date_session_key UNIQUE (member_id, date, session);
