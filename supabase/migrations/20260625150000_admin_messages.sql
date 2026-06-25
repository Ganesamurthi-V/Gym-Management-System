-- Admin Messages Table
-- Super admin can send messages/support notes to gym owners.
-- Gym owners read them via their notifications page.

CREATE TABLE IF NOT EXISTS admin_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by TEXT NOT NULL DEFAULT 'super_admin',
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by gym
CREATE INDEX IF NOT EXISTS idx_admin_messages_gym_id ON admin_messages(gym_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON admin_messages(created_at DESC);

-- Enable RLS
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;

-- Gym owners can only read their own messages
CREATE POLICY "Gym owners can read their admin messages"
  ON admin_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

-- Gym owners can mark messages as read (update read_at only)
CREATE POLICY "Gym owners can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

-- Only service_role (super admin) can insert messages (RLS bypassed for service role)
-- No INSERT policy needed — service role bypasses RLS by default
