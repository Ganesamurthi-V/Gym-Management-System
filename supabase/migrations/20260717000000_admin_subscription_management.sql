-- ============================================================
-- GymFlow Admin Subscription Management Migration
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Add admin-facing columns to gyms ─────────────────────

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS admin_notes              TEXT,
  ADD COLUMN IF NOT EXISTS subscription_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_vip                   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_payment_verified       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority_support          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_renewal_eligible     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifetime_offer            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_disabled            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_payment_amount       INTEGER,
  ADD COLUMN IF NOT EXISTS last_payment_method       TEXT,
  ADD COLUMN IF NOT EXISTS last_transaction_id       TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_status       TEXT DEFAULT 'none'
                                                     CHECK (last_payment_status IN ('none', 'paid', 'pending', 'failed'));

-- ── 2. subscription_audit_logs table ────────────────────────

CREATE TABLE IF NOT EXISTS subscription_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  prev_status     TEXT,
  new_status      TEXT,
  prev_plan       TEXT,
  new_plan        TEXT,
  prev_expiry     TIMESTAMPTZ,
  new_expiry      TIMESTAMPTZ,
  action          TEXT NOT NULL,
  performed_by    TEXT NOT NULL DEFAULT 'admin',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_gym_id    ON subscription_audit_logs(gym_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created   ON subscription_audit_logs(gym_id, created_at DESC);

ALTER TABLE subscription_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin (service role) can do everything; regular users cannot read audit logs
-- These are read via the service role from the admin API, so no RLS needed for authenticated users.

-- ── 3. gym_usage_stats table ────────────────────────────────
-- Tracks cumulative usage metrics for each gym for admin monitoring.

CREATE TABLE IF NOT EXISTS gym_usage_stats (
  gym_id                UUID PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  total_members         INTEGER NOT NULL DEFAULT 0,
  total_attendance      INTEGER NOT NULL DEFAULT 0,
  total_payments        INTEGER NOT NULL DEFAULT 0,
  total_revenue         BIGINT  NOT NULL DEFAULT 0,
  whatsapp_sent         INTEGER NOT NULL DEFAULT 0,
  reports_generated     INTEGER NOT NULL DEFAULT 0,
  storage_used_kb       BIGINT  NOT NULL DEFAULT 0,
  last_active_at        TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gym_usage_stats ENABLE ROW LEVEL SECURITY;

-- Only gym owners can read their own stats (service role used for writes from admin)
CREATE POLICY "Gym owners can view own usage stats"
  ON gym_usage_stats FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── 4. Backfill gym_usage_stats for existing gyms ───────────

INSERT INTO gym_usage_stats (gym_id, total_members, total_attendance, total_payments, total_revenue, updated_at)
SELECT
  g.id,
  COUNT(DISTINCT m.id)::INTEGER,
  COUNT(DISTINCT a.id)::INTEGER,
  COUNT(DISTINCT ms.id)::INTEGER,
  COALESCE(SUM(ms.amount + ms.admission_fee), 0)::BIGINT,
  now()
FROM gyms g
LEFT JOIN members m ON m.gym_id = g.id
LEFT JOIN attendance a ON a.gym_id = g.id
LEFT JOIN memberships ms ON ms.gym_id = g.id
GROUP BY g.id
ON CONFLICT (gym_id) DO NOTHING;

-- ── 5. Function to increment usage stats ────────────────────

CREATE OR REPLACE FUNCTION increment_gym_usage_stat(
  p_gym_id   UUID,
  p_field    TEXT,
  p_amount   INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  -- Only allow known fields to prevent SQL injection
  IF p_field NOT IN (
    'total_members', 'total_attendance', 'total_payments',
    'total_revenue', 'whatsapp_sent', 'reports_generated', 'storage_used_kb'
  ) THEN
    RAISE EXCEPTION 'Unknown field: %', p_field;
  END IF;

  INSERT INTO gym_usage_stats (gym_id, updated_at)
  VALUES (p_gym_id, now())
  ON CONFLICT (gym_id) DO NOTHING;

  EXECUTE format(
    'UPDATE gym_usage_stats SET %I = %I + $1, last_active_at = now(), updated_at = now() WHERE gym_id = $2',
    p_field, p_field
  ) USING p_amount, p_gym_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 6. Trigger to auto-update usage stats on membership insert ──

CREATE OR REPLACE FUNCTION sync_usage_on_membership_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO gym_usage_stats (gym_id, total_payments, total_revenue, updated_at)
  VALUES (NEW.gym_id, 1, NEW.amount + NEW.admission_fee, now())
  ON CONFLICT (gym_id) DO UPDATE
  SET
    total_payments = gym_usage_stats.total_payments + 1,
    total_revenue  = gym_usage_stats.total_revenue + EXCLUDED.total_revenue,
    last_active_at = now(),
    updated_at     = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_usage_on_membership ON memberships;
CREATE TRIGGER trg_usage_on_membership
AFTER INSERT ON memberships
FOR EACH ROW EXECUTE FUNCTION sync_usage_on_membership_insert();

-- ── 7. Trigger to auto-update member count ──────────────────

CREATE OR REPLACE FUNCTION sync_usage_on_member_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO gym_usage_stats (gym_id, total_members, updated_at)
  VALUES (NEW.gym_id, 1, now())
  ON CONFLICT (gym_id) DO UPDATE
  SET
    total_members  = gym_usage_stats.total_members + 1,
    last_active_at = now(),
    updated_at     = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_usage_on_member ON members;
CREATE TRIGGER trg_usage_on_member
AFTER INSERT ON members
FOR EACH ROW EXECUTE FUNCTION sync_usage_on_member_insert();

-- ── 8. Trigger to auto-update attendance count ──────────────

CREATE OR REPLACE FUNCTION sync_usage_on_attendance_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO gym_usage_stats (gym_id, total_attendance, updated_at)
  VALUES (NEW.gym_id, 1, now())
  ON CONFLICT (gym_id) DO UPDATE
  SET
    total_attendance = gym_usage_stats.total_attendance + 1,
    last_active_at   = now(),
    updated_at       = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_usage_on_attendance ON attendance;
CREATE TRIGGER trg_usage_on_attendance
AFTER INSERT ON attendance
FOR EACH ROW EXECUTE FUNCTION sync_usage_on_attendance_insert();

-- ── 9. Trigger to auto-increment whatsapp count ─────────────
-- This should be called from whatsapp_send_queue after a successful send.
-- We add it as a function to call via RPC from the API server.

CREATE OR REPLACE FUNCTION record_whatsapp_sent(p_gym_id UUID, p_count INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
  INSERT INTO gym_usage_stats (gym_id, whatsapp_sent, updated_at)
  VALUES (p_gym_id, p_count, now())
  ON CONFLICT (gym_id) DO UPDATE
  SET
    whatsapp_sent  = gym_usage_stats.whatsapp_sent + p_count,
    last_active_at = now(),
    updated_at     = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 10. Admin subscription action helper function ────────────
-- Creates an audit log entry. Called from admin API (service role).

CREATE OR REPLACE FUNCTION log_subscription_action(
  p_gym_id       UUID,
  p_action       TEXT,
  p_prev_status  TEXT DEFAULT NULL,
  p_new_status   TEXT DEFAULT NULL,
  p_prev_plan    TEXT DEFAULT NULL,
  p_new_plan     TEXT DEFAULT NULL,
  p_prev_expiry  TIMESTAMPTZ DEFAULT NULL,
  p_new_expiry   TIMESTAMPTZ DEFAULT NULL,
  p_performed_by TEXT DEFAULT 'admin',
  p_notes        TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO subscription_audit_logs (
    gym_id, action, prev_status, new_status,
    prev_plan, new_plan, prev_expiry, new_expiry,
    performed_by, notes
  )
  VALUES (
    p_gym_id, p_action, p_prev_status, p_new_status,
    p_prev_plan, p_new_plan, p_prev_expiry, p_new_expiry,
    p_performed_by, p_notes
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
