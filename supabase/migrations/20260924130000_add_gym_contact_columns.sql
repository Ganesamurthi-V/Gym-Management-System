-- The owner onboarding flow has always collected city and phone, but older deployed
-- databases only retained those values inside gyms.onboarding_data. The current app also
-- mirrors them into first-class columns so admin and reporting queries do not need to know
-- the onboarding JSON shape.
--
-- IF NOT EXISTS keeps this safe for environments created from supabase-schema.sql, where
-- both columns already exist. NOTIFY makes PostgREST refresh immediately after a manual
-- migration instead of continuing to return PGRST204 schema-cache errors until its next
-- reload.
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Backfill gyms created before these columns were mirrored. NULLIF avoids turning an empty
-- onboarding field into an apparently populated first-class value, and COALESCE preserves
-- any value that was already written directly to the column.
UPDATE public.gyms
SET city = COALESCE(city, NULLIF(BTRIM(onboarding_data ->> 'city'), '')),
    phone = COALESCE(phone, NULLIF(BTRIM(onboarding_data ->> 'phone'), ''))
WHERE (city IS NULL AND NULLIF(BTRIM(onboarding_data ->> 'city'), '') IS NOT NULL)
   OR (phone IS NULL AND NULLIF(BTRIM(onboarding_data ->> 'phone'), '') IS NOT NULL);

COMMENT ON COLUMN public.gyms.city IS
  'Gym locality collected during onboarding; mirrored in onboarding_data.city for backward compatibility.';

COMMENT ON COLUMN public.gyms.phone IS
  'Gym contact number collected during onboarding; mirrored in onboarding_data.phone for backward compatibility.';

NOTIFY pgrst, 'reload schema';
