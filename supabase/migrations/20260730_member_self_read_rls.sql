-- ================================================
-- MEMBER SELF-READ RLS FOR MEMBERSHIPS & ATTENDANCE
-- ================================================
-- Allows authenticated member PWA users to read their own memberships
-- and attendance records. The members table self-read policy already
-- exists (20260724 migration). This migration adds the linked-table
-- policies and the last_portal_login update trigger.

BEGIN;

-- ── memberships ───────────────────────────────────────────────────────────────
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own memberships" ON public.memberships;
CREATE POLICY "Members can view their own memberships"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- ── attendance ────────────────────────────────────────────────────────────────
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own attendance" ON public.attendance;
CREATE POLICY "Members can view their own attendance"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- ── workout_programs ──────────────────────────────────────────────────────────
-- Members read the gym's published programs (non-draft only).
DROP POLICY IF EXISTS "Members can view their gym programs" ON public.workout_programs;
CREATE POLICY "Members can view their gym programs"
  ON public.workout_programs FOR SELECT
  TO authenticated
  USING (
    gym_id = public.current_member_gym_id()
    AND is_draft = false
  );

-- ── member_portal_activity: member self-read ──────────────────────────────────
DROP POLICY IF EXISTS "Members can view their own activity" ON public.member_portal_activity;
CREATE POLICY "Members can view their own activity"
  ON public.member_portal_activity FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- ── last_portal_login trigger ─────────────────────────────────────────────────
-- Automatically stamps members.last_portal_login when the member logs in.
-- Fires on auth.sessions INSERT (Supabase >= 2.x exposes this via the
-- auth schema trigger mechanism). We use a lightweight AFTER trigger
-- on members so any UPDATE that sets portal_enabled=true can also be
-- used, but the canonical update is done from the activation callback.

-- A helper function updated from the server side (via service-role) is
-- more reliable than auth-schema triggers, so we expose a SECURITY DEFINER
-- function that the member app's login API route can call.

CREATE OR REPLACE FUNCTION public.record_member_login(p_member_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.members
  SET last_portal_login = NOW()
  WHERE id = p_member_id
    AND auth_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_login(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_login(UUID) TO authenticated;

-- ── member_portal_activity: member self-insert (login event) ─────────────────
-- Members can insert their own logged_in activity (client calls this on login).
DROP POLICY IF EXISTS "Members can insert their own login activity" ON public.member_portal_activity;
CREATE POLICY "Members can insert their own login activity"
  ON public.member_portal_activity FOR INSERT
  TO authenticated
  WITH CHECK (
    activity = 'logged_in'
    AND member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
    AND gym_id = public.current_member_gym_id()
  );

COMMIT;
