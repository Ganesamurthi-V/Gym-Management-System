-- Migration: Add check_out_time to attendance

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ;
