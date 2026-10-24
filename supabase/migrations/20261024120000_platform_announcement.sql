-- Site-wide announcement banner for the owner console.
-- Singleton row (id = 1), written only by the admin app (service role);
-- signed-in users may read it. `version` is bumped on every publish so a
-- dismissed banner reappears when the message changes.
CREATE TABLE IF NOT EXISTS public.platform_announcement (
  id          INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  message     TEXT        NOT NULL DEFAULT '',
  level       TEXT        NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'critical')),
  link_url    TEXT,
  link_label  TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT false,
  version     INT         NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_announcement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read platform announcement" ON public.platform_announcement;
CREATE POLICY "Authenticated can read platform announcement"
  ON public.platform_announcement FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

REVOKE ALL ON public.platform_announcement FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_announcement TO authenticated;
GRANT ALL ON public.platform_announcement TO service_role;

INSERT INTO public.platform_announcement (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
