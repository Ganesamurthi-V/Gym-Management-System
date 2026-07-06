-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp Automation — Hardening
--
-- Fixes two correctness issues in the automation engine:
--
--   B2. cancelReminderCycles() records a single `status = 'cancelled'` sentinel
--       row to close a cycle. The previous full unique index on
--       (member_id, template_name, sent_at::date) blocked that insert whenever a
--       real send had already happened for the member+template on the same day,
--       so cancellation silently failed.
--
--       The dedup we actually need is: "never send the SAME template to the SAME
--       member more than once per day". That only concerns rows that represent an
--       actual send (status = 'sent'). We therefore replace the full unique index
--       with a PARTIAL unique index scoped to status = 'sent', which lets any
--       number of 'cancelled' / 'failed' / 'skipped' rows coexist with a send on
--       the same day.
--
-- Idempotent — safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

-- Drop the old full unique index (blocked same-day cancellation rows).
DROP INDEX IF EXISTS idx_wa_auto_logs_daily_dedup;

-- Recreate it as a PARTIAL unique index that only constrains real sends.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_auto_logs_daily_dedup_sent
  ON whatsapp_automation_logs (member_id, template_name, (sent_at::date))
  WHERE status = 'sent';

-- Composite index to resolve "the current cycle for this member+template"
-- quickly (latest row by sent_at within a member+template).
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_member_template_sent
  ON whatsapp_automation_logs (member_id, template_name, sent_at DESC);

COMMENT ON INDEX idx_wa_auto_logs_daily_dedup_sent
  IS 'Prevents more than one actual send (status=sent) per member+template+day. '
     'Cancelled/failed/skipped rows are intentionally excluded so a cycle can be '
     'cancelled on the same day a reminder was sent.';
