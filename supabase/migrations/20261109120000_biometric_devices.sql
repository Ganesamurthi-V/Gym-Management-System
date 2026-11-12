-- Biometric (ADMS push) attendance: devices, pin -> member mapping, raw punch log, attendance.source.
-- Run in the Supabase SQL editor BEFORE deploying the app code. The kiosk code does not need the new
-- column, but the device ingest route (/api/devices/punches) and the owner device UI do.

-- ── attendance.source ────────────────────────────────────────
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'kiosk';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_source_check' AND conrelid = 'public.attendance'::regclass) THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_source_check CHECK (source IN ('kiosk', 'device'));
  END IF;
END $$;

-- ── attendance_devices ───────────────────────────────────────
-- One row per physical biometric reader. The receiver service identifies a device by serial_number only;
-- the gym is always taken from this row, never from the pushed payload.
CREATE TABLE IF NOT EXISTS attendance_devices (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id         UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  serial_number  TEXT        NOT NULL UNIQUE CHECK (serial_number ~ '^[A-Za-z0-9_-]{1,64}$'),
  name           TEXT        NOT NULL,
  timezone       TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  last_seen_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, gym_id)
);

-- ── device_user_map ──────────────────────────────────────────
-- Which member a pin enrolled on a device belongs to.
CREATE TABLE IF NOT EXISTS device_user_map (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        NOT NULL,
  device_id   UUID        NOT NULL,
  pin         TEXT        NOT NULL,
  member_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, pin),
  FOREIGN KEY (device_id, gym_id) REFERENCES attendance_devices (id, gym_id) ON DELETE CASCADE
);

-- ── device_punches ───────────────────────────────────────────
-- Raw punches as pushed, with what happened to each. unique(device_id, pin, punched_at) makes a retried
-- POST idempotent. state 'error' also means "recorded but not processed yet" and is retried.
CREATE TABLE IF NOT EXISTS device_punches (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        NOT NULL,
  device_id   UUID        NOT NULL,
  pin         TEXT        NOT NULL,
  punched_at  TIMESTAMPTZ NOT NULL,
  status      INT,
  verify_type INT,
  state       TEXT        NOT NULL CHECK (state IN ('applied', 'unmapped', 'duplicate', 'stale', 'error', 'blocked')),
  member_id   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, pin, punched_at),
  FOREIGN KEY (device_id, gym_id) REFERENCES attendance_devices (id, gym_id) ON DELETE CASCADE
);

-- Same-tenant foreign key: a pin can only map to a member of the same gym.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_device_user_map_member_same_gym' AND conrelid = 'public.device_user_map'::regclass) THEN
    ALTER TABLE device_user_map ADD CONSTRAINT fk_device_user_map_member_same_gym
      FOREIGN KEY (member_id, gym_id) REFERENCES members (id, gym_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_punches_device_pin_state ON device_punches (device_id, pin, state);
CREATE INDEX IF NOT EXISTS idx_device_punches_gym_created ON device_punches (gym_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE attendance_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_user_map    ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_punches     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view devices" ON attendance_devices;
CREATE POLICY "Gym owners can view devices" ON attendance_devices FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance_devices.gym_id AND owner_id = auth.uid()));
DROP POLICY IF EXISTS "Gym owners can insert devices" ON attendance_devices;
CREATE POLICY "Gym owners can insert devices" ON attendance_devices FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = attendance_devices.gym_id AND owner_id = auth.uid()));
DROP POLICY IF EXISTS "Gym owners can update devices" ON attendance_devices;
CREATE POLICY "Gym owners can update devices" ON attendance_devices FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance_devices.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = attendance_devices.gym_id AND owner_id = auth.uid()));
DROP POLICY IF EXISTS "Gym owners can delete devices" ON attendance_devices;
CREATE POLICY "Gym owners can delete devices" ON attendance_devices FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance_devices.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can view device users" ON device_user_map;
CREATE POLICY "Gym owners can view device users" ON device_user_map FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = device_user_map.gym_id AND owner_id = auth.uid()));
DROP POLICY IF EXISTS "Gym owners can insert device users" ON device_user_map;
CREATE POLICY "Gym owners can insert device users" ON device_user_map FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = device_user_map.gym_id AND owner_id = auth.uid()));
DROP POLICY IF EXISTS "Gym owners can update device users" ON device_user_map;
CREATE POLICY "Gym owners can update device users" ON device_user_map FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = device_user_map.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = device_user_map.gym_id AND owner_id = auth.uid()));
DROP POLICY IF EXISTS "Gym owners can delete device users" ON device_user_map;
CREATE POLICY "Gym owners can delete device users" ON device_user_map FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = device_user_map.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can view device punches" ON device_punches;
CREATE POLICY "Gym owners can view device punches" ON device_punches FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = device_punches.gym_id AND owner_id = auth.uid()));

-- ── Privileges ───────────────────────────────────────────────
-- Punches are written only by the ingest route (service role); owners read them.
REVOKE ALL ON public.attendance_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_devices TO authenticated;
REVOKE ALL ON public.device_user_map FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_user_map TO authenticated;
REVOKE ALL ON public.device_punches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.device_punches TO authenticated;
