-- Migration: mark members created via Excel/CSV import.
--
-- Imported members behave exactly like manually created members EXCEPT they
-- must never receive the `_gymflow_welcome_member` template (they are existing
-- gym members, not new registrations). This flag lets the UI suppress the
-- welcome template for them. Manually created members default to false.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN members.is_imported
  IS 'True for members created via Excel/CSV import. Suppresses the _gymflow_welcome_member template; all other automations behave identically.';
