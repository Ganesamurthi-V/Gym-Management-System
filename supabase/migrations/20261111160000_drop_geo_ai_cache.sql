-- Drop the leftover geo_ai_cache table.
--
-- It backed the AI locality-inference pipeline that was removed in commit f629d3b
-- ("geo pipeline removed"); the table stayed behind in the live database and was
-- never in supabase-schema.sql. Checked 2026-11-11: 0 rows, no inserts, updates or
-- deletes since stats began (2026-10-02), no code in this repo reads or writes it
-- (scripts/test-ai-raw.ts only calls the Groq API), and no view, function,
-- trigger, publication or foreign key depends on it. Its two policies and indexes
-- go with it. It also still granted anon full table privileges.
--
-- Idempotent.

DROP TABLE IF EXISTS public.geo_ai_cache;
