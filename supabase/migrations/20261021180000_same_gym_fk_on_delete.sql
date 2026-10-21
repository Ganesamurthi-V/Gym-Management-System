-- Same-tenant composite foreign keys must repeat the ON DELETE action of their single-column twin.
--
-- They were created with the default NO ACTION. Deleting a member that has memberships (the
-- "Delete All Member Data" button, or a member delete) then failed with
--   update or delete on table "members" violates foreign key constraint
--   "fk_memberships_member_same_gym" on table "memberships"  (23503)
-- because Postgres can run the composite key's check before the single-column ON DELETE
-- CASCADE has removed the child rows. The same applied to deleting a workout program, a gym
-- event or an inventory item that had children.
--
-- Drops and re-adds each key in one transaction. Idempotent: safe to run twice. Re-adding
-- re-validates existing rows, which is quick at this size. inventory_sales is SET NULL on
-- inventory_id only (gym_id is NOT NULL); the column list needs PostgreSQL 15+.
--
-- No code change is needed with this migration, but run it for "Delete All Member Data" to work.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('memberships',            'fk_memberships_member_same_gym',     'member_id',    'members', 'CASCADE'),
    ('attendance',             'fk_attendance_member_same_gym',      'member_id',    'members', 'CASCADE'),
    ('due_payments',           'fk_due_payments_member_same_gym',    'member_id',    'members', 'CASCADE'),
    ('member_portal_activity', 'fk_portal_activity_member_same_gym', 'member_id',    'members', 'CASCADE'),
    ('member_achievements',    'fk_member_achievements_member_same_gym', 'member_id', 'members', 'CASCADE'),
    ('gamification_awards',    'fk_gamification_awards_member_same_gym', 'member_id', 'members', 'CASCADE'),
    ('gym_event_completions',  'fk_gym_event_completions_member_same_gym', 'member_id', 'members', 'CASCADE'),
    ('gym_event_completions',  'fk_gym_event_completions_event_same_gym',  'event_id',  'gym_events', 'CASCADE'),
    ('program_assignments',    'fk_assignments_member_same_gym',     'member_id',    'members', 'CASCADE'),
    ('program_assignments',    'fk_assignments_program_same_gym',    'program_id',   'workout_programs', 'CASCADE'),
    ('inventory_units',        'fk_inventory_units_item_same_gym',   'inventory_id', 'inventory', 'CASCADE'),
    ('inventory_sales',        'fk_inventory_sales_item_same_gym',   'inventory_id', 'inventory', 'SET NULL (inventory_id)')
  ) AS t(child, conname, child_col, parent, on_delete)
  LOOP
    IF to_regclass(format('public.%I', r.child)) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.child, r.conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, gym_id) REFERENCES public.%I (id, gym_id) ON DELETE %s',
      r.child, r.conname, r.child_col, r.parent, r.on_delete
    );
  END LOOP;
END $$;
