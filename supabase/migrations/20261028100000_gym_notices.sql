-- Gym notices: short messages an owner posts for members (holiday timings, a new
-- batch, a closure). Members read the active ones on the member app home.
-- Safe to run twice. Run in the Supabase SQL editor BEFORE deploying the app.

CREATE TABLE IF NOT EXISTS gym_notices (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id      UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL DEFAULT 'info'
                          CHECK (kind IN ('info', 'holiday', 'batch', 'closure', 'offer')),
  title       TEXT        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 80),
  body        TEXT        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 500),
  expires_on  DATE,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gym_notices_gym_active_created
  ON gym_notices(gym_id, is_active, created_at DESC);

-- At most 20 ACTIVE notices per gym, enforced on insert and on re-activation.
-- The advisory lock serialises concurrent writers of one gym so two requests
-- cannot both slip past the count.
CREATE OR REPLACE FUNCTION public.guard_gym_notices_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active) THEN
    PERFORM pg_advisory_xact_lock(hashtext('gym_notices:' || NEW.gym_id::text));
    IF (SELECT count(*) FROM gym_notices
         WHERE gym_id = NEW.gym_id AND is_active AND id <> NEW.id) >= 20 THEN
      RAISE EXCEPTION 'TOO_MANY_NOTICES' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_gym_notices_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gym_notices_updated_at ON gym_notices;
CREATE TRIGGER gym_notices_updated_at
  BEFORE UPDATE ON gym_notices
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

DROP TRIGGER IF EXISTS trg_guard_gym_notices_cap ON gym_notices;
CREATE TRIGGER trg_guard_gym_notices_cap
  BEFORE INSERT OR UPDATE ON gym_notices
  FOR EACH ROW EXECUTE FUNCTION public.guard_gym_notices_cap();

ALTER TABLE gym_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read own gym notices" ON gym_notices;
CREATE POLICY "Owner can read own gym notices"
  ON gym_notices FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_notices.gym_id AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Owner can insert own gym notices" ON gym_notices;
CREATE POLICY "Owner can insert own gym notices"
  ON gym_notices FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = gym_notices.gym_id AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Owner can update own gym notices" ON gym_notices;
CREATE POLICY "Owner can update own gym notices"
  ON gym_notices FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_notices.gym_id AND owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = gym_notices.gym_id AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Owner can delete own gym notices" ON gym_notices;
CREATE POLICY "Owner can delete own gym notices"
  ON gym_notices FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_notices.gym_id AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can view their gym notices" ON gym_notices;
CREATE POLICY "Members can view their gym notices"
  ON gym_notices FOR SELECT
  TO authenticated
  USING (
    gym_id = (SELECT public.current_member_gym_id())
    AND (SELECT public.member_app_allowed())
  );

REVOKE ALL ON public.gym_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gym_notices TO authenticated;
