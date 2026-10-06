-- ================================================================
-- Support inbox: AI-drafted replies
-- ================================================================
--
-- gymflow-admin writes a suggested reply for each new inbound email and stores it on the
-- thread. The admin reviews it in the mobile app and sends it (or edits, or dismisses it);
-- nothing is ever sent by the AI itself.
--
-- The draft lives on the thread row, one per thread, because only the latest question
-- matters: a newer inbound message replaces it, and sending a reply clears it.
--
--   ai_draft_status
--     none     no draft (default; also after a reply is sent or the draft is dismissed)
--     ready    a draft is waiting for review
--     queued   every model was out of rate-limit budget; generated the next time the
--              thread is opened or Regenerate is tapped (no cron, no retry loop)
--     failed   the model call failed for a reason that is not a limit
--     skipped  not drafted on purpose: the day's draft cap was reached
--
-- Same access model as the rest of the inbox: service role only (RLS on, no policies).
-- Idempotent: safe to re-run. Run in Supabase Dashboard -> SQL Editor.

BEGIN;

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS ai_draft            TEXT,
  -- The inbound message this draft answers. The app only offers the draft while this is
  -- still the newest inbound message, so a stale draft is never shown for a newer question.
  ADD COLUMN IF NOT EXISTS ai_draft_message_id UUID REFERENCES public.email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_draft_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_draft_status     TEXT NOT NULL DEFAULT 'none',
  -- True when the model judged the message to need a person (refund, account access,
  -- anger, legal tone, or a question outside what it knows). The draft is then only a
  -- short holding reply and the app says so.
  ADD COLUMN IF NOT EXISTS ai_needs_human      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_draft_model      TEXT;

ALTER TABLE public.email_threads DROP CONSTRAINT IF EXISTS email_threads_ai_draft_status_check;
ALTER TABLE public.email_threads
  ADD CONSTRAINT email_threads_ai_draft_status_check
  CHECK (ai_draft_status IN ('none', 'ready', 'queued', 'failed', 'skipped'));

-- Sending a reply answers whatever the draft was for, so the draft goes with it. Done in
-- the database, beside the other thread bookkeeping, so it holds however the reply was
-- stored and cannot be forgotten by a code path.
CREATE OR REPLACE FUNCTION public.email_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.email_threads
     SET last_message_at = NEW.created_at,
         last_direction  = NEW.direction,
         snippet         = left(regexp_replace(COALESCE(NEW.body_text, ''), '\s+', ' ', 'g'), 140),
         unread_count    = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE 0 END,
         status          = CASE WHEN NEW.direction = 'inbound' THEN 'open' ELSE status END,
         ai_draft        = CASE WHEN NEW.direction = 'outbound' THEN NULL ELSE ai_draft END,
         ai_draft_status = CASE WHEN NEW.direction = 'outbound' THEN 'none' ELSE ai_draft_status END,
         ai_needs_human  = CASE WHEN NEW.direction = 'outbound' THEN false ELSE ai_needs_human END
   WHERE id = NEW.thread_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.email_thread_on_message() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
