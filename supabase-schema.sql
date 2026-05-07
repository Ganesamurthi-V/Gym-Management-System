-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- TABLES
-- ================================================

-- Gyms table
CREATE TABLE IF NOT EXISTS gyms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  area TEXT,
  pending_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, phone),
  UNIQUE(gym_id, member_number)
);

-- Memberships table (one per payment/renewal)
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'quarterly', 'annual')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  admission_fee INTEGER NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, date)
);


-- INDEXES (for performance)

CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_memberships_gym_id ON memberships(gym_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_end_date ON memberships(end_date);
CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance(gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);

-- ROW LEVEL SECURITY (RLS)

ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- GYMS policies
CREATE POLICY "Users can view their own gym"
  ON gyms FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own gym"
  ON gyms FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own gym"
  ON gyms FOR UPDATE
  USING (owner_id = auth.uid());

-- MEMBERS policies
CREATE POLICY "Gym owners can view their members"
  ON members FOR SELECT
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert members"
  ON members FOR INSERT
  WITH CHECK (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update members"
  ON members FOR UPDATE
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete members"
  ON members FOR DELETE
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

-- MEMBERSHIPS policies
CREATE POLICY "Gym owners can view memberships"
  ON memberships FOR SELECT
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert memberships"
  ON memberships FOR INSERT
  WITH CHECK (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update memberships"
  ON memberships FOR UPDATE
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete memberships"
  ON memberships FOR DELETE
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

-- ATTENDANCE policies
CREATE POLICY "Gym owners can view attendance"
  ON attendance FOR SELECT
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert attendance"
  ON attendance FOR INSERT
  WITH CHECK (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete attendance"
  ON attendance FOR DELETE
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );


-- ================================================
-- MIGRATIONS (run these if upgrading existing DB)
-- ================================================

-- [Migration 1] Add gender and area to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS pending_amount INTEGER NOT NULL DEFAULT 0;

-- [Migration 2] Add member_number to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS member_number INTEGER;

-- Assign sequential numbers to existing members (per gym, ordered by join date)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY gym_id ORDER BY created_at) AS rn
  FROM members
)
UPDATE members SET member_number = numbered.rn
FROM numbered WHERE members.id = numbered.id;

-- Make member_number required and unique per gym
ALTER TABLE members ALTER COLUMN member_number SET NOT NULL;
ALTER TABLE members ADD CONSTRAINT IF NOT EXISTS members_gym_id_member_number_key UNIQUE (gym_id, member_number);

-- [Migration 3] Add admission_fee to memberships
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS admission_fee INTEGER NOT NULL DEFAULT 0;

-- [Migration 4] Add performance indexes
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(gym_id, member_number);

--for pending amount
ALTER TABLE members ADD COLUMN IF NOT EXISTS pending_amount INTEGER NOT NULL DEFAULT 0;
