-- Text shown after the announcement link. Additive and idempotent.
ALTER TABLE public.platform_announcement
  ADD COLUMN IF NOT EXISTS message_after TEXT NOT NULL DEFAULT '';
