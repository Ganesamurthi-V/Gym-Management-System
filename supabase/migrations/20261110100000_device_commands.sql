-- Device command channel: owners add/remove members on the biometric device from GymFlow, and can block a
-- member's punches. Run in the Supabase SQL editor BEFORE deploying the app code that uses it.
-- Idempotent.

-- Commands the device polls for (served by /api/devices/commands/next, acknowledged by .../ack).
CREATE TABLE IF NOT EXISTS device_commands (
  id           BIGSERIAL   PRIMARY KEY,
  gym_id       UUID        NOT NULL,
  device_id    UUID        NOT NULL,
  member_id    UUID,
  kind         TEXT        NOT NULL CHECK (kind IN ('add_user', 'remove_user')),
  pin          TEXT        NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  state        TEXT        NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sent', 'done', 'failed')),
  attempts     INT         NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  acked_at     TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (device_id, gym_id) REFERENCES attendance_devices (id, gym_id) ON DELETE CASCADE
);

-- Same-tenant foreign key; the member may be deleted while the command stays (history), so only member_id is nulled.
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_id_gym ON members (id, gym_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_device_commands_member_same_gym'
       AND conrelid = 'public.device_commands'::regclass
  ) THEN
    ALTER TABLE public.device_commands
      ADD CONSTRAINT fk_device_commands_member_same_gym
      FOREIGN KEY (member_id, gym_id) REFERENCES public.members (id, gym_id) ON DELETE SET NULL (member_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_commands_device_state ON device_commands (device_id, state);
CREATE INDEX IF NOT EXISTS idx_device_commands_created ON device_commands (created_at);

ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gym owners can view device commands" ON device_commands;
CREATE POLICY "Gym owners can view device commands" ON device_commands FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = device_commands.gym_id AND owner_id = auth.uid()));

REVOKE ALL ON public.device_commands FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.device_commands TO authenticated;

-- A blocked member's punches are recorded as state 'blocked' and never become attendance.
-- Owners change it only through server actions (admin client).
ALTER TABLE device_user_map ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;

-- Which command syntax the device firmware understands (Privilege= or Pri=).
ALTER TABLE attendance_devices ADD COLUMN IF NOT EXISTS command_dialect TEXT NOT NULL DEFAULT 'privilege';
ALTER TABLE attendance_devices DROP CONSTRAINT IF EXISTS attendance_devices_command_dialect_check;
ALTER TABLE attendance_devices ADD CONSTRAINT attendance_devices_command_dialect_check
  CHECK (command_dialect IN ('privilege', 'pri'));
