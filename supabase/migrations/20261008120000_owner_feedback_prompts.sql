-- When the feedback pop-up was last shown to each gym owner.
--
-- A new gym owner is asked for feedback in a pop-up: at most once every 3 days, for the first
-- 30 days after the gym was created, and never again once they have sent feedback (a
-- support_tickets row with type = 'feedback'). The only thing that has to be remembered is
-- when the pop-up was last shown, so a closed tab or a second device does not ask again at
-- once. Kept in the database, not in the browser, for that reason.
--
-- One row per gym. The owner can read and write only their own gym's row. Idempotent.

CREATE TABLE IF NOT EXISTS public.owner_feedback_prompts (
  gym_id        UUID        PRIMARY KEY REFERENCES public.gyms(id) ON DELETE CASCADE,
  last_shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shown_count   INTEGER     NOT NULL DEFAULT 1 CHECK (shown_count >= 0)
);

ALTER TABLE public.owner_feedback_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners manage their feedback prompt state" ON public.owner_feedback_prompts;
CREATE POLICY "Gym owners manage their feedback prompt state"
  ON public.owner_feedback_prompts
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gyms g
     WHERE g.id = owner_feedback_prompts.gym_id AND g.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gyms g
     WHERE g.id = owner_feedback_prompts.gym_id AND g.owner_id = (SELECT auth.uid())
  ));

NOTIFY pgrst, 'reload schema';
