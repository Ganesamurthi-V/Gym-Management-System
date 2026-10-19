-- =============================================================
-- GymFlow — Plan prices: monthly -> ₹999, yearly -> ₹9,999
--
-- Every app reads the live price from this row, so the UPDATE is what actually changes
-- what owners pay; the defaults only matter for a fresh row. Safe to re-run.
--
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

ALTER TABLE platform_settings ALTER COLUMN price_monthly SET DEFAULT 999;
ALTER TABLE platform_settings ALTER COLUMN price_yearly  SET DEFAULT 9999;

UPDATE platform_settings
SET price_monthly = 999,
    price_yearly  = 9999
WHERE id = 1;
