-- Member PWA M0: auth identity linkage and read-only self access.
-- This migration is additive and does not alter existing owner policies.

BEGIN;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS member_code TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_blood_group_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_blood_group_check
      CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_auth_user_id_unique
  ON public.members(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_email_lower
  ON public.members(LOWER(email))
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_gym_member_code_unique
  ON public.members(gym_id, member_code)
  WHERE member_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_member_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number TEXT := NEW.member_number::TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.member_code := 'GF-' || LPAD(v_number, GREATEST(5, LENGTH(v_number)), '0');
  ELSIF NEW.member_number IS DISTINCT FROM OLD.member_number
     OR NEW.member_code IS NULL
     OR BTRIM(NEW.member_code) = '' THEN
    NEW.member_code := 'GF-' || LPAD(v_number, GREATEST(5, LENGTH(v_number)), '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_member_code ON public.members;
CREATE TRIGGER trg_generate_member_code
  BEFORE INSERT OR UPDATE OF member_number, member_code ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.generate_member_code();

UPDATE public.members
SET member_code = 'GF-' || LPAD(
  member_number::TEXT,
  GREATEST(5, LENGTH(member_number::TEXT)),
  '0'
)
WHERE member_code IS NULL OR BTRIM(member_code) = '';

-- auth_user_id is an authorization boundary. Existing owner RLS permits row
-- updates, so this trigger prevents owner JWTs from linking an Auth identity.
-- Linking must run through a trusted service-role/admin workflow.
CREATE OR REPLACE FUNCTION public.guard_member_auth_user_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_role TEXT := COALESCE(auth.role(), '');
  v_link_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_link_changed := NEW.auth_user_id IS NOT NULL;
  ELSE
    v_link_changed := NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id;
  END IF;

  IF v_link_changed
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND v_auth_role <> 'service_role' THEN
    RAISE EXCEPTION 'member auth identity can only be linked by a trusted server workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_insert ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_insert
  BEFORE INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_update ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_update
  BEFORE UPDATE OF auth_user_id ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own profile" ON public.members;
CREATE POLICY "Members can view their own profile"
  ON public.members FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

-- A definer helper avoids recursive RLS evaluation between members and gyms.
-- It returns only the caller's own tenant ID and accepts no user-controlled ID.
CREATE OR REPLACE FUNCTION public.current_member_gym_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT gym_id
  FROM public.members
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_member_gym_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_gym_id() TO authenticated;

-- Needed for the member shell to read its own gym branding. This does not
-- expose gyms outside the linked member's tenant.
DROP POLICY IF EXISTS "Members can view their gym" ON public.gyms;
CREATE POLICY "Members can view their gym"
  ON public.gyms FOR SELECT
  TO authenticated
  USING (id = public.current_member_gym_id());

COMMENT ON COLUMN public.members.auth_user_id IS
  'Supabase Auth identity for Member PWA access. Set only by trusted owner/server workflows.';
COMMENT ON COLUMN public.members.member_code IS
  'Human-readable gym-scoped display code; never use for authorization.';

COMMIT;
