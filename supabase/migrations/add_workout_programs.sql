-- ================================================
-- WORKOUT PROGRAMS
-- ================================================

CREATE TABLE IF NOT EXISTS workout_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT,
  notes TEXT,
  duration INTEGER NOT NULL,
  frequency INTEGER,
  difficulty TEXT,
  goal TEXT,
  category TEXT,
  equipment TEXT,
  target_audience TEXT,
  experience_level TEXT,
  schedule JSONB NOT NULL,
  is_draft BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_programs_gym_id ON workout_programs(gym_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_created ON workout_programs(gym_id, created_at DESC);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gym owners can view their programs"
  ON workout_programs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can insert programs"
  ON workout_programs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can update programs"
  ON workout_programs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );
