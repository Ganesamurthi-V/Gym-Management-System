-- Meta 250 unique customers / rolling 24 h limit on the shared WhatsApp number.
-- MUST be applied before the code that calls it is deployed: the sender fails closed
-- (sends nothing) while reserve_whatsapp_recipient is missing.

-- Unique recipients messaged in the last 24 h on the one shared WhatsApp number.
-- Meta allows 250 unique customers per rolling 24 h; a customer counts once and leaves
-- the count 24 h after their FIRST message in the window. Service role only.
CREATE TABLE IF NOT EXISTS whatsapp_recipient_window (
  phone_e164    TEXT        PRIMARY KEY,
  first_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_recipient_window_first_sent ON whatsapp_recipient_window (first_sent_at);

ALTER TABLE whatsapp_recipient_window ENABLE ROW LEVEL SECURITY;

-- Reserve a slot for one recipient. One global advisory lock serialises every caller, so
-- two sends cannot both take the last slot. Re-messaging a phone already in the window is
-- free (Meta counts unique customers).
CREATE OR REPLACE FUNCTION public.reserve_whatsapp_recipient(p_phone text, p_limit int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count  int;
  v_oldest timestamptz;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wa_recipient_window'));

  DELETE FROM public.whatsapp_recipient_window
   WHERE first_sent_at < pg_catalog.now() - interval '24 hours';

  IF EXISTS (SELECT 1 FROM public.whatsapp_recipient_window WHERE phone_e164 = p_phone) THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true, 'is_new', false);
  END IF;

  SELECT pg_catalog.count(*), pg_catalog.min(first_sent_at)
    INTO v_count, v_oldest
    FROM public.whatsapp_recipient_window;

  IF v_count >= p_limit THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', false,
      'retry_at', pg_catalog.to_char((v_oldest + interval '24 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'in_window', v_count
    );
  END IF;

  INSERT INTO public.whatsapp_recipient_window (phone_e164) VALUES (p_phone);
  RETURN pg_catalog.jsonb_build_object('allowed', true, 'is_new', true);
END;
$$;

-- Give back a slot this attempt just created, when Meta definitely rejected the send.
CREATE OR REPLACE FUNCTION public.release_whatsapp_recipient(p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.whatsapp_recipient_window WHERE phone_e164 = p_phone;
END;
$$;

-- For monitoring and the invite-all estimate. Read only; expired rows are ignored, not deleted.
CREATE OR REPLACE FUNCTION public.whatsapp_recipient_window_usage()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object('in_window', pg_catalog.count(*), 'oldest', pg_catalog.min(first_sent_at))
    FROM public.whatsapp_recipient_window
   WHERE first_sent_at >= pg_catalog.now() - interval '24 hours';
$$;

REVOKE ALL ON public.whatsapp_recipient_window FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_recipient_window TO service_role;

REVOKE ALL ON FUNCTION public.reserve_whatsapp_recipient(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_whatsapp_recipient(text, int) TO service_role;
REVOKE ALL ON FUNCTION public.release_whatsapp_recipient(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_whatsapp_recipient(text) TO service_role;
REVOKE ALL ON FUNCTION public.whatsapp_recipient_window_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_recipient_window_usage() TO service_role;
