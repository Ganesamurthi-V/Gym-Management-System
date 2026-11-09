-- Biometric hardening. Run in the Supabase SQL editor BEFORE deploying the app code that uses it
-- (the ingest route writes state 'processing' and claimed_at; addDevice writes created_by).
-- Idempotent.

-- Atomic claim: rows being processed are marked 'processing'; claimed_at lets a stuck one be swept after 5 min.
ALTER TABLE device_punches ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE device_punches DROP CONSTRAINT IF EXISTS device_punches_state_check;
ALTER TABLE device_punches ADD CONSTRAINT device_punches_state_check
  CHECK (state IN ('applied', 'unmapped', 'duplicate', 'stale', 'error', 'blocked', 'processing'));

-- Who registered the device (squatting forensics).
ALTER TABLE attendance_devices ADD COLUMN IF NOT EXISTS created_by UUID;

-- Retention purge scans by created_at.
CREATE INDEX IF NOT EXISTS idx_device_punches_created ON device_punches (created_at);

-- Owners may only rename a device; is_active, serial_number, gym_id, timezone etc. are server-controlled.
REVOKE UPDATE ON public.attendance_devices FROM authenticated;
GRANT UPDATE (name) ON public.attendance_devices TO authenticated;
