-- =============================================================
-- GymFlow — Remove the six-month (half-yearly) plan
--
-- Only Monthly and Yearly are sold now. This drops the half-yearly price column and
-- stops gyms.plan_type accepting 'half_yearly'.
--
-- There are no live customers yet, so any gym still on 'half_yearly' is test data and is
-- simply relabelled 'yearly' (its subscription_ends_at is left as it was).
--
-- Run AFTER the app deploy: the new code no longer reads price_half_yearly, but the old
-- pages still do, so dropping it first would break them. Safe to re-run.
--
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

UPDATE gyms SET plan_type = 'yearly' WHERE plan_type = 'half_yearly';

ALTER TABLE gyms DROP CONSTRAINT IF EXISTS gyms_plan_type_check;
ALTER TABLE gyms
  ADD CONSTRAINT gyms_plan_type_check
  CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'yearly', 'lifetime'));

ALTER TABLE platform_settings DROP COLUMN IF EXISTS price_half_yearly;

NOTIFY pgrst, 'reload schema';
