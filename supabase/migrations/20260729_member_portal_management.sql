-- ================================================
-- MEMBER PORTAL MANAGEMENT
-- ================================================
-- Adds the columns and tables required by the Member App Management module
-- in the Owner Portal. This migration is additive and idempotent.
--
-- The `members` table already has `auth_user_id` (PWA migration). This adds
-- operational tracking columns the owner needs to manage portal access, plus
-- a dedicated activity log table and a per-gym settings table.

BEGIN;

-- ─── New columns on members ──────────────────────────────────────────────────

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS portal_enabled      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_suspended    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invitation_status   TEXT        NOT NULL DEFAULT 'not_sent'
    CHECK (invitation_status IN ('not_sent','pending','delivered','activated','expired')),
  ADD COLUMN IF NOT EXISTS invitation_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_portal_login   TIMESTAMPTZ;

-- Index for the portal management table query (gym-scoped, sorted by last activity)
CREATE INDEX IF NOT EXISTS idx_members_portal_status
  ON public.members(gym_id, portal_enabled, invitation_status);
CREATE INDEX IF NOT EXISTS idx_members_last_portal_login
  ON public.members(gym_id, last_portal_login DESC NULLS LAST)
  WHERE last_portal_login IS NOT NULL;

-- ─── member_portal_activity ──────────────────────────────────────────────────
-- Append-only event log for portal-related actions performed by either the
-- owner or the member. Rows are never updated or deleted.

CREATE TABLE IF NOT EXISTS member_portal_activity (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id   UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  activity    TEXT        NOT NULL CHECK (activity IN (
    'portal_activated', 'logged_in', 'password_reset',
    'membership_renewed', 'membership_expired',
    'invitation_resent', 'portal_disabled', 'portal_enabled'
  )),
  performed_by TEXT       NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_activity_gym
  ON member_portal_activity(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_activity_member
  ON member_portal_activity(member_id, created_at DESC);

ALTER TABLE member_portal_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view portal activity" ON member_portal_activity;
CREATE POLICY "Gym owners can view portal activity"
  ON member_portal_activity FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = member_portal_activity.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert portal activity" ON member_portal_activity;
CREATE POLICY "Gym owners can insert portal activity"
  ON member_portal_activity FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = member_portal_activity.gym_id AND owner_id = auth.uid()));

-- ─── member_app_settings ─────────────────────────────────────────────────────
-- One row per gym. Stores portal configuration managed from the Owner Portal's
-- Member App Settings tab.

CREATE TABLE IF NOT EXISTS member_app_settings (
  gym_id              UUID        PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  portal_name         TEXT        NOT NULL DEFAULT '',
  brand_logo_url      TEXT        NOT NULL DEFAULT '',
  primary_colour      TEXT        NOT NULL DEFAULT '#2563EB',
  support_email       TEXT        NOT NULL DEFAULT '',
  support_phone       TEXT        NOT NULL DEFAULT '',
  privacy_policy_url  TEXT        NOT NULL DEFAULT '',
  terms_url           TEXT        NOT NULL DEFAULT '',
  invitation_expiry   TEXT        NOT NULL DEFAULT '7d'
    CHECK (invitation_expiry IN ('24h','48h','7d','30d')),
  default_language    TEXT        NOT NULL DEFAULT 'en'
    CHECK (default_language IN ('en','ta','hi')),
  timezone            TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
  maintenance_mode    BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE member_app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view their app settings" ON member_app_settings;
CREATE POLICY "Gym owners can view their app settings"
  ON member_app_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = member_app_settings.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can upsert their app settings" ON member_app_settings;
CREATE POLICY "Gym owners can upsert their app settings"
  ON member_app_settings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = member_app_settings.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update their app settings" ON member_app_settings;
CREATE POLICY "Gym owners can update their app settings"
  ON member_app_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = member_app_settings.gym_id AND owner_id = auth.uid()));

-- ─── Backfill portal_enabled for existing linked members ─────────────────────
-- Members who already have an auth_user_id from the PWA should be considered
-- portal-enabled and activated.

UPDATE public.members
SET
  portal_enabled = true,
  invitation_status = 'activated',
  portal_activated_at = COALESCE(portal_activated_at, created_at)
WHERE auth_user_id IS NOT NULL
  AND portal_enabled = false;

COMMIT;
