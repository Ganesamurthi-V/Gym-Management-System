-- =============================================================
-- GymFlow — Update Subscription Prices & Remove QR Code URL
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================

-- 1. Update the existing prices
UPDATE platform_settings
SET price_monthly = 2999,
    price_yearly  = 29999
WHERE id = 1;

-- 2. Drop the qr_code_url column as we are hardcoding the images in the UI
ALTER TABLE platform_settings
DROP COLUMN IF EXISTS qr_code_url;
