-- =============================================================
-- GymFlow — Monthly subscription price ₹1,999 -> ₹1,699
--
-- Half-yearly (₹6,999) and yearly (₹12,999) are unchanged. Every app reads the
-- live price from this row, so the UPDATE is what actually changes what owners pay;
-- the default only matters for a fresh row. Safe to re-run.
--
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

ALTER TABLE platform_settings ALTER COLUMN price_monthly SET DEFAULT 1699;

UPDATE platform_settings
SET price_monthly = 1699
WHERE id = 1;
