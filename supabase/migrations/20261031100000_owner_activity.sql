-- Owner activity log: app opens, page views and feature actions per gym owner.
-- Run in the Supabase SQL editor BEFORE deploying the app code (the app calls record_owner_activity).

-- ── owner_activity_events ────────────────────────────────────
-- What each gym owner did in the app: opened it, visited a page, performed an action. Written only by
-- record_owner_activity (SECURITY DEFINER); no policies, so no API role reads it. The super admin reads it
-- with the service role. Rows are deleted after 15 days by delete_old_owner_activity (daily automation).
CREATE TABLE IF NOT EXISTS owner_activity_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  owner_id   UUID        NOT NULL,
  kind       TEXT        NOT NULL CHECK (kind IN ('app_open', 'page_view', 'action')),
  path       TEXT        CHECK (char_length(path) <= 200),
  label      TEXT        CHECK (char_length(label) <= 80),
  platform   TEXT        CHECK (platform IN ('mobile', 'desktop')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- indexes on owner_activity_events
CREATE INDEX IF NOT EXISTS idx_owner_activity_gym_created
  ON owner_activity_events (gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_activity_created
  ON owner_activity_events (created_at);

ALTER TABLE owner_activity_events ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the definer function writes, only the service role reads.

-- ────────────────────────────────────────────────────────────
-- Owner activity (app opens, page views, feature actions)
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.record_owner_activity(TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.record_owner_activity(
  p_kind     TEXT,
  p_path     TEXT,
  p_label    TEXT,
  p_platform TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id UUID;
  v_path   TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_kind IS NULL OR p_kind NOT IN ('app_open', 'page_view', 'action') THEN
    RETURN;
  END IF;

  SELECT g.id INTO v_gym_id FROM public.gyms g WHERE g.owner_id = auth.uid() LIMIT 1;
  IF v_gym_id IS NULL THEN
    RETURN;
  END IF;

  -- Pathname only; ids and long numbers become ':id' so one row shape covers every record.
  v_path := NULLIF(left(
    regexp_replace(
      regexp_replace(split_part(split_part(COALESCE(p_path, ''), '?', 1), '#', 1),
        '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
      '[0-9]{4,}', ':id', 'g'),
    200), '');

  INSERT INTO public.owner_activity_events (gym_id, owner_id, kind, path, label, platform)
  VALUES (
    v_gym_id,
    auth.uid(),
    p_kind,
    v_path,
    NULLIF(left(COALESCE(p_label, ''), 80), ''),
    CASE WHEN p_platform IN ('mobile', 'desktop') THEN p_platform ELSE NULL END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.delete_old_owner_activity(INT);
CREATE FUNCTION public.delete_old_owner_activity(p_days INT DEFAULT 15)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.owner_activity_events
   WHERE created_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 15), 1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON public.owner_activity_events FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.record_owner_activity(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_owner_activity(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_old_owner_activity(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_owner_activity(INT) TO service_role;
