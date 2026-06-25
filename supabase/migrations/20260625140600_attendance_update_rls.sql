-- Migration: Add update policy for attendance

CREATE POLICY "Gym owners can update attendance"
  ON attendance FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  );
