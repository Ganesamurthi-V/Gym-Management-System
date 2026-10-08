-- ============================================================
-- Security hardening, part 2
--   A. Members no longer read the whole gyms row (admin_notes, billing, ...)
--   B. gym_whatsapp_config becomes server-only (owners cannot repoint it)
--   C. Child rows must belong to the same gym as their parent
-- Idempotent. Run in the Supabase SQL editor AFTER deploying the app change
-- in lib/member/member-data.ts (see ordering note in A).
-- ============================================================

-- ── A. Member gym branding via a narrow RPC ──────────────────
-- The "Members can view their gym" policy is row-level, so any member could
-- `select *` from gyms through PostgREST and read admin_notes, last_payment_*,
-- is_vip, subscription columns, etc. Column lists in the app do not help: the
-- anon key is public. RLS cannot restrict columns, so members get a definer
-- function that returns only branding fields for their OWN gym and take no
-- direct access to the table.
--
-- ORDER: the function is created first so the new app code works the moment it
-- is deployed; the policy is dropped last. Deploy the app between the two if
-- you run the statements by hand, otherwise members see "no readable gym"
-- until the deploy lands.
--
-- `location` is aliased from city: the member app only needs one free-text
-- place label and `city` is the column onboarding keeps current.
CREATE OR REPLACE FUNCTION public.get_member_gym()
RETURNS TABLE (id UUID, name TEXT, location TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, g.name, g.city AS location, g.created_at
    FROM public.gyms g
   WHERE g.id = public.current_member_gym_id()
$$;
REVOKE ALL ON FUNCTION public.get_member_gym() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_gym() TO authenticated;

DROP POLICY IF EXISTS "Members can view their gym" ON public.gyms;

-- ── B. gym_whatsapp_config: server-only ──────────────────────
-- Only the webhook (service role) maps phone_number_id -> gym. The owner app
-- never reads or writes this table, yet owners could UPDATE phone_number_id /
-- business_account_id to point at another tenant's WhatsApp number and hijack
-- inbound routing. No owner policy is needed, so remove them.
DROP POLICY IF EXISTS gym_whatsapp_config_select_policy ON public.gym_whatsapp_config;
DROP POLICY IF EXISTS gym_whatsapp_config_update_policy ON public.gym_whatsapp_config;
DO $$
BEGIN
  IF to_regclass('public.gym_whatsapp_config') IS NOT NULL THEN
    REVOKE ALL ON public.gym_whatsapp_config FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── C. Same-tenant foreign keys ──────────────────────────────
-- Owner RLS only checks that the ROW's gym_id is the owner's. Nothing stopped
-- an owner inserting memberships/attendance/assignments whose member_id or
-- program_id belongs to ANOTHER gym (the row then appears in that member's own
-- view). A composite FK (child_id, gym_id) -> parent(id, gym_id) makes the
-- database reject it, for every caller including the service role.
--
-- NOT VALID: enforced for all new/updated rows immediately, without scanning
-- or failing on legacy rows. After checking the audit queries at the bottom,
-- run the VALIDATE statements to enforce history too.
-- Existing single-column FKs keep doing the ON DELETE CASCADE / SET NULL, so
-- these use the default NO ACTION and do not change delete behaviour.
DO $$
BEGIN
  IF to_regclass('public.members') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_members_id_gym ON public.members (id, gym_id);
  END IF;
  IF to_regclass('public.inventory') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_id_gym ON public.inventory (id, gym_id);
  END IF;
  IF to_regclass('public.workout_programs') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_programs_id_gym ON public.workout_programs (id, gym_id);
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('memberships',           'fk_memberships_member_same_gym',        'member_id',    'members',          'id'),
    ('attendance',            'fk_attendance_member_same_gym',         'member_id',    'members',          'id'),
    ('due_payments',          'fk_due_payments_member_same_gym',       'member_id',    'members',          'id'),
    ('member_portal_activity','fk_portal_activity_member_same_gym',    'member_id',    'members',          'id'),
    ('program_assignments',   'fk_assignments_member_same_gym',        'member_id',    'members',          'id'),
    ('program_assignments',   'fk_assignments_program_same_gym',       'program_id',   'workout_programs', 'id'),
    ('inventory_units',       'fk_inventory_units_item_same_gym',      'inventory_id', 'inventory',        'id'),
    ('inventory_sales',       'fk_inventory_sales_item_same_gym',      'inventory_id', 'inventory',        'id')
  ) AS t(child, conname, child_col, parent, parent_col)
  LOOP
    -- Skip tables this database does not have (not every migration is applied
    -- everywhere, e.g. inventory_units), and constraints that already exist.
    IF to_regclass(format('public.%I', r.child)) IS NULL
       OR to_regclass(format('public.%I', r.parent)) IS NULL THEN
      RAISE NOTICE 'skipping %: table missing', r.conname;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.conname
         AND conrelid = format('public.%I', r.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, gym_id) REFERENCES public.%I (%I, gym_id) NOT VALID',
        r.child, r.conname, r.child_col, r.parent, r.parent_col
      );
    END IF;
  END LOOP;
END $$;

-- ── Optional follow-up (run by hand, not part of the migration) ──────────────
-- 1. Audit legacy rows that cross tenants (expect 0 rows each):
--      SELECT c.id FROM memberships c JOIN members m ON m.id = c.member_id WHERE m.gym_id <> c.gym_id;
--      SELECT c.id FROM attendance c JOIN members m ON m.id = c.member_id WHERE m.gym_id <> c.gym_id;
--      SELECT c.id FROM program_assignments c JOIN workout_programs p ON p.id = c.program_id WHERE p.gym_id <> c.gym_id;
-- 2. Then enforce on history too, e.g.:
--      ALTER TABLE public.memberships VALIDATE CONSTRAINT fk_memberships_member_same_gym;
--    (repeat per constraint name above)

NOTIFY pgrst, 'reload schema';
