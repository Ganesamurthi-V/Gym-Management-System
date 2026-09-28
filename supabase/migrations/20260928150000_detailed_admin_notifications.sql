-- ================================================================
-- Detailed admin notification copy
-- ================================================================
--
-- The first cut of these notifications (20260925160000_admin_notifications.sql)
-- produced very terse push text — e.g. title "New support ticket" with body
-- "Ganesh: Test". On a lock screen that reads as noise: it does not say what
-- kind of ticket, what it is about, or enough of the message to triage without
-- opening the app.
--
-- This migration CREATE OR REPLACEs the four trigger functions so each writes a
-- longer, self-explanatory title + body. The `notifications` table, its columns
-- (type / gym_id / title / body / entity_id), the triggers, and the pg_net push
-- dispatch are all unchanged — only the generated copy is richer. entity_id and
-- type still carry the deep-link target the mobile app routes on.
--
-- Design notes:
--   • A short helper trims long free text to a snippet so a paragraph-long
--     ticket message does not blow up the notification body.
--   • Every function keeps the "never roll back the business txn" EXCEPTION
--     guard from the original: failing to log a notification must never abort
--     the ticket / payment / gym insert that triggered it.
--   • SECURITY DEFINER + empty search_path are preserved, so every reference is
--     schema-qualified (public.*).

BEGIN;

-- ── Snippet helper ───────────────────────────────────────────
-- Collapse whitespace and cap free text at `max_len`, appending an ellipsis when
-- it was truncated. Returns '' for NULL/blank so callers can COALESCE cleanly.
CREATE OR REPLACE FUNCTION public.notification_snippet(raw TEXT, max_len INT DEFAULT 140)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF raw IS NULL THEN
    RETURN '';
  END IF;
  -- Fold all runs of whitespace (newlines/tabs/spaces) into single spaces.
  cleaned := btrim(regexp_replace(raw, '\s+', ' ', 'g'));
  IF cleaned = '' THEN
    RETURN '';
  END IF;
  IF char_length(cleaned) > max_len THEN
    RETURN left(cleaned, max_len) || '…';
  END IF;
  RETURN cleaned;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_snippet(TEXT, INT) FROM PUBLIC, anon, authenticated;

-- ── Support tickets AND feedback ─────────────────────────────
-- Both land in support_tickets; the type column discriminates. Feedback rows
-- carry a 1-5 rating and use `subject` for the comment.
CREATE OR REPLACE FUNCTION public.notify_on_support_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
  v_gym      TEXT;
  v_subject  TEXT;
  v_message  TEXT;
  v_kind     TEXT;
  v_title    TEXT;
  v_body     TEXT;
BEGIN
  BEGIN
    SELECT name INTO v_gym_name FROM public.gyms WHERE id = NEW.gym_id;
    v_gym     := COALESCE(NULLIF(btrim(v_gym_name), ''), 'A gym');
    v_subject := public.notification_snippet(NEW.subject, 80);
    v_message := public.notification_snippet(NEW.message, 160);

    IF NEW.type = 'feedback' THEN
      -- e.g. "★★★★☆ feedback from Fit Zone Gym"
      v_title := CASE
                   WHEN NEW.rating IS NOT NULL
                     THEN repeat('★', GREATEST(0, LEAST(5, NEW.rating)))
                          || repeat('☆', 5 - GREATEST(0, LEAST(5, NEW.rating)))
                          || ' feedback from ' || v_gym
                   ELSE 'New feedback from ' || v_gym
                 END;
      v_body := COALESCE(NULLIF(v_message, ''), NULLIF(v_subject, ''),
                         'They left a rating with no comment.');

      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES ('feedback', NEW.gym_id, v_title, v_body, NEW.id::text);
    ELSE
      -- Human label for the ticket kind so the title is specific.
      v_kind := CASE NEW.type
                  WHEN 'bug'           THEN 'bug report'
                  WHEN 'issue'         THEN 'issue'
                  WHEN 'high_priority' THEN 'HIGH-PRIORITY ticket'
                  WHEN 'query'         THEN 'support query'
                  ELSE 'support ticket'
                END;

      -- e.g. "New bug report from Fit Zone Gym"
      v_title := 'New ' || v_kind || ' from ' || v_gym;
      -- Subject headline, then the message body so it can be triaged from the
      -- lock screen without opening the app.
      v_body := COALESCE(NULLIF(v_subject, ''), 'No subject')
                || CASE WHEN v_message <> '' THEN ' — ' || v_message ELSE '' END;

      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES ('ticket', NEW.gym_id, v_title, v_body, NEW.id::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_support_ticket failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ── Subscription (payment proof) requests ────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_subscription_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
  v_gym      TEXT;
  v_plan     TEXT;
  v_txn      TEXT;
  v_notes    TEXT;
  v_body     TEXT;
BEGIN
  BEGIN
    IF NEW.status = 'pending' THEN
      SELECT name, plan_type INTO v_gym_name, v_plan FROM public.gyms WHERE id = NEW.gym_id;
      v_gym   := COALESCE(NULLIF(btrim(v_gym_name), ''), 'A gym');
      v_txn   := public.notification_snippet(NEW.transaction_id, 40);
      v_notes := public.notification_snippet(NEW.notes, 120);

      -- e.g. "Fit Zone Gym submitted a payment proof for review. Current plan:
      --       trial. Txn: ABC123. Note: paid via GPay"
      v_body := v_gym || ' submitted a payment proof and is waiting for approval.'
                || CASE WHEN COALESCE(v_plan, '') <> '' THEN ' Current plan: ' || v_plan || '.' ELSE '' END
                || CASE WHEN v_txn   <> '' THEN ' Txn: '  || v_txn   || '.' ELSE '' END
                || CASE WHEN v_notes <> '' THEN ' Note: ' || v_notes        ELSE '' END;

      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'payment_request',
        NEW.gym_id,
        'Payment proof awaiting review — ' || v_gym,
        v_body,
        NEW.id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_subscription_request failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ── New gym signup ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_new_gym()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym   TEXT;
  v_city  TEXT;
  v_body  TEXT;
BEGIN
  BEGIN
    v_gym  := COALESCE(NULLIF(btrim(NEW.name), ''), 'A new gym');
    v_city := public.notification_snippet(NEW.city, 60);

    -- e.g. "Fit Zone Gym just created an account (Chennai) and started a free
    --       trial. Tap to review the gym and its subscription."
    v_body := v_gym || ' just created an account'
              || CASE WHEN v_city <> '' THEN ' in ' || v_city ELSE '' END
              || CASE WHEN COALESCE(NEW.plan_type, '') = 'trial' THEN ' and started a free trial.' ELSE '.' END
              || ' Tap to review the gym and its subscription.';

    INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
    VALUES (
      'new_gym',
      NEW.id,
      'New gym signup — ' || v_gym,
      v_body,
      NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_new_gym failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- Definer functions, called only by triggers: keep off the public execute grant.
REVOKE ALL ON FUNCTION public.notify_on_support_ticket()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_subscription_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_new_gym()              FROM PUBLIC, anon, authenticated;

-- Triggers already point at these function names (from 20260925160000); replacing
-- the function bodies is enough. Re-assert them so this migration is self-contained
-- and safe on a database where the originals somehow never attached.
DROP TRIGGER IF EXISTS trg_notify_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_notify_support_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_support_ticket();

DROP TRIGGER IF EXISTS trg_notify_subscription_request ON public.subscription_requests;
CREATE TRIGGER trg_notify_subscription_request
  AFTER INSERT ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_subscription_request();

DROP TRIGGER IF EXISTS trg_notify_new_gym ON public.gyms;
CREATE TRIGGER trg_notify_new_gym
  AFTER INSERT ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_gym();

COMMIT;
