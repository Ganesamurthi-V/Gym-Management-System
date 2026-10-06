-- ================================================================
-- Support inbox: email received at support@gymflow.sbs, answered from the admin app
-- ================================================================
--
-- Resend receives mail for the domain and POSTs an `email.received` webhook to
-- gymflow-admin (/api/email/inbound), which fetches the full message and stores it
-- here. The admin mobile app reads and replies through the service-role admin API.
--
-- Same access model as support_tickets and notifications: RLS on with no policies,
-- so anon and authenticated owners are denied outright and only the service role
-- (the admin API) can read or write. There is nothing owner-facing in this feature.
--
-- Three moving parts besides the tables:
--   1. a bookkeeping trigger that keeps each thread's last-message time, preview and
--      unread count correct as messages arrive, so the API never has to recount;
--   2. a notification trigger that turns an inbound human message into a
--      `notifications` row, which the existing pg_net push dispatch (see
--      20260925180000_fix_push_dispatch_pg_net.sql) sends to the admin devices;
--   3. payload-free realtime hints on 'admin:email', identical to the other admin:*
--      hints (20260722130000_secure_realtime_activities.sql). Not added to the
--      supabase_realtime publication: no client consumes postgres_changes for these
--      tables, so publishing them would only add WAL overhead.
--
-- Idempotent: safe to re-run. Run in Supabase Dashboard -> SQL Editor.

BEGIN;

-- ── email_threads ────────────────────────────────────────────
-- One row per conversation with one outside address. `subject` is stored with any
-- Re:/Fwd: prefixes stripped, so a reply that starts a new chain still matches.
CREATE TABLE IF NOT EXISTS public.email_threads (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject            TEXT        NOT NULL DEFAULT '(no subject)',
  counterparty_email TEXT        NOT NULL,
  counterparty_name  TEXT,
  -- Filled when the sender's address belongs to a gym owner, so the app can jump
  -- to that gym. Nullable: most website enquiries come from people who are not
  -- customers yet.
  gym_id             UUID        REFERENCES public.gyms(id) ON DELETE SET NULL,
  status             TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  snippet            TEXT,
  last_message_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_direction     TEXT        CHECK (last_direction IN ('inbound', 'outbound')),
  unread_count       INTEGER     NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_threads_list
  ON public.email_threads (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_counterparty
  ON public.email_threads (counterparty_email, last_message_at DESC);

-- ── email_messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        UUID        NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  direction        TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  -- Resend's id for the message. UNIQUE is the idempotency guard: Resend retries
  -- a webhook until it gets a 2xx, and a retry must not store the mail twice.
  resend_email_id  TEXT        UNIQUE,
  -- RFC 5322 identifiers, used to chain replies into the right thread and to build
  -- In-Reply-To / References on our own replies. Stored with their angle brackets.
  message_id       TEXT,
  in_reply_to      TEXT,
  references_ids   TEXT[]      NOT NULL DEFAULT '{}',
  from_email       TEXT        NOT NULL,
  from_name        TEXT,
  to_emails        TEXT[]      NOT NULL DEFAULT '{}',
  subject          TEXT        NOT NULL DEFAULT '(no subject)',
  body_text        TEXT,
  -- Kept for completeness but never rendered by the app: untrusted HTML from the
  -- internet stays out of the admin UI. Plain text is what is shown.
  body_html        TEXT,
  -- { spf, dkim, dmarc } results as Resend reports them; the app warns on a fail.
  auth_result      JSONB,
  -- Metadata only ({ id, filename, content_type, size }). Bytes are never stored;
  -- Resend's download URL lasts an hour, so a fresh one is asked for on each open.
  attachments      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Auto-replies, bounces and bulk mail: stored, but they do not raise a push.
  is_auto          BOOLEAN     NOT NULL DEFAULT false,
  -- Inbound rows are 'received'. Outbound rows move sending -> sent | failed.
  status           TEXT        NOT NULL DEFAULT 'received'
                               CHECK (status IN ('received', 'sending', 'sent', 'failed')),
  error            TEXT,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_thread
  ON public.email_messages (thread_id, created_at);
-- Reply matching looks messages up by the id in a reply's In-Reply-To/References.
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id
  ON public.email_messages (message_id) WHERE message_id IS NOT NULL;

ALTER TABLE public.email_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
-- No policies: RLS on with zero policies denies anon/authenticated entirely. The
-- service-role admin API bypasses RLS and is the only reader and writer.
REVOKE ALL ON public.email_threads, public.email_messages FROM PUBLIC, anon, authenticated;

-- ── Sender -> gym lookup ─────────────────────────────────────
-- Owner emails live in auth.users, not on gyms. A single indexed join answers "does this
-- sender own a gym", where listing every auth user from the API would not scale. SECURITY
-- DEFINER because it reads auth.users, so it is closed to everyone but the service role.
CREATE OR REPLACE FUNCTION public.gym_id_for_owner_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id
    FROM auth.users u
    JOIN public.gyms g ON g.owner_id = u.id
   WHERE lower(u.email) = lower(p_email)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.gym_id_for_owner_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gym_id_for_owner_email(TEXT) TO service_role;

-- ── Thread bookkeeping ───────────────────────────────────────
-- Runs on every new message. The thread row is the list the app shows, so keeping
-- it correct here (in the same transaction as the insert) means the list endpoint is
-- a plain SELECT and the unread badge can never drift from the messages.
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
         -- Our own reply means the admin has seen everything: clear the unread count.
         unread_count    = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE 0 END,
         -- Fresh mail pulls an archived thread back into the open list.
         status          = CASE WHEN NEW.direction = 'inbound' THEN 'open' ELSE status END
   WHERE id = NEW.thread_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.email_thread_on_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_thread_on_message ON public.email_messages;
CREATE TRIGGER trg_email_thread_on_message
  AFTER INSERT ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.email_thread_on_message();

-- ── Push notification for inbound mail ───────────────────────
-- Widen notifications.type to allow 'email'. The constraint is the one Postgres named
-- when 20260925160000 created the table, so dropping it by name is deterministic.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('ticket', 'feedback', 'payment_request', 'new_gym', 'email'));

CREATE OR REPLACE FUNCTION public.notify_on_inbound_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    -- Our own replies and auto-generated mail are not worth waking a phone for.
    IF NEW.direction = 'inbound' AND NOT NEW.is_auto THEN
      INSERT INTO public.notifications (type, title, body, entity_id)
      VALUES (
        'email',
        COALESCE(NULLIF(NEW.from_name, ''), NEW.from_email),
        NEW.subject,
        NEW.thread_id::text   -- the app opens the thread, not the single message
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Same guard as the other notify_* functions: a notification failure must never
    -- roll back storing the email itself.
    RAISE WARNING 'notify_on_inbound_email failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_on_inbound_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_inbound_email ON public.email_messages;
CREATE TRIGGER trg_notify_inbound_email
  AFTER INSERT ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_inbound_email();

-- ── Realtime invalidation hints ──────────────────────────────
DROP TRIGGER IF EXISTS trg_realtime_admin_email_threads ON public.email_threads;
CREATE TRIGGER trg_realtime_admin_email_threads
  AFTER INSERT OR UPDATE OR DELETE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:email');

DROP TRIGGER IF EXISTS trg_realtime_admin_email_messages ON public.email_messages;
CREATE TRIGGER trg_realtime_admin_email_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:email');

-- Keep PostgREST's schema cache in step so the new tables are queryable at once.
NOTIFY pgrst, 'reload schema';

COMMIT;
