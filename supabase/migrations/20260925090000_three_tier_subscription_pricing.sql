-- =============================================================
-- GymFlow — Three-tier SaaS subscription pricing
--
-- Grows the owner-facing subscription from two tiers (monthly, yearly) to
-- three (monthly, half-yearly, yearly) and reprices all of them:
--   1 month   ₹1,999
--   6 months  ₹6,999
--   1 year    ₹12,999
--
-- A NEW migration rather than an edit to update_prices_and_qr.sql, because that
-- one has already run on live databases; re-editing applied history would not
-- re-run. This is written to be safe to run on a fresh schema or an existing
-- 2999/29999 install alike.
--
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

-- 1. Add the six-month column. IF NOT EXISTS so re-running is a no-op; the
--    DEFAULT seeds the correct price for the existing single settings row.
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS price_half_yearly INT NOT NULL DEFAULT 6999;

-- 2. Reprice all three tiers on the singleton row. Set explicitly rather than
--    relying on the column defaults, since the row already exists with the old
--    2999 / 29999 values and defaults only apply to new rows.
UPDATE platform_settings
SET price_monthly     = 1999,
    price_half_yearly = 6999,
    price_yearly      = 12999
WHERE id = 1;

-- 3. Keep PostgREST's schema cache in step so the new column is queryable
--    without a manual reload.
NOTIFY pgrst, 'reload schema';

-- 4. Allow 'half_yearly' as a plan_type on gyms. The activation routes write this
--    value when an owner buys the six-month tier; without it the CHECK constraint
--    would reject the update. 'quarterly' is left in place (it predates this) so
--    the constraint only grows and never invalidates existing rows.
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_plan_type_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_plan_type_check
  CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'lifetime'));
