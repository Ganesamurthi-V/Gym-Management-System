-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp Send Queue
--
-- Throttled outbound queue for automated WhatsApp template messages. Bulk sends
-- (post-import batch + the daily automation cron) are ENQUEUED here instead of
-- dispatched inline, then drained at a fixed rate (5 per 5 minutes, globally)
-- so the single shared WhatsApp Cloud API number is never seen as spamming.
--
-- Idempotency & cadence still live in whatsapp_automation_logs: each queue row
-- carries the id of its pre-claimed 'sent' log row (log_row_id), which the drain
-- reconciles via finalizeSend after the actual send.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_send_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  template_name TEXT        NOT NULL,
  -- Full TemplateContext passed straight to sendWhatsAppTemplate at drain time.
  context       JSONB       NOT NULL DEFAULT '{}'::JSONB,
  -- Mirrors the automation-log cycle key for traceability.
  cycle_key     TEXT        NOT NULL,
  trigger_date  DATE,
  -- The pre-claimed whatsapp_automation_logs row this send reconciles on drain.
  log_row_id    UUID,
  -- pending | sending | sent | failed | cancelled
  status        TEXT        NOT NULL DEFAULT 'pending',
  -- Row becomes eligible for draining once now() >= scheduled_at.
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts      INTEGER     NOT NULL DEFAULT 0,
  max_attempts  INTEGER     NOT NULL DEFAULT 3,
  -- Set when a drain claims the row, to avoid concurrent double-processing.
  locked_at     TIMESTAMPTZ,
  last_error    TEXT,
  message_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);

-- ── Indexes ────────────────────────────────────────────────────────────────

-- Primary drain query: oldest due pending rows first.
CREATE INDEX IF NOT EXISTS idx_wa_queue_due
  ON whatsapp_send_queue (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wa_queue_gym
  ON whatsapp_send_queue (gym_id);

-- Enqueue-time dedup: at most one active (pending/sending) row per
-- member+template+cycle. The daily-slot claim is the primary idempotency gate;
-- this is a cheap second guard against enqueuing the same send twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_queue_active_dedup
  ON whatsapp_send_queue (member_id, template_name, cycle_key)
  WHERE status IN ('pending', 'sending');

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE whatsapp_send_queue ENABLE ROW LEVEL SECURITY;

-- Service role (cron / drain) manages rows; gym owners may read their own queue.
CREATE POLICY wa_queue_select ON whatsapp_send_queue
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

COMMENT ON TABLE whatsapp_send_queue
  IS 'Throttled outbound queue for automated WhatsApp sends (5 per 5 minutes, drained via QStash).';
