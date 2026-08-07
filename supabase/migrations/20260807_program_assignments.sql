-- ═══════════════════════════════════════════════════════════════════════════════
-- PROGRAM ASSIGNMENTS — links members to workout programs
-- ═══════════════════════════════════════════════════════════════════════════════
-- Gym owners assign programs to specific members (or all at once). Members see
-- their assigned programs in the member PWA workout page.

BEGIN;

CREATE TABLE IF NOT EXISTS public.program_assignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  program_id    UUID        NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- A member can only be assigned to the same program once.
  CONSTRAINT uq_program_member UNIQUE (program_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_program_assignments_gym
  ON public.program_assignments(gym_id);
CREATE INDEX IF NOT EXISTS idx_program_assignments_program
  ON public.program_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_program_assignments_member
  ON public.program_assignments(member_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;

-- Gym owners: full CRUD on their own gym's assignments.
CREATE POLICY "Gym owners can view program assignments"
  ON public.program_assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.gyms WHERE id = program_assignments.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert program assignments"
  ON public.program_assignments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.gyms WHERE id = program_assignments.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete program assignments"
  ON public.program_assignments FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.gyms WHERE id = program_assignments.gym_id AND owner_id = auth.uid()));

-- Members: can see their own assignments (for the member PWA).
CREATE POLICY "Members can view their own assignments"
  ON public.program_assignments FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members WHERE auth_user_id = auth.uid()
    )
  );

COMMIT;
