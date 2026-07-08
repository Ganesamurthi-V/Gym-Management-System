-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp Automation Logs
--
-- Tracks every automated WhatsApp template message sent by the system.
-- Used to:
--   1. Prevent duplicate sends (idempotency at DB level)
--   2. Enforce schedule logic (e.g. "only send every 3 days")
--   3. Stop reminders after renewal/payment
--   4. Audit trail for all automated sends
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_automation_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  phone_number    TEXT        NOT NULL,
  template_name   TEXT        NOT NULL,
  -- Cycle tracking — groups reminder messages for the same trigger event
  -- Format: "<template>:<member_id>:<trigger_date_iso>"
  -- e.g. "membership_expiry_reminder:uuid:2026-07-10"
  cycle_key       TEXT        NOT NULL,
  -- How many times this template has been sent in the current cycle
  send_count      INTEGER     NOT NULL DEFAULT 1,
  -- WhatsApp message ID returned by Meta API (null if send failed)
  message_id      TEXT,
  -- 'sent' | 'failed' | 'skipped'
  status          TEXT        NOT NULL DEFAULT 'sent',
  error_message   TEXT,
  -- ISO date when this specific message was sent
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The trigger date for the cycle (e.g. expiry date, due date)
  trigger_date    DATE,
  metadata        JSONB       DEFAULT '{}'::JSONB
);

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_member_id
  ON whatsapp_automation_logs(member_id);

CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_gym_id
  ON whatsapp_automation_logs(gym_id);

CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_template
  ON whatsapp_automation_logs(template_name);

CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_cycle_key
  ON whatsapp_automation_logs(cycle_key);

-- Fast "did we already send today?" check
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_sent_at
  ON whatsapp_automation_logs(sent_at DESC);

-- Unique constraint: one send per (member, template, day).
-- Prevents the cron from firing twice in the same day for the same member.
-- Uses timezone('UTC', sent_at)::date — TIMESTAMPTZ::date is not immutable
-- because it depends on session timezone, so the explicit UTC cast is required.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_auto_logs_daily_dedup
  ON whatsapp_automation_logs(member_id, template_name, (timezone('UTC', sent_at)::date));

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE whatsapp_automation_logs ENABLE ROW LEVEL SECURITY;

-- Only service role (cron) writes; gym owners can read their own logs
CREATE POLICY wa_auto_logs_select ON whatsapp_automation_logs
  FOR SELECT
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

-- ── Members table: add date_of_birth column if missing ─────────────────────
-- Needed for birthday_wishes automation

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

COMMENT ON COLUMN members.date_of_birth
  IS 'Used for automated birthday_wishes WhatsApp messages';

COMMENT ON TABLE whatsapp_automation_logs
  IS 'Tracks every automated WhatsApp template message. Used for idempotency and schedule enforcement.';
