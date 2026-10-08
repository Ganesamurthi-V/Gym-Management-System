-- ============================================================
-- GymFlow — Complete Database Schema (single executable file)
--
-- Run this whole file once in the Supabase SQL editor on a brand-new project.
-- It is safe to run again: every statement is idempotent.
--
-- Contents, in order:
--   PART 1  Baseline schema: extensions, tables, indexes, RLS, functions,
--           triggers, realtime publications, storage buckets, and the
--           member-app auth foundation.
--   PART 2  Every migration from supabase/migrations/, in the order they
--           were applied to the hosted project. Later migrations override
--           earlier ones (functions are redefined with CREATE OR REPLACE),
--           so the end state is identical to the hosted database.
--
-- The migration files are still kept in supabase/migrations/ as the change
-- history. For a fresh install you only need this file; do not also run them.
--
-- After it finishes, set your own values (see SELF_HOSTING.md):
--   update app_config set value = '<CRON_SECRET>' where key = 'push_cron_secret';
--   update platform_settings set upi_id = '<your-upi-id>', upi_name = '<name>' where id = 1;
-- ============================================================


-- ############################################################
-- PART 1 — BASELINE SCHEMA
-- ############################################################

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ============================================================
-- TABLES
-- ============================================================

-- ── gyms ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gyms (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT        NOT NULL,
  owner_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic info
  city                    TEXT,
  gst_number              TEXT,
  phone                   TEXT,
  is_active               BOOLEAN     NOT NULL DEFAULT true,

  -- Onboarding
  onboarding_completed    BOOLEAN     DEFAULT false,
  onboarding_data         JSONB,

  -- Subscription
  trial_started_at        TIMESTAMPTZ,
  trial_ends_at           TIMESTAMPTZ,
  subscription_status     TEXT        NOT NULL DEFAULT 'trial'
                                      CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled', 'suspended')),
  plan_type               TEXT        NOT NULL DEFAULT 'trial'
                                      CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'lifetime')),
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at    TIMESTAMPTZ,

  -- Admin fields
  admin_notes             TEXT,
  is_vip                  BOOLEAN     NOT NULL DEFAULT false,
  is_payment_verified     BOOLEAN     NOT NULL DEFAULT false,
  whatsapp_enabled        BOOLEAN     NOT NULL DEFAULT true,
  priority_support        BOOLEAN     NOT NULL DEFAULT false,
  auto_renewal_eligible   BOOLEAN     NOT NULL DEFAULT false,
  lifetime_offer          BOOLEAN     NOT NULL DEFAULT false,
  login_disabled          BOOLEAN     NOT NULL DEFAULT false,
  last_payment_amount     INTEGER,
  last_payment_method     TEXT,
  last_transaction_id     TEXT,
  last_payment_date       TIMESTAMPTZ,
  last_payment_status     TEXT        DEFAULT 'none'
                                      CHECK (last_payment_status IN ('none', 'paid', 'pending', 'failed')),

  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── members ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id              UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_number       INTEGER     NOT NULL,
  name                TEXT        NOT NULL,
  phone               TEXT        NOT NULL,
  gender              TEXT        CHECK (gender IN ('male', 'female', 'other')),
  area                TEXT,
  age                 INTEGER     CHECK (age > 0 AND age < 120),
  date_of_birth       DATE,
  pending_amount      INTEGER     NOT NULL DEFAULT 0,
  legacy_member_id    TEXT        DEFAULT NULL,
  is_imported         BOOLEAN     NOT NULL DEFAULT false,
  -- Portal management (Member App module)
  portal_enabled      BOOLEAN     NOT NULL DEFAULT false,
  portal_suspended    BOOLEAN     NOT NULL DEFAULT false,
  invitation_status   TEXT        NOT NULL DEFAULT 'not_sent'
                                  CHECK (invitation_status IN ('not_sent','pending','delivered','activated','expired')),
  invitation_sent_at  TIMESTAMPTZ,
  portal_activated_at TIMESTAMPTZ,
  last_portal_login   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, member_number)
);

COMMENT ON COLUMN members.legacy_member_id IS
  'Original member ID from an external/legacy system, preserved during import. '
  'The canonical GymFlow ID is derived from member_number as GF + zero-padded 4 digits.';

COMMENT ON COLUMN members.date_of_birth IS
  'Used for automated birthday_wishes WhatsApp messages';

COMMENT ON COLUMN members.is_imported IS
  'True for members created via Excel/CSV import. Suppresses the _gymflow_welcome_member template; all other automations behave identically.';

-- ── memberships ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan          TEXT        NOT NULL CHECK (plan IN ('monthly', 'quarterly', 'annual')),
  category      TEXT        CHECK (category IN ('strength', 'cardio', 'both')) DEFAULT 'both',
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  amount        INTEGER     NOT NULL DEFAULT 0,
  admission_fee INTEGER     NOT NULL DEFAULT 0,
  due_amount    INTEGER     NOT NULL DEFAULT 0,
  payment_mode  TEXT        NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── due_payments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS due_payments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount        INTEGER     NOT NULL,
  payment_mode  TEXT        NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── attendance ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  session         TEXT        CHECK (session IN ('morning', 'evening')) DEFAULT 'morning',
  check_out_time  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, date, session)
);

-- ── admin_messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_messages (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id                UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject               TEXT        NOT NULL,
  body                  TEXT        NOT NULL,
  sent_by               TEXT        NOT NULL DEFAULT 'super_admin',
  type                  TEXT        NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  read_at               TIMESTAMPTZ,
  is_cleared_by_owner   BOOLEAN     DEFAULT false,
  is_cleared_by_admin   BOOLEAN     DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── support_tickets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id                UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject               TEXT        NOT NULL,
  message               TEXT        NOT NULL,
  type                  TEXT        NOT NULL CHECK (type IN ('query', 'issue', 'bug', 'high_priority', 'feedback')),
  -- Star rating (1-5), populated only by 'feedback' rows; NULL for support tickets.
  rating                SMALLINT    CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  status                TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  is_cleared_by_owner   BOOLEAN     DEFAULT false,
  is_cleared_by_admin   BOOLEAN     DEFAULT false,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── gym_plan_prices ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gym_plan_prices (
  gym_id                  UUID    PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  monthly                 INTEGER NOT NULL DEFAULT 1500,
  quarterly               INTEGER NOT NULL DEFAULT 4000,
  annual                  INTEGER NOT NULL DEFAULT 10000,
  joining_fee_monthly     INTEGER NOT NULL DEFAULT 0,
  joining_fee_quarterly   INTEGER NOT NULL DEFAULT 0,
  joining_fee_annual      INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── inventory ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id                UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  product_name          TEXT        NOT NULL,
  brand                 TEXT,
  category              TEXT,
  sku                   TEXT,
  description           TEXT,
  variant_name          TEXT        NOT NULL,
  cost_price            NUMERIC     NOT NULL,
  selling_price         NUMERIC     NOT NULL,
  member_price          NUMERIC,
  initial_stock         INTEGER     NOT NULL DEFAULT 0,
  low_stock_threshold   INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── inventory_units ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_units (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  inventory_id  UUID        NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  barcode       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'expired', 'lost')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, barcode)
);

-- ── inventory_sales ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_sales (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  inventory_id  UUID        REFERENCES inventory(id) ON DELETE SET NULL,
  product_name  TEXT        NOT NULL,
  variant_name  TEXT        NOT NULL,
  quantity      INTEGER     NOT NULL DEFAULT 1,
  unit_price    NUMERIC     NOT NULL,
  total_price   NUMERIC     NOT NULL,
  payment_mode  TEXT        NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'upi', 'card')),
  sold_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── workout_programs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workout_programs (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id            UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  summary           TEXT,
  notes             TEXT,
  duration          INTEGER     NOT NULL,
  frequency         INTEGER,
  difficulty        TEXT,
  goal              TEXT,
  category          TEXT,
  equipment         TEXT,
  target_audience   TEXT,
  experience_level  TEXT,
  schedule          JSONB       NOT NULL,
  is_draft          BOOLEAN     DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── subscription_requests ────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id            UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  uploaded_file_url TEXT        NOT NULL,
  transaction_id    TEXT,
  notes             TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT
);

-- ── platform_settings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  id                 INT     PRIMARY KEY DEFAULT 1,
  upi_id             TEXT    NOT NULL DEFAULT '',
  upi_name           TEXT    NOT NULL DEFAULT 'GymFlow',
  price_monthly      INT     NOT NULL DEFAULT 1999,
  -- Six-month tier, added when the plan set grew from two tiers to three.
  price_half_yearly  INT     NOT NULL DEFAULT 6999,
  price_yearly       INT     NOT NULL DEFAULT 12999,
  CHECK (id = 1)
);

INSERT INTO platform_settings DEFAULT VALUES
  ON CONFLICT (id) DO NOTHING;

-- ── notifications ────────────────────────────────────────────
-- Admin-facing event log; drives the in-app notification centre and lock-screen
-- push. Written only by DB triggers (see 20260925160000_admin_notifications.sql)
-- and read only through the service-role admin API. RLS on, no policies.
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('ticket', 'feedback', 'payment_request', 'new_gym')),
  gym_id      UUID        REFERENCES gyms(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  entity_id   TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  pushed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── device_push_tokens ───────────────────────────────────────
-- FCM registration tokens, keyed per device (admin auth has no per-user id).
CREATE TABLE IF NOT EXISTS device_push_tokens (
  token        TEXT        PRIMARY KEY,
  platform     TEXT        NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── app_config ───────────────────────────────────────────────
-- Private server-side key/value store (push dispatch URL + CRON_SECRET). Read
-- only by SECURITY DEFINER triggers / service role. See
-- 20260925170000_push_dispatch_pg_net.sql — pg_net calls /api/push/dispatch on
-- each new notification, so no external cron is needed.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── subscription_audit_logs ──────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  prev_status   TEXT,
  new_status    TEXT,
  prev_plan     TEXT,
  new_plan      TEXT,
  prev_expiry   TIMESTAMPTZ,
  new_expiry    TIMESTAMPTZ,
  action        TEXT        NOT NULL,
  performed_by  TEXT        NOT NULL DEFAULT 'admin',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── member_portal_activity ────────────────────────────────────
-- Append-only event log for portal-related actions (owner or member).
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

-- ── gym_usage_stats ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gym_usage_stats (
  gym_id              UUID    PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  total_members       INTEGER NOT NULL DEFAULT 0,
  total_attendance    INTEGER NOT NULL DEFAULT 0,
  total_payments      INTEGER NOT NULL DEFAULT 0,
  total_revenue       BIGINT  NOT NULL DEFAULT 0,
  whatsapp_sent       INTEGER NOT NULL DEFAULT 0,
  reports_generated   INTEGER NOT NULL DEFAULT 0,
  storage_used_kb     BIGINT  NOT NULL DEFAULT 0,
  last_active_at      TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── gym_upi_config ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gym_upi_config (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id          UUID        NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,
  upi_id          TEXT        NOT NULL,
  merchant_name   TEXT        NOT NULL,
  merchant_code   TEXT,
  currency        TEXT        NOT NULL DEFAULT 'INR',
  raw_params      JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── whatsapp_messages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          TEXT        NOT NULL UNIQUE,
  gym_id              UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  phone_number_id     TEXT        NOT NULL,
  from_number         TEXT        NOT NULL,
  to_number           TEXT        NOT NULL,
  direction           TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type        TEXT        NOT NULL,
  content             TEXT,
  media_id            TEXT,
  media_type          TEXT,
  media_url           TEXT,
  caption             TEXT,
  status              TEXT        CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'deleted')),
  conversation_id     TEXT,
  context_message_id  TEXT,
  metadata            JSONB       DEFAULT '{}'::JSONB,
  error_code          INTEGER,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE whatsapp_messages IS 'Stores all WhatsApp messages (inbound and outbound)';

-- ── whatsapp_webhook_logs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          TEXT        NOT NULL,
  phone_number_id     TEXT        NOT NULL,
  event_type          TEXT        NOT NULL CHECK (event_type IN ('message', 'status', 'error', 'unknown')),
  payload             JSONB       NOT NULL,
  signature_valid     BOOLEAN     NOT NULL DEFAULT false,
  processed           BOOLEAN     NOT NULL DEFAULT false,
  error               TEXT,
  processing_time_ms  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE whatsapp_webhook_logs IS 'Logs all webhook events for debugging and monitoring';

-- ── gym_whatsapp_config ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS gym_whatsapp_config (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                  UUID        NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,
  phone_number_id         TEXT        NOT NULL UNIQUE,
  phone_number            TEXT        NOT NULL,
  business_account_id     TEXT        NOT NULL,
  enabled                 BOOLEAN     NOT NULL DEFAULT true,
  auto_reply_enabled      BOOLEAN     NOT NULL DEFAULT false,
  auto_reply_message      TEXT,
  metadata                JSONB       DEFAULT '{}'::JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gym_whatsapp_config IS 'WhatsApp Business configuration per gym';

-- ── whatsapp_automation_logs ─────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_automation_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  phone_number    TEXT        NOT NULL,
  template_name   TEXT        NOT NULL,
  cycle_key       TEXT        NOT NULL,
  send_count      INTEGER     NOT NULL DEFAULT 1,
  message_id      TEXT,
  status          TEXT        NOT NULL DEFAULT 'sent',
  error_message   TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_date    DATE,
  metadata        JSONB       DEFAULT '{}'::JSONB
);

COMMENT ON TABLE whatsapp_automation_logs IS
  'Tracks every automated WhatsApp template message. Used for idempotency and schedule enforcement.';

-- ── whatsapp_send_queue ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_send_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  template_name TEXT        NOT NULL,
  context       JSONB       NOT NULL DEFAULT '{}'::JSONB,
  cycle_key     TEXT        NOT NULL,
  trigger_date  DATE,
  log_row_id    UUID,
  status        TEXT        NOT NULL DEFAULT 'pending',
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts      INTEGER     NOT NULL DEFAULT 0,
  max_attempts  INTEGER     NOT NULL DEFAULT 3,
  locked_at     TIMESTAMPTZ,
  last_error    TEXT,
  message_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);

COMMENT ON TABLE whatsapp_send_queue IS
  'Throttled outbound queue for automated WhatsApp sends (5 per 5 minutes, drained via QStash).';

-- ============================================================
-- INDEXES
-- ============================================================

-- gyms
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
CREATE INDEX IF NOT EXISTS idx_gyms_subscription_status ON gyms(subscription_status);
CREATE INDEX IF NOT EXISTS idx_gyms_trial_ends_at ON gyms(trial_ends_at) WHERE subscription_status = 'trial';

-- members
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(gym_id, member_number);
CREATE INDEX IF NOT EXISTS idx_members_gym_created ON members(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_gym_dues ON members(gym_id, pending_amount) WHERE pending_amount > 0;
CREATE INDEX IF NOT EXISTS idx_members_portal_status ON members(gym_id, portal_enabled, invitation_status);
CREATE INDEX IF NOT EXISTS idx_members_last_portal_login ON members(gym_id, last_portal_login DESC NULLS LAST) WHERE last_portal_login IS NOT NULL;

-- member_portal_activity
CREATE INDEX IF NOT EXISTS idx_portal_activity_gym ON member_portal_activity(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_activity_member ON member_portal_activity(member_id, created_at DESC);

-- memberships
CREATE INDEX IF NOT EXISTS idx_memberships_gym_id ON memberships(gym_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_end_date ON memberships(end_date);
CREATE INDEX IF NOT EXISTS idx_memberships_start_date ON memberships(gym_id, start_date);
CREATE INDEX IF NOT EXISTS idx_memberships_member_created ON memberships(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_gym_end_date ON memberships(gym_id, end_date);

-- attendance
CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance(gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_gym_date ON attendance(gym_id, date);

-- due_payments
CREATE INDEX IF NOT EXISTS idx_due_payments_gym_id ON due_payments(gym_id);

-- admin_messages
CREATE INDEX IF NOT EXISTS idx_admin_messages_gym_id ON admin_messages(gym_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON admin_messages(created_at DESC);

-- support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_gym_id ON support_tickets(gym_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- inventory
CREATE INDEX IF NOT EXISTS idx_inventory_gym_id ON inventory(gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(gym_id, category);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(gym_id, sku);

-- inventory_units
CREATE INDEX IF NOT EXISTS idx_inventory_units_gym_id ON inventory_units(gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_inventory_id ON inventory_units(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_barcode ON inventory_units(gym_id, barcode);

-- inventory_sales
CREATE INDEX IF NOT EXISTS idx_inventory_sales_gym_id ON inventory_sales(gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sales_inventory_id ON inventory_sales(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sales_sold_at ON inventory_sales(gym_id, sold_at DESC);

-- workout_programs
CREATE INDEX IF NOT EXISTS idx_workout_programs_gym_id ON workout_programs(gym_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_created ON workout_programs(gym_id, created_at DESC);

-- subscription_requests
CREATE INDEX IF NOT EXISTS idx_sub_requests_gym_id ON subscription_requests(gym_id);
CREATE INDEX IF NOT EXISTS idx_sub_requests_status ON subscription_requests(status);

-- subscription_audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_gym_id ON subscription_audit_logs(gym_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON subscription_audit_logs(gym_id, created_at DESC);

-- gym_upi_config
CREATE INDEX IF NOT EXISTS idx_gym_upi_config_gym_id ON gym_upi_config(gym_id);

-- whatsapp_messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_id ON whatsapp_messages(gym_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number_id ON whatsapp_messages(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_number ON whatsapp_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_id ON whatsapp_messages(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_created ON whatsapp_messages(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_from ON whatsapp_messages(gym_id, from_number, created_at DESC);

-- whatsapp_webhook_logs
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_request_id ON whatsapp_webhook_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_phone_number_id ON whatsapp_webhook_logs(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_event_type ON whatsapp_webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_created_at ON whatsapp_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_processed ON whatsapp_webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_signature_valid ON whatsapp_webhook_logs(signature_valid);

-- gym_whatsapp_config
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_gym_id ON gym_whatsapp_config(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_phone_number_id ON gym_whatsapp_config(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_enabled ON gym_whatsapp_config(enabled);

-- whatsapp_automation_logs
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_member_id ON whatsapp_automation_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_gym_id ON whatsapp_automation_logs(gym_id);
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_template ON whatsapp_automation_logs(template_name);
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_cycle_key ON whatsapp_automation_logs(cycle_key);
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_sent_at ON whatsapp_automation_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_member_template_sent ON whatsapp_automation_logs(member_id, template_name, sent_at DESC);
-- Partial unique index: prevents duplicate sends (status='sent' only; cancelled/failed/skipped allowed same-day)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_auto_logs_daily_dedup_sent
  ON whatsapp_automation_logs(member_id, template_name, (timezone('UTC', sent_at)::date))
  WHERE status = 'sent';

-- whatsapp_send_queue
CREATE INDEX IF NOT EXISTS idx_wa_queue_due ON whatsapp_send_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wa_queue_gym ON whatsapp_send_queue(gym_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_queue_active_dedup
  ON whatsapp_send_queue(member_id, template_name, cycle_key)
  WHERE status IN ('pending', 'sending');

-- ============================================================
-- ROW LEVEL SECURITY — ENABLE
-- ============================================================

ALTER TABLE gyms                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE members                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships             ENABLE ROW LEVEL SECURITY;
ALTER TABLE due_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance              ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_plan_prices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory               ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_units         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sales         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_programs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_portal_activity  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_usage_stats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_upi_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_whatsapp_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_send_queue     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ROW LEVEL SECURITY — POLICIES
-- ============================================================

-- ── gyms ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own gym" ON gyms;
CREATE POLICY "Users can view their own gym"
  ON gyms FOR SELECT
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own gym" ON gyms;
CREATE POLICY "Users can insert their own gym"
  ON gyms FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own gym" ON gyms;
CREATE POLICY "Users can update their own gym"
  ON gyms FOR UPDATE
  USING (owner_id = auth.uid());

-- ── members ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view their members" ON members;
CREATE POLICY "Gym owners can view their members"
  ON members FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert members" ON members;
CREATE POLICY "Gym owners can insert members"
  ON members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update members" ON members;
CREATE POLICY "Gym owners can update members"
  ON members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete members" ON members;
CREATE POLICY "Gym owners can delete members"
  ON members FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

-- ── memberships ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view memberships" ON memberships;
CREATE POLICY "Gym owners can view memberships"
  ON memberships FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert memberships" ON memberships;
CREATE POLICY "Gym owners can insert memberships"
  ON memberships FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update memberships" ON memberships;
CREATE POLICY "Gym owners can update memberships"
  ON memberships FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete memberships" ON memberships;
CREATE POLICY "Gym owners can delete memberships"
  ON memberships FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

-- ── due_payments ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view due payments" ON due_payments;
CREATE POLICY "Gym owners can view due payments"
  ON due_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert due payments" ON due_payments;
CREATE POLICY "Gym owners can insert due payments"
  ON due_payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update due payments" ON due_payments;
CREATE POLICY "Gym owners can update due payments"
  ON due_payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete due payments" ON due_payments;
CREATE POLICY "Gym owners can delete due payments"
  ON due_payments FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

-- ── attendance ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view attendance" ON attendance;
CREATE POLICY "Gym owners can view attendance"
  ON attendance FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert attendance" ON attendance;
CREATE POLICY "Gym owners can insert attendance"
  ON attendance FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update attendance" ON attendance;
CREATE POLICY "Gym owners can update attendance"
  ON attendance FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete attendance" ON attendance;
CREATE POLICY "Gym owners can delete attendance"
  ON attendance FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

-- ── admin_messages ───────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can read their admin messages" ON admin_messages;
CREATE POLICY "Gym owners can read their admin messages"
  ON admin_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can mark messages as read" ON admin_messages;
CREATE POLICY "Gym owners can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid()));

-- ── support_tickets ──────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view their support tickets" ON support_tickets;
CREATE POLICY "Gym owners can view their support tickets"
  ON support_tickets FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert support tickets" ON support_tickets;
CREATE POLICY "Gym owners can insert support tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update their support tickets" ON support_tickets;
CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

-- ── gym_plan_prices ──────────────────────────────────────────
DROP POLICY IF EXISTS "Owner can read own plan prices" ON gym_plan_prices;
CREATE POLICY "Owner can read own plan prices"
  ON gym_plan_prices FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gym_plan_prices' AND policyname = 'Owner can upsert own plan prices'
  ) THEN
    CREATE POLICY "Owner can upsert own plan prices"
      ON gym_plan_prices FOR INSERT
      WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gym_plan_prices' AND policyname = 'Owner can update own plan prices'
  ) THEN
    CREATE POLICY "Owner can update own plan prices"
      ON gym_plan_prices FOR UPDATE
      USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- ── inventory ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view their inventory" ON inventory;
CREATE POLICY "Gym owners can view their inventory"
  ON inventory FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert inventory" ON inventory;
CREATE POLICY "Gym owners can insert inventory"
  ON inventory FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update inventory" ON inventory;
CREATE POLICY "Gym owners can update inventory"
  ON inventory FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete inventory" ON inventory;
CREATE POLICY "Gym owners can delete inventory"
  ON inventory FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

-- ── inventory_units ──────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view their inventory units" ON inventory_units;
CREATE POLICY "Gym owners can view their inventory units"
  ON inventory_units FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert inventory units" ON inventory_units;
CREATE POLICY "Gym owners can insert inventory units"
  ON inventory_units FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update inventory units" ON inventory_units;
CREATE POLICY "Gym owners can update inventory units"
  ON inventory_units FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete inventory units" ON inventory_units;
CREATE POLICY "Gym owners can delete inventory units"
  ON inventory_units FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

-- ── inventory_sales ──────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view their inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can view their inventory sales"
  ON inventory_sales FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can insert inventory sales"
  ON inventory_sales FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can update inventory sales"
  ON inventory_sales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can delete inventory sales"
  ON inventory_sales FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

-- ── workout_programs ─────────────────────────────────────────
-- RLS is enabled above; without these policies every owner query is denied.
DROP POLICY IF EXISTS "Gym owners can view their programs" ON workout_programs;
CREATE POLICY "Gym owners can view their programs"
  ON workout_programs FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert programs" ON workout_programs;
CREATE POLICY "Gym owners can insert programs"
  ON workout_programs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update programs" ON workout_programs;
CREATE POLICY "Gym owners can update programs"
  ON workout_programs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete programs" ON workout_programs;
CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

-- ── workout_programs ─────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view their programs" ON workout_programs;
CREATE POLICY "Gym owners can view their programs"
  ON workout_programs FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert programs" ON workout_programs;
CREATE POLICY "Gym owners can insert programs"
  ON workout_programs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update programs" ON workout_programs;
CREATE POLICY "Gym owners can update programs"
  ON workout_programs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete programs" ON workout_programs;
CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

-- ── member_portal_activity ───────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view portal activity" ON member_portal_activity;
CREATE POLICY "Gym owners can view portal activity"
  ON member_portal_activity FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = member_portal_activity.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert portal activity" ON member_portal_activity;
CREATE POLICY "Gym owners can insert portal activity"
  ON member_portal_activity FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = member_portal_activity.gym_id AND owner_id = auth.uid()));

-- ── subscription_requests ────────────────────────────────────
DROP POLICY IF EXISTS "gym owner read own requests" ON subscription_requests;
CREATE POLICY "gym owner read own requests"
  ON subscription_requests FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "gym owner insert own requests" ON subscription_requests;
CREATE POLICY "gym owner insert own requests"
  ON subscription_requests FOR INSERT
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── gym_usage_stats ──────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view own usage stats" ON gym_usage_stats;
CREATE POLICY "Gym owners can view own usage stats"
  ON gym_usage_stats FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── gym_upi_config ───────────────────────────────────────────
DROP POLICY IF EXISTS "Gym owners can view their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can view their UPI config"
  ON gym_upi_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can insert their UPI config"
  ON gym_upi_config FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can update their UPI config"
  ON gym_upi_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can delete their UPI config"
  ON gym_upi_config FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

-- ── whatsapp_messages ────────────────────────────────────────
DROP POLICY IF EXISTS whatsapp_messages_select_policy ON whatsapp_messages;
CREATE POLICY whatsapp_messages_select_policy ON whatsapp_messages
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS whatsapp_messages_insert_policy ON whatsapp_messages;
CREATE POLICY whatsapp_messages_insert_policy ON whatsapp_messages
  FOR INSERT
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS whatsapp_messages_update_policy ON whatsapp_messages;
CREATE POLICY whatsapp_messages_update_policy ON whatsapp_messages
  FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── whatsapp_webhook_logs ────────────────────────────────────
-- Only service role can access webhook logs (no authenticated user policy needed)
DROP POLICY IF EXISTS whatsapp_webhook_logs_admin_policy ON whatsapp_webhook_logs;
CREATE POLICY whatsapp_webhook_logs_admin_policy ON whatsapp_webhook_logs
  FOR ALL
  USING (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' = 'service_role');

-- ── gym_whatsapp_config ──────────────────────────────────────
DROP POLICY IF EXISTS gym_whatsapp_config_select_policy ON gym_whatsapp_config;
CREATE POLICY gym_whatsapp_config_select_policy ON gym_whatsapp_config
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS gym_whatsapp_config_update_policy ON gym_whatsapp_config;
CREATE POLICY gym_whatsapp_config_update_policy ON gym_whatsapp_config
  FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── whatsapp_automation_logs ─────────────────────────────────
DROP POLICY IF EXISTS wa_auto_logs_select ON whatsapp_automation_logs;
CREATE POLICY wa_auto_logs_select ON whatsapp_automation_logs
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── whatsapp_send_queue ──────────────────────────────────────
DROP POLICY IF EXISTS wa_queue_select ON whatsapp_send_queue;
CREATE POLICY wa_queue_select ON whatsapp_send_queue
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- ── check_gym_active (latest version: handles cancelled/suspended) ──
CREATE OR REPLACE FUNCTION check_gym_active(p_email TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN g.is_active = false                   THEN false
      WHEN g.subscription_status = 'expired'     THEN false
      WHEN g.subscription_status = 'cancelled'   THEN false
      WHEN g.subscription_status = 'suspended'   THEN false
      WHEN g.subscription_status = 'trial'
           AND g.trial_ends_at < now()           THEN false
      WHEN g.subscription_status = 'active'
           AND g.subscription_ends_at IS NOT NULL
           AND g.subscription_ends_at < now()    THEN false
      ELSE true
    END
  FROM auth.users u
  JOIN gyms g ON g.owner_id = u.id
  WHERE u.email = p_email
  LIMIT 1;
$$;

-- ── increment_inventory_stock (with ownership check) ─────────
CREATE OR REPLACE FUNCTION increment_inventory_stock(p_inventory_id UUID, amount INTEGER)
RETURNS VOID AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM inventory WHERE id = p_inventory_id;
  IF NOT EXISTS (SELECT 1 FROM gyms WHERE id = v_gym_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE inventory
  SET initial_stock = GREATEST(0, initial_stock + amount),
      updated_at = NOW()
  WHERE id = p_inventory_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- ── sell_inventory_item (atomic, prevents oversell) ──────────
CREATE OR REPLACE FUNCTION sell_inventory_item(
  p_inventory_id UUID,
  p_quantity     INTEGER,
  p_unit_price   NUMERIC,
  p_payment_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product  inventory%ROWTYPE;
  v_price    NUMERIC;
  v_total    NUMERIC;
  v_mode     TEXT;
  v_sale_id  UUID;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  v_mode := CASE WHEN p_payment_mode IN ('cash', 'upi', 'card') THEN p_payment_mode ELSE 'cash' END;

  SELECT * INTO v_product FROM inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM gyms WHERE id = v_product.gym_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  IF v_product.initial_stock < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_product.initial_stock;
  END IF;

  v_price := COALESCE(p_unit_price, v_product.selling_price);
  v_total := v_price * p_quantity;

  INSERT INTO inventory_sales (
    gym_id, inventory_id, product_name, variant_name,
    quantity, unit_price, total_price, payment_mode
  ) VALUES (
    v_product.gym_id, p_inventory_id, v_product.product_name, v_product.variant_name,
    p_quantity, v_price, v_total, v_mode
  )
  RETURNING id INTO v_sale_id;

  UPDATE inventory
  SET initial_stock = initial_stock - p_quantity,
      updated_at = NOW()
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'sale_id',         v_sale_id,
    'product_name',    v_product.product_name,
    'quantity',        p_quantity,
    'total_price',     v_total,
    'remaining_stock', v_product.initial_stock - p_quantity
  );
END;
$$;

-- ── get_gym_dashboard ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_gym_dashboard(p_gym_id UUID, p_today DATE)
RETURNS JSON AS $$
DECLARE
  v_total_active INT;
  v_expiring_this_week INT;
  v_expired_count INT;
  v_today_attendance INT;
  v_today_collection NUMERIC;
  v_total_dues NUMERIC;
  v_expiring_members JSON;
BEGIN
  SELECT COUNT(*) INTO v_today_attendance
  FROM attendance
  WHERE gym_id = p_gym_id AND date = p_today;

  SELECT COALESCE(SUM(amount + admission_fee), 0) INTO v_today_collection
  FROM memberships
  WHERE gym_id = p_gym_id AND start_date = p_today;

  SELECT COALESCE(SUM(pending_amount), 0) INTO v_total_dues
  FROM members
  WHERE gym_id = p_gym_id AND pending_amount > 0;

  WITH latest_memberships AS (
    SELECT
      m.id AS member_id,
      m.name,
      m.phone,
      m.member_number,
      ms.end_date,
      ms.id AS membership_id,
      ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY ms.created_at DESC) as rn
    FROM members m
    LEFT JOIN memberships ms ON ms.member_id = m.id
    WHERE m.gym_id = p_gym_id
  ),
  member_statuses AS (
    SELECT
      member_id,
      name,
      phone,
      member_number,
      end_date,
      CASE
        WHEN end_date IS NULL THEN 'expired'
        WHEN end_date < p_today THEN 'expired'
        WHEN end_date >= p_today AND end_date <= (p_today + INTERVAL '7 days')::DATE THEN 'expiring'
        ELSE 'active'
      END as status,
      (end_date - p_today) as days_remaining
    FROM latest_memberships
    WHERE rn = 1
  )
  SELECT
    COUNT(*) FILTER (WHERE status IN ('active', 'expiring'))::INT,
    COUNT(*) FILTER (WHERE status = 'expiring')::INT,
    COUNT(*) FILTER (WHERE status = 'expired')::INT,
    COALESCE(
      json_agg(
        json_build_object(
          'id', member_id,
          'name', name,
          'phone', phone,
          'member_number', member_number,
          'status', status,
          'days_remaining', days_remaining,
          'latest_membership', json_build_object('end_date', end_date)
        ) ORDER BY days_remaining ASC
      ) FILTER (WHERE status = 'expiring'),
      '[]'::json
    )
  INTO
    v_total_active,
    v_expiring_this_week,
    v_expired_count,
    v_expiring_members
  FROM member_statuses;

  RETURN json_build_object(
    'stats', json_build_object(
      'total_active', COALESCE(v_total_active, 0),
      'expiring_this_week', COALESCE(v_expiring_this_week, 0),
      'expired_count', COALESCE(v_expired_count, 0),
      'today_attendance', COALESCE(v_today_attendance, 0),
      'today_collection', COALESCE(v_today_collection, 0),
      'total_dues', COALESCE(v_total_dues, 0)
    ),
    'expiringMembers', v_expiring_members
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- ── get_gym_reports ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_gym_reports(p_gym_id UUID, p_today DATE)
RETURNS JSON AS $$
DECLARE
  v_months JSON;
  v_inventory_sales JSON;
  v_recent_inventory_sales JSON;
  v_expired_count INT;
  v_active_count INT;
  v_churn_count INT;
  v_plan_counts JSON;
  v_gender_counts JSON;
  v_age_buckets JSON;
  v_new_members_by_month JSON;
  v_attendance_by_day JSON;
  v_top_areas JSON;
  v_members_with_dues JSON;
  v_total_dues_amount NUMERIC;
  v_expiring_members JSON;
  v_attendance_today_count INT;
BEGIN
  WITH month_ranges AS (
    SELECT
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'total', COALESCE(rev.total, 0),
      'cash', COALESCE(rev.cash, 0),
      'upi', COALESCE(rev.upi, 0),
      'card', COALESCE(rev.card, 0),
      'transactions', COALESCE(rev.transactions, 0),
      'newMembers', COALESCE(rev.new_members, 0)
    ) ORDER BY mr.idx DESC
  ), '[]'::json) INTO v_months
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT
      SUM(amount + admission_fee) AS total,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'cash') AS cash,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'upi') AS upi,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'card') AS card,
      COUNT(*) AS transactions,
      COUNT(DISTINCT member_id) AS new_members
    FROM memberships
    WHERE gym_id = p_gym_id AND start_date >= mr.start_dt AND start_date <= mr.end_dt
  ) rev ON true;

  WITH month_ranges AS (
    SELECT
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'total', COALESCE(inv.total, 0),
      'quantity', COALESCE(inv.quantity, 0)
    ) ORDER BY mr.idx DESC
  ), '[]'::json) INTO v_inventory_sales
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT
      SUM(total_price) AS total,
      SUM(quantity) AS quantity
    FROM inventory_sales
    WHERE gym_id = p_gym_id AND sold_at >= mr.start_dt AND sold_at <= (mr.end_dt + interval '1 day - 1 second')
  ) inv ON true;

  SELECT COALESCE(json_agg(row_to_json(inv_sales)), '[]'::json) INTO v_recent_inventory_sales
  FROM (
    SELECT total_price, quantity, product_name, variant_name, payment_mode, sold_at
    FROM inventory_sales
    WHERE gym_id = p_gym_id
    ORDER BY sold_at DESC
    LIMIT 20
  ) inv_sales;

  WITH latest_memberships AS (
    SELECT DISTINCT ON (m.id)
      m.id AS member_id,
      m.name,
      m.phone,
      m.gender,
      m.age,
      m.area,
      m.pending_amount,
      m.created_at,
      ms.end_date,
      ms.plan
    FROM members m
    LEFT JOIN memberships ms ON ms.member_id = m.id AND ms.gym_id = p_gym_id
    WHERE m.gym_id = p_gym_id
    ORDER BY m.id, ms.created_at DESC
  )
  SELECT
    COUNT(*) FILTER (WHERE end_date < p_today),
    COUNT(*) FILTER (WHERE end_date >= p_today),
    COUNT(*) FILTER (WHERE end_date < p_today),
    json_build_object(
      'monthly', COUNT(*) FILTER (WHERE plan = 'monthly'),
      'quarterly', COUNT(*) FILTER (WHERE plan = 'quarterly'),
      'annual', COUNT(*) FILTER (WHERE plan = 'annual')
    ),
    json_build_object(
      'male', COUNT(*) FILTER (WHERE gender = 'male'),
      'female', COUNT(*) FILTER (WHERE gender = 'female'),
      'other', COUNT(*) FILTER (WHERE gender = 'other'),
      'unknown', COUNT(*) FILTER (WHERE gender IS NULL)
    ),
    json_build_object(
      '<18', COUNT(*) FILTER (WHERE age < 18),
      '18-25', COUNT(*) FILTER (WHERE age >= 18 AND age <= 25),
      '26-35', COUNT(*) FILTER (WHERE age >= 26 AND age <= 35),
      '36-45', COUNT(*) FILTER (WHERE age >= 36 AND age <= 45),
      '46+', COUNT(*) FILTER (WHERE age >= 46),
      'unknown', COUNT(*) FILTER (WHERE age IS NULL)
    ),
    COALESCE(
      json_agg(
        json_build_object(
          'name', name,
          'phone', phone,
          'endDate', end_date,
          'plan', COALESCE(plan, 'None')
        ) ORDER BY end_date ASC
      ) FILTER (WHERE end_date IS NOT NULL), '[]'::json
    )
  INTO
    v_expired_count,
    v_active_count,
    v_churn_count,
    v_plan_counts,
    v_gender_counts,
    v_age_buckets,
    v_expiring_members
  FROM latest_memberships;

  WITH month_ranges AS (
    SELECT
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'count', COALESCE(mem.new_count, 0)
    ) ORDER BY mr.idx DESC
  ), '[]'::json) INTO v_new_members_by_month
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS new_count
    FROM members
    WHERE gym_id = p_gym_id AND created_at >= mr.start_dt AND created_at <= (mr.end_dt + interval '1 day - 1 second')
  ) mem ON true;

  WITH day_names (idx, name) AS (
    VALUES (0, 'Sun'), (1, 'Mon'), (2, 'Tue'), (3, 'Wed'), (4, 'Thu'), (5, 'Fri'), (6, 'Sat')
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'name', dn.name,
      'count', COALESCE(att.cnt, 0)
    ) ORDER BY dn.idx ASC
  ), '[]'::json) INTO v_attendance_by_day
  FROM day_names dn
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM attendance
    WHERE gym_id = p_gym_id AND date >= (p_today - interval '3 months')::date
      AND EXTRACT(DOW FROM date) = dn.idx
  ) att ON true;

  SELECT COUNT(*) INTO v_attendance_today_count
  FROM attendance
  WHERE gym_id = p_gym_id AND date = p_today;

  SELECT COALESCE(json_agg(area_agg), '[]'::json) INTO v_top_areas
  FROM (
    SELECT json_build_object('area', area, 'count', COUNT(*)) AS area_agg
    FROM members
    WHERE gym_id = p_gym_id AND area IS NOT NULL
    GROUP BY area
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) a;

  SELECT
    COALESCE(json_agg(
      json_build_object(
        'name', name,
        'phone', phone,
        'amount', pending_amount
      )
    ), '[]'::json),
    COALESCE(SUM(pending_amount), 0)
  INTO
    v_members_with_dues,
    v_total_dues_amount
  FROM members
  WHERE gym_id = p_gym_id AND pending_amount > 0;

  RETURN json_build_object(
    'months', v_months,
    'inventorySales', v_inventory_sales,
    'recentInventorySales', v_recent_inventory_sales,
    'expiredCount', COALESCE(v_expired_count, 0),
    'activeCount', COALESCE(v_active_count, 0),
    'churnCount', COALESCE(v_churn_count, 0),
    'planCounts', COALESCE(v_plan_counts, '{}'::json),
    'genderCounts', COALESCE(v_gender_counts, '{}'::json),
    'ageBuckets', COALESCE(v_age_buckets, '{}'::json),
    'newMembersByMonth', v_new_members_by_month,
    'attendanceByDay', v_attendance_by_day,
    'topAreas', v_top_areas,
    'membersWithDues', v_members_with_dues,
    'totalDuesAmount', COALESCE(v_total_dues_amount, 0),
    'expiringMembers', v_expiring_members,
    'attendanceTodayCount', COALESCE(v_attendance_today_count, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- ── increment_gym_usage_stat ──────────────────────────────────
CREATE OR REPLACE FUNCTION increment_gym_usage_stat(
  p_gym_id  UUID,
  p_field   TEXT,
  p_amount  INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
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

-- ── record_whatsapp_sent ──────────────────────────────────────
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

-- ── log_subscription_action ───────────────────────────────────
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

-- ── delete_old_whatsapp_webhook_logs ──────────────────────────
CREATE OR REPLACE FUNCTION delete_old_whatsapp_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_webhook_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- ── whatsapp_messages updated_at ─────────────────────────────
CREATE OR REPLACE FUNCTION update_whatsapp_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_messages_updated_at ON whatsapp_messages;
CREATE TRIGGER whatsapp_messages_updated_at
  BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

DROP TRIGGER IF EXISTS gym_whatsapp_config_updated_at ON gym_whatsapp_config;
CREATE TRIGGER gym_whatsapp_config_updated_at
  BEFORE UPDATE ON gym_whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ── usage stats: memberships ─────────────────────────────────
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

-- ── usage stats: members ─────────────────────────────────────
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

-- ── usage stats: attendance ──────────────────────────────────
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

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW whatsapp_conversations AS
SELECT
  gym_id,
  from_number AS contact_number,
  MAX(created_at) AS last_message_at,
  COUNT(*) AS message_count,
  COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound_count,
  COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound_count,
  COUNT(*) FILTER (WHERE status = 'read') AS read_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM whatsapp_messages
WHERE direction = 'inbound'
GROUP BY gym_id, from_number
ORDER BY last_message_at DESC;

COMMENT ON VIEW whatsapp_conversations IS 'Aggregated view of conversations by contact';

-- ============================================================
-- REALTIME PUBLICATIONS
-- ============================================================

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'gyms',
    'subscription_requests',
    'admin_messages',
    'support_tickets',
    'whatsapp_messages',
    'whatsapp_automation_logs',
    'whatsapp_send_queue'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;

-- Admin web/mobile use custom application sessions rather than Supabase Auth.
-- Database triggers therefore emit payload-free public invalidation hints;
-- clients treat them as untrusted and re-fetch through authenticated APIs.
-- https://supabase.com/docs/guides/realtime/broadcast#broadcast-from-the-database
CREATE OR REPLACE FUNCTION public.broadcast_admin_realtime_invalidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_topic TEXT;
BEGIN
  FOREACH v_topic IN ARRAY TG_ARGV
  LOOP
    BEGIN
      PERFORM realtime.send('{}'::jsonb, 'invalidate', v_topic, false);
    EXCEPTION WHEN OTHERS THEN
      -- Never roll back authoritative data because Realtime is unavailable.
      RAISE WARNING 'Realtime invalidation failed for topic %: %', v_topic, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_admin_realtime_invalidation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_admin_gyms ON public.gyms;
CREATE TRIGGER trg_realtime_admin_gyms
  AFTER INSERT OR UPDATE OR DELETE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:gyms', 'admin:subscriptions'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_requests ON public.subscription_requests;
CREATE TRIGGER trg_realtime_admin_subscription_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:subscriptions', 'admin:gyms'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_support_tickets ON public.support_tickets;
CREATE TRIGGER trg_realtime_admin_support_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:support');

DROP TRIGGER IF EXISTS trg_realtime_admin_messages ON public.admin_messages;
CREATE TRIGGER trg_realtime_admin_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:support');

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_audit ON public.subscription_audit_logs;
CREATE TRIGGER trg_realtime_admin_subscription_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:activity');

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_logs ON public.whatsapp_automation_logs;
CREATE TRIGGER trg_realtime_admin_whatsapp_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_automation_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:activity');

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_messages ON public.whatsapp_messages;
CREATE TRIGGER trg_realtime_admin_whatsapp_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:activity');

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_queue ON public.whatsapp_send_queue;
CREATE TRIGGER trg_realtime_admin_whatsapp_queue
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_send_queue
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:activity');

DROP TRIGGER IF EXISTS trg_realtime_admin_member_activity ON public.members;
CREATE TRIGGER trg_realtime_admin_member_activity
  AFTER INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:activity');

DROP POLICY IF EXISTS "gym owners receive tenant realtime invalidations"
  ON realtime.messages;
CREATE POLICY "gym owners receive tenant realtime invalidations"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND split_part((SELECT realtime.topic()), ':', 1) = 'gym'
    AND split_part((SELECT realtime.topic()), ':', 3) IN ('support', 'subscription')
    AND EXISTS (
      SELECT 1
      FROM public.gyms
      WHERE public.gyms.id::text = split_part((SELECT realtime.topic()), ':', 2)
        AND public.gyms.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.broadcast_owner_delete_invalidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record JSONB;
  v_gym_id TEXT;
  v_scope TEXT;
  v_topic TEXT;
BEGIN
  v_record := to_jsonb(OLD);
  v_gym_id := COALESCE(v_record ->> 'gym_id', v_record ->> 'id');
  IF v_gym_id IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_scope IN ARRAY TG_ARGV
  LOOP
    v_topic := format('gym:%s:%s', v_gym_id, v_scope);
    BEGIN
      PERFORM realtime.send('{}'::jsonb, 'invalidate', v_topic, true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Private Realtime invalidation failed for topic %: %', v_topic, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_owner_delete_invalidation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_admin_message ON public.admin_messages;
CREATE TRIGGER trg_realtime_owner_deleted_admin_message
  AFTER DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_realtime_owner_deleted_support_ticket
  AFTER DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_subscription_request ON public.subscription_requests;
CREATE TRIGGER trg_realtime_owner_deleted_subscription_request
  AFTER DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('subscription');

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('payment-proofs', 'payment-proofs', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "gym owner upload payment proof" ON storage.objects;
CREATE POLICY "gym owner upload payment proof"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "gym owner read own payment proofs" ON storage.objects;
CREATE POLICY "gym owner read own payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- SEED: Backfill usage stats for existing gyms
-- ============================================================

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

-- ============================================================
-- REVOKE EXECUTE from anon where appropriate
-- ============================================================

REVOKE EXECUTE ON FUNCTION get_gym_dashboard(UUID, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION get_gym_reports(UUID, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_inventory_stock(UUID, INTEGER) FROM anon;

-- ============================================================
-- END OF SCHEMA
-- ============================================================

-- Member PWA M0: auth identity linkage and read-only self access.
-- This migration is additive and does not alter existing owner policies.

BEGIN;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS member_code TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_blood_group_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_blood_group_check
      CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_auth_user_id_unique
  ON public.members(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_email_lower
  ON public.members(LOWER(email))
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_gym_member_code_unique
  ON public.members(gym_id, member_code)
  WHERE member_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_member_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number TEXT := NEW.member_number::TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.member_code := 'GF-' || LPAD(v_number, GREATEST(5, LENGTH(v_number)), '0');
  ELSIF NEW.member_number IS DISTINCT FROM OLD.member_number
     OR NEW.member_code IS NULL
     OR BTRIM(NEW.member_code) = '' THEN
    NEW.member_code := 'GF-' || LPAD(v_number, GREATEST(5, LENGTH(v_number)), '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_member_code ON public.members;
CREATE TRIGGER trg_generate_member_code
  BEFORE INSERT OR UPDATE OF member_number, member_code ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.generate_member_code();

UPDATE public.members
SET member_code = 'GF-' || LPAD(
  member_number::TEXT,
  GREATEST(5, LENGTH(member_number::TEXT)),
  '0'
)
WHERE member_code IS NULL OR BTRIM(member_code) = '';

-- auth_user_id is an authorization boundary. Existing owner RLS permits row
-- updates, so only trusted server workflows may create or change this link.
CREATE OR REPLACE FUNCTION public.guard_member_auth_user_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_role TEXT := COALESCE(auth.role(), '');
  v_link_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_link_changed := NEW.auth_user_id IS NOT NULL;
  ELSE
    v_link_changed := NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id;
  END IF;

  IF v_link_changed
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND v_auth_role <> 'service_role' THEN
    RAISE EXCEPTION 'member auth identity can only be linked by a trusted server workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_insert ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_insert
  BEFORE INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_update ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_update
  BEFORE UPDATE OF auth_user_id ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own profile" ON public.members;
CREATE POLICY "Members can view their own profile"
  ON public.members FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

-- A definer helper avoids recursive RLS evaluation between members and gyms.
-- It returns only the caller's own tenant ID and accepts no user-controlled ID.
CREATE OR REPLACE FUNCTION public.current_member_gym_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT gym_id
  FROM public.members
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_member_gym_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_gym_id() TO authenticated;

-- Needed for the member shell to read its own gym branding. This does not
-- expose gyms outside the linked member's tenant.
DROP POLICY IF EXISTS "Members can view their gym" ON public.gyms;
CREATE POLICY "Members can view their gym"
  ON public.gyms FOR SELECT
  TO authenticated
  USING (id = public.current_member_gym_id());

COMMENT ON COLUMN public.members.auth_user_id IS
  'Supabase Auth identity for Member PWA access. Set only by trusted owner/server workflows.';
COMMENT ON COLUMN public.members.member_code IS
  'Human-readable gym-scoped display code; never use for authorization.';

COMMIT;

-- ############################################################
-- PART 2 — MIGRATIONS (chronological)
-- ############################################################

-- ============================================================
-- MIGRATION: add_inventory_units_table.sql
-- ============================================================

-- ================================================
-- INVENTORY UNITS (Serialized Tracking)
-- ================================================

CREATE TABLE IF NOT EXISTS inventory_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'expired', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, barcode)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_units_gym_id ON inventory_units(gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_inventory_id ON inventory_units(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_barcode ON inventory_units(gym_id, barcode);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;

-- INVENTORY_UNITS policies
DROP POLICY IF EXISTS "Gym owners can view their inventory units" ON inventory_units;
CREATE POLICY "Gym owners can view their inventory units"
  ON inventory_units FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can insert inventory units" ON inventory_units;
CREATE POLICY "Gym owners can insert inventory units"
  ON inventory_units FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can update inventory units" ON inventory_units;
CREATE POLICY "Gym owners can update inventory units"
  ON inventory_units FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can delete inventory units" ON inventory_units;
CREATE POLICY "Gym owners can delete inventory units"
  ON inventory_units FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

-- ================================================
-- FUNCTIONS
-- ================================================

CREATE OR REPLACE FUNCTION increment_inventory_stock(p_inventory_id UUID, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory
  SET initial_stock = GREATEST(0, initial_stock + amount),
      updated_at = NOW()
  WHERE id = p_inventory_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- ============================================================
-- MIGRATION: add_workout_programs.sql
-- ============================================================

-- ================================================
-- WORKOUT PROGRAMS
-- ================================================
-- Idempotent: safe to re-run. Policies are dropped before creation because
-- CREATE POLICY has no IF NOT EXISTS form, and re-running previously aborted
-- this migration with "policy already exists".

CREATE TABLE IF NOT EXISTS workout_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT,
  notes TEXT,
  duration INTEGER NOT NULL,
  frequency INTEGER,
  difficulty TEXT,
  goal TEXT,
  category TEXT,
  equipment TEXT,
  target_audience TEXT,
  experience_level TEXT,
  schedule JSONB NOT NULL,
  is_draft BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_programs_gym_id ON workout_programs(gym_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_created ON workout_programs(gym_id, created_at DESC);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view their programs" ON workout_programs;
CREATE POLICY "Gym owners can view their programs"
  ON workout_programs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can insert programs" ON workout_programs;
CREATE POLICY "Gym owners can insert programs"
  ON workout_programs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can update programs" ON workout_programs;
CREATE POLICY "Gym owners can update programs"
  ON workout_programs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can delete programs" ON workout_programs;
CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

-- ============================================================
-- MIGRATION: 20260612_dashboard_rpc.sql
-- ============================================================

-- Migration: Add dashboard RPC function

CREATE OR REPLACE FUNCTION get_gym_dashboard(p_gym_id UUID, p_today DATE)
RETURNS JSON AS $$
DECLARE
  v_total_active INT;
  v_expiring_this_week INT;
  v_expired_count INT;
  v_today_attendance INT;
  v_today_collection NUMERIC;
  v_total_dues NUMERIC;
  v_expiring_members JSON;
BEGIN
  -- 1. Attendance today
  SELECT COUNT(*) INTO v_today_attendance
  FROM attendance
  WHERE gym_id = p_gym_id AND date = p_today;

  -- 2. Today's collection
  SELECT COALESCE(SUM(amount + admission_fee), 0) INTO v_today_collection
  FROM memberships
  WHERE gym_id = p_gym_id AND start_date = p_today;

  -- 3. Total dues
  SELECT COALESCE(SUM(pending_amount), 0) INTO v_total_dues
  FROM members
  WHERE gym_id = p_gym_id AND pending_amount > 0;

  -- 4. Member Statuses & Expiring Members
  -- We use a CTE to get the latest membership for each member
  WITH latest_memberships AS (
    SELECT 
      m.id AS member_id,
      m.name,
      m.phone,
      m.member_number,
      ms.end_date,
      ms.id AS membership_id,
      ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY ms.created_at DESC) as rn
    FROM members m
    LEFT JOIN memberships ms ON ms.member_id = m.id
    WHERE m.gym_id = p_gym_id
  ),
  member_statuses AS (
    SELECT 
      member_id,
      name,
      phone,
      member_number,
      end_date,
      CASE 
        WHEN end_date IS NULL THEN 'expired'
        WHEN end_date < p_today THEN 'expired'
        WHEN end_date >= p_today AND end_date <= (p_today + INTERVAL '7 days')::DATE THEN 'expiring'
        ELSE 'active'
      END as status,
      (end_date - p_today) as days_remaining
    FROM latest_memberships
    WHERE rn = 1
  )
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('active', 'expiring'))::INT,
    COUNT(*) FILTER (WHERE status = 'expiring')::INT,
    COUNT(*) FILTER (WHERE status = 'expired')::INT,
    COALESCE(
      json_agg(
        json_build_object(
          'id', member_id,
          'name', name,
          'phone', phone,
          'member_number', member_number,
          'status', status,
          'days_remaining', days_remaining,
          'latest_membership', json_build_object('end_date', end_date)
        ) ORDER BY days_remaining ASC
      ) FILTER (WHERE status = 'expiring'), 
      '[]'::json
    )
  INTO 
    v_total_active, 
    v_expiring_this_week, 
    v_expired_count,
    v_expiring_members
  FROM member_statuses;

  RETURN json_build_object(
    'stats', json_build_object(
      'total_active', COALESCE(v_total_active, 0),
      'expiring_this_week', COALESCE(v_expiring_this_week, 0),
      'expired_count', COALESCE(v_expired_count, 0),
      'today_attendance', COALESCE(v_today_attendance, 0),
      'today_collection', COALESCE(v_today_collection, 0),
      'total_dues', COALESCE(v_total_dues, 0)
    ),
    'expiringMembers', v_expiring_members
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- ============================================================
-- MIGRATION: 20260612_reports_rpc.sql
-- ============================================================

-- Migration: Create get_gym_reports RPC

CREATE OR REPLACE FUNCTION get_gym_reports(p_gym_id UUID, p_today DATE)
RETURNS JSON AS $$
DECLARE
  v_months JSON;
  v_inventory_sales JSON;
  v_recent_inventory_sales JSON;
  v_expired_count INT;
  v_active_count INT;
  v_churn_count INT;
  v_plan_counts JSON;
  v_gender_counts JSON;
  v_age_buckets JSON;
  v_new_members_by_month JSON;
  v_attendance_by_day JSON;
  v_top_areas JSON;
  v_members_with_dues JSON;
  v_total_dues_amount NUMERIC;
  v_expiring_members JSON;
  v_attendance_today_count INT;
BEGIN
  -- 1. Generate 6-month ranges
  -- We'll use a temporary table or just CTEs within queries. 
  -- Since we need it across multiple queries, let's create a temp table to make it cleaner,
  -- or just calculate the boundaries.
  
  -- Monthly Revenue (months)
  WITH month_ranges AS (
    SELECT 
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'total', COALESCE(rev.total, 0),
      'cash', COALESCE(rev.cash, 0),
      'upi', COALESCE(rev.upi, 0),
      'card', COALESCE(rev.card, 0),
      'transactions', COALESCE(rev.transactions, 0),
      'newMembers', COALESCE(rev.new_members, 0)
    ) ORDER BY mr.idx DESC -- We want oldest first (idx 5 down to 0)
  ), '[]'::json) INTO v_months
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT 
      SUM(amount + admission_fee) AS total,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'cash') AS cash,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'upi') AS upi,
      SUM(amount + admission_fee) FILTER (WHERE payment_mode = 'card') AS card,
      COUNT(*) AS transactions,
      COUNT(DISTINCT member_id) AS new_members
    FROM memberships
    WHERE gym_id = p_gym_id AND start_date >= mr.start_dt AND start_date <= mr.end_dt
  ) rev ON true;

  -- Monthly Inventory Sales
  WITH month_ranges AS (
    SELECT 
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'total', COALESCE(inv.total, 0),
      'quantity', COALESCE(inv.quantity, 0)
    ) ORDER BY mr.idx DESC
  ), '[]'::json) INTO v_inventory_sales
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT 
      SUM(total_price) AS total,
      SUM(quantity) AS quantity
    FROM inventory_sales
    WHERE gym_id = p_gym_id AND sold_at >= mr.start_dt AND sold_at <= (mr.end_dt + interval '1 day - 1 second')
  ) inv ON true;

  -- Recent Inventory Sales (Last 20)
  SELECT COALESCE(json_agg(row_to_json(inv_sales)), '[]'::json) INTO v_recent_inventory_sales
  FROM (
    SELECT total_price, quantity, product_name, variant_name, payment_mode, sold_at
    FROM inventory_sales
    WHERE gym_id = p_gym_id
    ORDER BY sold_at DESC
    LIMIT 20
  ) inv_sales;

  -- Latest Memberships & Member Statuses
  -- Using a CTE for latest membership per member
  WITH latest_memberships AS (
    SELECT DISTINCT ON (m.id)
      m.id AS member_id,
      m.name,
      m.phone,
      m.gender,
      m.age,
      m.area,
      m.pending_amount,
      m.created_at,
      ms.end_date,
      ms.plan
    FROM members m
    LEFT JOIN memberships ms ON ms.member_id = m.id AND ms.gym_id = p_gym_id
    WHERE m.gym_id = p_gym_id
    ORDER BY m.id, ms.created_at DESC
  )
  SELECT 
    COUNT(*) FILTER (WHERE end_date < p_today),
    COUNT(*) FILTER (WHERE end_date >= p_today),
    COUNT(*) FILTER (WHERE end_date < p_today), -- Churn is same as expired currently
    json_build_object(
      'monthly', COUNT(*) FILTER (WHERE plan = 'monthly'),
      'quarterly', COUNT(*) FILTER (WHERE plan = 'quarterly'),
      'annual', COUNT(*) FILTER (WHERE plan = 'annual')
    ),
    json_build_object(
      'male', COUNT(*) FILTER (WHERE gender = 'male'),
      'female', COUNT(*) FILTER (WHERE gender = 'female'),
      'other', COUNT(*) FILTER (WHERE gender = 'other'),
      'unknown', COUNT(*) FILTER (WHERE gender IS NULL)
    ),
    json_build_object(
      '<18', COUNT(*) FILTER (WHERE age < 18),
      '18-25', COUNT(*) FILTER (WHERE age >= 18 AND age <= 25),
      '26-35', COUNT(*) FILTER (WHERE age >= 26 AND age <= 35),
      '36-45', COUNT(*) FILTER (WHERE age >= 36 AND age <= 45),
      '46+', COUNT(*) FILTER (WHERE age >= 46),
      'unknown', COUNT(*) FILTER (WHERE age IS NULL)
    ),
    COALESCE(
      json_agg(
        json_build_object(
          'name', name,
          'phone', phone,
          'endDate', end_date,
          'plan', COALESCE(plan, 'None')
        ) ORDER BY end_date ASC
      ) FILTER (WHERE end_date IS NOT NULL), '[]'::json
    )
  INTO 
    v_expired_count,
    v_active_count,
    v_churn_count,
    v_plan_counts,
    v_gender_counts,
    v_age_buckets,
    v_expiring_members
  FROM latest_memberships;

  -- New Members By Month (Using same 6 month logic)
  WITH month_ranges AS (
    SELECT 
      (date_trunc('month', p_today - (i || ' months')::interval))::date AS start_dt,
      (date_trunc('month', p_today - (i || ' months')::interval) + interval '1 month - 1 day')::date AS end_dt,
      to_char(p_today - (i || ' months')::interval, 'Mon YYYY') AS label,
      i AS idx
    FROM generate_series(0, 5) AS i
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'label', mr.label,
      'count', COALESCE(mem.new_count, 0)
    ) ORDER BY mr.idx DESC
  ), '[]'::json) INTO v_new_members_by_month
  FROM month_ranges mr
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS new_count
    FROM members
    WHERE gym_id = p_gym_id AND created_at >= mr.start_dt AND created_at <= (mr.end_dt + interval '1 day - 1 second')
  ) mem ON true;

  -- Attendance By Day (Last 3 months)
  WITH day_names (idx, name) AS (
    VALUES (0, 'Sun'), (1, 'Mon'), (2, 'Tue'), (3, 'Wed'), (4, 'Thu'), (5, 'Fri'), (6, 'Sat')
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'name', dn.name,
      'count', COALESCE(att.cnt, 0)
    ) ORDER BY dn.idx ASC
  ), '[]'::json) INTO v_attendance_by_day
  FROM day_names dn
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM attendance
    WHERE gym_id = p_gym_id AND date >= (p_today - interval '3 months')::date
      AND EXTRACT(DOW FROM date) = dn.idx
  ) att ON true;

  -- Attendance Today Count
  SELECT COUNT(*) INTO v_attendance_today_count
  FROM attendance
  WHERE gym_id = p_gym_id AND date = p_today;

  -- Top 5 Areas (Changed to Top 10 in JS previously, let's keep Top 10)
  SELECT COALESCE(json_agg(area_agg), '[]'::json) INTO v_top_areas
  FROM (
    SELECT json_build_object('area', area, 'count', COUNT(*)) AS area_agg
    FROM members
    WHERE gym_id = p_gym_id AND area IS NOT NULL
    GROUP BY area
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) a;

  -- Dues Analytics
  SELECT 
    COALESCE(json_agg(
      json_build_object(
        'name', name,
        'phone', phone,
        'amount', pending_amount
      )
    ), '[]'::json),
    COALESCE(SUM(pending_amount), 0)
  INTO 
    v_members_with_dues,
    v_total_dues_amount
  FROM members
  WHERE gym_id = p_gym_id AND pending_amount > 0;

  -- Return final JSON
  RETURN json_build_object(
    'months', v_months,
    'inventorySales', v_inventory_sales,
    'recentInventorySales', v_recent_inventory_sales,
    'expiredCount', COALESCE(v_expired_count, 0),
    'activeCount', COALESCE(v_active_count, 0),
    'churnCount', COALESCE(v_churn_count, 0),
    'planCounts', COALESCE(v_plan_counts, '{}'::json),
    'genderCounts', COALESCE(v_gender_counts, '{}'::json),
    'ageBuckets', COALESCE(v_age_buckets, '{}'::json),
    'newMembersByMonth', v_new_members_by_month,
    'attendanceByDay', v_attendance_by_day,
    'topAreas', v_top_areas,
    'membersWithDues', v_members_with_dues,
    'totalDuesAmount', COALESCE(v_total_dues_amount, 0),
    'expiringMembers', v_expiring_members,
    'attendanceTodayCount', COALESCE(v_attendance_today_count, 0)
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- MIGRATION: 20260624120000_fix_supabase_linter_warnings.sql
-- ============================================================

-- Fix Supabase database linter warnings
-- 1. Change SECURITY DEFINER to SECURITY INVOKER
-- 2. Set search_path = '' for functions to prevent search path mutation
-- 3. Revoke EXECUTE from anon role for these functions

ALTER FUNCTION get_gym_dashboard(UUID, DATE) SECURITY INVOKER SET search_path = '';
ALTER FUNCTION get_gym_reports(UUID, DATE) SECURITY INVOKER SET search_path = '';
ALTER FUNCTION increment_inventory_stock(UUID, INTEGER) SECURITY INVOKER SET search_path = '';

-- Handle rls_auto_enable if it exists (wrap in DO block to avoid errors if missing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
    ALTER FUNCTION rls_auto_enable() SECURITY INVOKER SET search_path = '';
    REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM anon;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION get_gym_dashboard(UUID, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION get_gym_reports(UUID, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_inventory_stock(UUID, INTEGER) FROM anon;

-- ============================================================
-- MIGRATION: 20260624121000_add_membership_category.sql
-- ============================================================

-- Migration: Add Category to Memberships
-- Purpose: Support 'strength', 'cardio', or 'both' for memberships.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('strength', 'cardio', 'both')) DEFAULT 'both';

-- ============================================================
-- MIGRATION: 20260624_security_fixes.sql
-- ============================================================

-- Migration: Security Fixes

-- Fix: Add ownership check to increment_inventory_stock
CREATE OR REPLACE FUNCTION increment_inventory_stock(p_inventory_id UUID, amount INTEGER)
RETURNS VOID AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM inventory WHERE id = p_inventory_id;
  IF NOT EXISTS (SELECT 1 FROM gyms WHERE id = v_gym_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE inventory
  SET initial_stock = GREATEST(0, initial_stock + amount),
      updated_at = NOW()
  WHERE id = p_inventory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- MIGRATION: 20260625000000_audit_fixes.sql
-- ============================================================

-- Add missing indexes to optimize report aggregations and window functions
CREATE INDEX IF NOT EXISTS idx_memberships_member_created ON memberships(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_gym_created ON members(gym_id, created_at DESC);

-- Add missing UPDATE policy on inventory_sales
DROP POLICY IF EXISTS "Gym owners can update inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can update inventory sales"
  ON inventory_sales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

-- ============================================================
-- MIGRATION: 20260613_attendance_checkout.sql
-- ============================================================

-- Migration: Add check_out_time to attendance

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ;

-- ============================================================
-- MIGRATION: 20260614_attendance_sessions.sql
-- ============================================================

-- ================================================
-- [Migration 15] Add session tracking to Attendance
-- ================================================

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS session TEXT CHECK (session IN ('morning', 'evening')) DEFAULT 'morning';

-- Drop the old unique constraint (member_id, date)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_member_id_date_key;

-- Add the new unique constraint (member_id, date, session)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_member_id_date_session_key;
ALTER TABLE attendance ADD CONSTRAINT attendance_member_id_date_session_key UNIQUE (member_id, date, session);

-- ============================================================
-- MIGRATION: 20260625140600_attendance_update_rls.sql
-- ============================================================

-- Migration: Add update policy for attendance

DROP POLICY IF EXISTS "Gym owners can update attendance" ON attendance;
CREATE POLICY "Gym owners can update attendance"
  ON attendance FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  );

-- ============================================================
-- MIGRATION: 20260625150000_admin_messages.sql
-- ============================================================

-- Admin Messages Table
-- Super admin can send messages/support notes to gym owners.
-- Gym owners read them via their notifications page.

CREATE TABLE IF NOT EXISTS admin_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by TEXT NOT NULL DEFAULT 'super_admin',
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by gym
CREATE INDEX IF NOT EXISTS idx_admin_messages_gym_id ON admin_messages(gym_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON admin_messages(created_at DESC);

-- Enable RLS
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;

-- Gym owners can only read their own messages
DROP POLICY IF EXISTS "Gym owners can read their admin messages" ON admin_messages;
CREATE POLICY "Gym owners can read their admin messages"
  ON admin_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

-- Gym owners can mark messages as read (update read_at only)
DROP POLICY IF EXISTS "Gym owners can mark messages as read" ON admin_messages;
CREATE POLICY "Gym owners can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

-- Only service_role (super admin) can insert messages (RLS bypassed for service role)
-- No INSERT policy needed — service role bypasses RLS by default

-- ============================================================
-- MIGRATION: 20260625160000_gym_deactivation.sql
-- ============================================================

-- 1. Add is_active column to gyms table
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Create an RPC function to safely check a gym's active status by email
-- This uses SECURITY DEFINER so it can query the gyms table (and auth.users) without the user needing to be logged in.
CREATE OR REPLACE FUNCTION check_gym_active(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_owner_id UUID;
  v_is_active BOOLEAN;
BEGIN
  -- Find the user ID for this email from auth.users
  SELECT id INTO v_owner_id FROM auth.users WHERE email = p_email LIMIT 1;
  
  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Find the gym for this user
  SELECT is_active INTO v_is_active FROM public.gyms WHERE owner_id = v_owner_id LIMIT 1;
  
  IF v_is_active IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN v_is_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- MIGRATION: 20260625161500_support_tickets.sql
-- ============================================================

-- ================================================
-- [Migration 16] Support Tickets
-- ================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('query', 'issue', 'bug', 'high_priority')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_gym_id ON support_tickets(gym_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view their support tickets" ON support_tickets;
CREATE POLICY "Gym owners can view their support tickets"
  ON support_tickets FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can insert support tickets" ON support_tickets;
CREATE POLICY "Gym owners can insert support tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid())
  );

-- ============================================================
-- MIGRATION: 20260625162500_realtime_support.sql
-- ============================================================

-- ================================================
-- [Migration 17] Enable Realtime for Support & Messages
-- ================================================

-- Add tables to the supabase_realtime publication to enable WebSocket broadcasting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;
  END IF;
END $$;

-- ============================================================
-- MIGRATION: 20260626010000_add_clear_flags.sql
-- ============================================================

-- Add clear/soft-delete flags to admin_messages and support_tickets

-- Admin messages
ALTER TABLE admin_messages 
ADD COLUMN IF NOT EXISTS is_cleared_by_owner BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_cleared_by_admin BOOLEAN DEFAULT false;

-- Support tickets
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS is_cleared_by_owner BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_cleared_by_admin BOOLEAN DEFAULT false;

-- ============================================================
-- MIGRATION: 20260627_perf_indexes.sql
-- ============================================================

-- Performance indexes for Issues 8 & 9 from the 27 June 2026 production audit.
-- Run: supabase db push

-- Issue 8: Compound index for the most common attendance query pattern.
-- Both dashboard RPC and attendance page query: WHERE gym_id = ? AND date = ?
-- A compound index allows an index-only scan instead of two separate single-column index scans.
CREATE INDEX IF NOT EXISTS idx_attendance_gym_date
  ON attendance(gym_id, date);

-- Issue 9: Compound index for membership expiry status queries.
-- The idx_memberships_end_date single-column index has no gym_id, meaning it covers all gyms.
-- When the query planner uses it for a gym-scoped query, it must re-filter by gym_id after the scan.
-- This compound index enables an index-only scan for the dashboard RPC and expiring members logic.
CREATE INDEX IF NOT EXISTS idx_memberships_gym_end_date
  ON memberships(gym_id, end_date);

-- Bonus: Partial index for dues queries — only indexes rows that actually have outstanding dues.
-- This makes the "Total Dues" dashboard stat query significantly faster on large datasets.
CREATE INDEX IF NOT EXISTS idx_members_gym_dues
  ON members(gym_id, pending_amount)
  WHERE pending_amount > 0;

-- ============================================================
-- MIGRATION: 20250704_create_whatsapp_tables.sql
-- ============================================================

-- WhatsApp Cloud API Database Schema
-- 
-- Tables for storing WhatsApp messages, statuses, and webhook logs.
-- Optimized for high-throughput webhook processing.

-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp Messages Table
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Message identification
  message_id TEXT NOT NULL UNIQUE, -- WhatsApp message ID
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  
  -- Phone numbers
  phone_number_id TEXT NOT NULL, -- WhatsApp Business Phone Number ID
  from_number TEXT NOT NULL, -- Sender phone number (E.164 format)
  to_number TEXT NOT NULL, -- Recipient phone number (E.164 format)
  
  -- Message metadata
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL, -- text, image, video, audio, document, etc.
  
  -- Content
  content TEXT, -- Text content or caption
  media_id TEXT, -- WhatsApp media ID
  media_type TEXT, -- MIME type
  media_url TEXT, -- Downloaded media URL (S3, Supabase Storage, etc.)
  caption TEXT, -- Media caption
  
  -- Status tracking
  status TEXT CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'deleted')),
  conversation_id TEXT, -- WhatsApp conversation ID
  context_message_id TEXT, -- ID of message being replied to
  
  -- Additional data
  metadata JSONB DEFAULT '{}'::JSONB, -- Flexible storage for message-specific data
  
  -- Error tracking
  error_code INTEGER,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_id ON whatsapp_messages(gym_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number_id ON whatsapp_messages(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_number ON whatsapp_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_id ON whatsapp_messages(conversation_id) WHERE conversation_id IS NOT NULL;

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_created ON whatsapp_messages(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_from ON whatsapp_messages(gym_id, from_number, created_at DESC);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_whatsapp_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_messages_updated_at ON whatsapp_messages;
CREATE TRIGGER whatsapp_messages_updated_at
  BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp Webhook Logs Table
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request identification
  request_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  
  -- Event metadata
  event_type TEXT NOT NULL CHECK (event_type IN ('message', 'status', 'error', 'unknown')),
  payload JSONB NOT NULL, -- Full webhook payload for debugging
  
  -- Processing metadata
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  processing_time_ms INTEGER,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for webhook logs
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_request_id ON whatsapp_webhook_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_phone_number_id ON whatsapp_webhook_logs(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_event_type ON whatsapp_webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_created_at ON whatsapp_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_processed ON whatsapp_webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_signature_valid ON whatsapp_webhook_logs(signature_valid);

-- Auto-delete old webhook logs (keep last 7 days)
CREATE OR REPLACE FUNCTION delete_old_whatsapp_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_webhook_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════════════════
-- Gym WhatsApp Configuration Table
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gym_whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  gym_id UUID NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,
  
  -- WhatsApp Business Account configuration
  phone_number_id TEXT NOT NULL UNIQUE, -- WhatsApp Business Phone Number ID
  phone_number TEXT NOT NULL, -- Display phone number (E.164 format)
  business_account_id TEXT NOT NULL, -- WhatsApp Business Account ID
  
  -- Configuration
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_reply_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_gym_id ON gym_whatsapp_config(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_phone_number_id ON gym_whatsapp_config(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_enabled ON gym_whatsapp_config(enabled);

-- Updated timestamp trigger
DROP TRIGGER IF EXISTS gym_whatsapp_config_updated_at ON gym_whatsapp_config;
CREATE TRIGGER gym_whatsapp_config_updated_at
  BEFORE UPDATE ON gym_whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ════════════════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Messages: Gym owners can only see their own messages
DROP POLICY IF EXISTS whatsapp_messages_select_policy ON whatsapp_messages;
CREATE POLICY whatsapp_messages_select_policy ON whatsapp_messages
  FOR SELECT
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_messages_insert_policy ON whatsapp_messages;
CREATE POLICY whatsapp_messages_insert_policy ON whatsapp_messages
  FOR INSERT
  WITH CHECK (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_messages_update_policy ON whatsapp_messages;
CREATE POLICY whatsapp_messages_update_policy ON whatsapp_messages
  FOR UPDATE
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

-- Webhook logs: Only accessible via service role (admin only)
DROP POLICY IF EXISTS whatsapp_webhook_logs_admin_policy ON whatsapp_webhook_logs;
CREATE POLICY whatsapp_webhook_logs_admin_policy ON whatsapp_webhook_logs
  FOR ALL
  USING (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' = 'service_role');

-- Config: Gym owners can manage their own config
DROP POLICY IF EXISTS gym_whatsapp_config_select_policy ON gym_whatsapp_config;
CREATE POLICY gym_whatsapp_config_select_policy ON gym_whatsapp_config
  FOR SELECT
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS gym_whatsapp_config_update_policy ON gym_whatsapp_config;
CREATE POLICY gym_whatsapp_config_update_policy ON gym_whatsapp_config
  FOR UPDATE
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Helpful Views
-- ════════════════════════════════════════════════════════════════════════════

-- View for conversation threads
CREATE OR REPLACE VIEW whatsapp_conversations AS
SELECT 
  gym_id,
  from_number AS contact_number,
  MAX(created_at) AS last_message_at,
  COUNT(*) AS message_count,
  COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound_count,
  COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound_count,
  COUNT(*) FILTER (WHERE status = 'read') AS read_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM whatsapp_messages
WHERE direction = 'inbound'
GROUP BY gym_id, from_number
ORDER BY last_message_at DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- Comments for documentation
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE whatsapp_messages IS 'Stores all WhatsApp messages (inbound and outbound)';
COMMENT ON TABLE whatsapp_webhook_logs IS 'Logs all webhook events for debugging and monitoring';
COMMENT ON TABLE gym_whatsapp_config IS 'WhatsApp Business configuration per gym';
COMMENT ON VIEW whatsapp_conversations IS 'Aggregated view of conversations by contact';

-- ============================================================
-- MIGRATION: 20260705_whatsapp_automation.sql
-- ============================================================

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
DROP POLICY IF EXISTS wa_auto_logs_select ON whatsapp_automation_logs;
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

-- ============================================================
-- MIGRATION: 20260706_whatsapp_automation_hardening.sql
-- ============================================================

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
-- Uses timezone('UTC', sent_at)::date — TIMESTAMPTZ::date is not immutable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_auto_logs_daily_dedup_sent
  ON whatsapp_automation_logs (member_id, template_name, (timezone('UTC', sent_at)::date))
  WHERE status = 'sent';

-- Composite index to resolve "the current cycle for this member+template"
-- quickly (latest row by sent_at within a member+template).
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_member_template_sent
  ON whatsapp_automation_logs (member_id, template_name, sent_at DESC);

COMMENT ON INDEX idx_wa_auto_logs_daily_dedup_sent
  IS 'Prevents more than one actual send (status=sent) per member+template+day. '
     'Cancelled/failed/skipped rows are intentionally excluded so a cycle can be '
     'cancelled on the same day a reminder was sent.';

-- ============================================================
-- MIGRATION: 20260708_drop_phone_unique_constraint.sql
-- ============================================================

-- Allow duplicate phone numbers across members within the same gym.
-- Family members, shared phones, and walk-in registrations are common scenarios.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_gym_id_phone_key;

-- ============================================================
-- MIGRATION: 20260712_members_is_imported.sql
-- ============================================================

-- Migration: mark members created via Excel/CSV import.
--
-- Imported members behave exactly like manually created members EXCEPT they
-- must never receive the `_gymflow_welcome_member` template (they are existing
-- gym members, not new registrations). This flag lets the UI suppress the
-- welcome template for them. Manually created members default to false.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN members.is_imported
  IS 'True for members created via Excel/CSV import. Suppresses the _gymflow_welcome_member template; all other automations behave identically.';

-- ============================================================
-- MIGRATION: 20260713_whatsapp_send_queue.sql
-- ============================================================

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
DROP POLICY IF EXISTS wa_queue_select ON whatsapp_send_queue;
CREATE POLICY wa_queue_select ON whatsapp_send_queue
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

COMMENT ON TABLE whatsapp_send_queue
  IS 'Throttled outbound queue for automated WhatsApp sends (5 per 5 minutes, drained via QStash).';

-- ============================================================
-- MIGRATION: add_subscription.sql
-- ============================================================

-- =============================================================
  -- GymFlow — Subscription & 14-Day Trial Migration (safe to re-run)
  -- Paste into Supabase Dashboard → SQL Editor → Run
  -- =============================================================

  -- ── 1. Add subscription columns to gyms ──────────────────────
  ALTER TABLE gyms
    ADD COLUMN IF NOT EXISTS trial_started_at        timestamptz,
    ADD COLUMN IF NOT EXISTS trial_ends_at           timestamptz,
    ADD COLUMN IF NOT EXISTS subscription_status     text NOT NULL DEFAULT 'trial'
                                                     CHECK (subscription_status IN ('trial', 'active', 'expired')),
    ADD COLUMN IF NOT EXISTS plan_type               text NOT NULL DEFAULT 'trial'
                                                     CHECK (plan_type IN ('trial', 'monthly', 'yearly', 'lifetime')),
    ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz,
    ADD COLUMN IF NOT EXISTS subscription_ends_at    timestamptz;

  -- ── 2. Backfill existing gyms as active ──────────────────────
  -- (Gyms created before trials existed keep full access)
  UPDATE gyms
  SET subscription_status     = 'active',
      plan_type               = 'monthly',
      subscription_started_at = created_at
  WHERE subscription_status = 'trial'
    AND trial_started_at IS NULL;

  -- ── 3. Indexes ────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_gyms_subscription_status
    ON gyms(subscription_status);

  CREATE INDEX IF NOT EXISTS idx_gyms_trial_ends_at
    ON gyms(trial_ends_at)
    WHERE subscription_status = 'trial';

  -- ── 4. subscription_requests table ───────────────────────────
  CREATE TABLE IF NOT EXISTS subscription_requests (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id           uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    uploaded_file_url text NOT NULL,
    transaction_id   text,
    notes            text,
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason text,
    submitted_at     timestamptz NOT NULL DEFAULT now(),
    reviewed_at      timestamptz,
    reviewed_by      text
  );

  CREATE INDEX IF NOT EXISTS idx_sub_requests_gym_id ON subscription_requests(gym_id);
  CREATE INDEX IF NOT EXISTS idx_sub_requests_status ON subscription_requests(status);

  ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "gym owner read own requests" ON subscription_requests;
  CREATE POLICY "gym owner read own requests"
    ON subscription_requests FOR SELECT
    USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

  DROP POLICY IF EXISTS "gym owner insert own requests" ON subscription_requests;
  CREATE POLICY "gym owner insert own requests"
    ON subscription_requests FOR INSERT
    WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

  -- ── 5. platform_settings table (UPI details + prices) ────────
  CREATE TABLE IF NOT EXISTS platform_settings (
    id                int PRIMARY KEY DEFAULT 1,
    upi_id            text NOT NULL DEFAULT '',
    upi_name          text NOT NULL DEFAULT 'GymFlow',
    price_monthly     int  NOT NULL DEFAULT 1999,
    price_half_yearly int  NOT NULL DEFAULT 6999,
    price_yearly      int  NOT NULL DEFAULT 12999,
    CHECK (id = 1)
  );

  INSERT INTO platform_settings DEFAULT VALUES
    ON CONFLICT (id) DO NOTHING;

  -- ── 6. Storage bucket for payment proof screenshots ──────────
  INSERT INTO storage.buckets (id, name, public)
    VALUES ('payment-proofs', 'payment-proofs', false)
    ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS "gym owner upload payment proof" ON storage.objects;
  CREATE POLICY "gym owner upload payment proof"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'payment-proofs'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "gym owner read own payment proofs" ON storage.objects;
  CREATE POLICY "gym owner read own payment proofs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'payment-proofs'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  -- ── 7. Update check_gym_active RPC ───────────────────────────
  -- Returns false for admin-deactivated, expired-trial AND lapsed-paid accounts.
  -- (The app code checks subscription_status to tell them apart.)
  -- Lifetime plans store subscription_ends_at = NULL → never lapse.
  CREATE OR REPLACE FUNCTION check_gym_active(p_email text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
      CASE
        WHEN g.is_active = false                   THEN false
        WHEN g.subscription_status = 'expired'     THEN false
        WHEN g.subscription_status = 'trial'
             AND g.trial_ends_at < now()           THEN false
        WHEN g.subscription_status = 'active'
             AND g.subscription_ends_at IS NOT NULL
             AND g.subscription_ends_at < now()    THEN false
        ELSE true
      END
    FROM auth.users u
    JOIN gyms g ON g.owner_id = u.id
    WHERE u.email = p_email
    LIMIT 1;
  $$;

-- ============================================================
-- MIGRATION: 20260717000000_admin_subscription_management.sql
-- ============================================================

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
DROP POLICY IF EXISTS "Gym owners can view own usage stats" ON gym_usage_stats;
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

-- ============================================================
-- MIGRATION: 20260718_subscription_status_expand.sql
-- ============================================================

-- Expand subscription_status to include cancelled and suspended
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_subscription_status_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled', 'suspended'));

-- Also expand plan_type if needed
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_plan_type_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_plan_type_check
  CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'yearly', 'lifetime'));

-- ============================================================
-- MIGRATION: 20260718_fix_check_gym_active_rpc.sql
-- ============================================================

-- ============================================================
-- Fix check_gym_active RPC to handle cancelled and suspended statuses
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Update the check_gym_active RPC to return false for cancelled/suspended accounts
-- Previously only checked: is_active=false, expired, lapsed trial, lapsed paid
-- Now also blocks: cancelled, suspended
CREATE OR REPLACE FUNCTION check_gym_active(p_email text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN g.is_active = false                   THEN false
      WHEN g.subscription_status = 'expired'     THEN false
      WHEN g.subscription_status = 'cancelled'   THEN false
      WHEN g.subscription_status = 'suspended'   THEN false
      WHEN g.subscription_status = 'trial'
           AND g.trial_ends_at < now()           THEN false
      WHEN g.subscription_status = 'active'
           AND g.subscription_ends_at IS NOT NULL
           AND g.subscription_ends_at < now()    THEN false
      ELSE true
    END
  FROM auth.users u
  JOIN gyms g ON g.owner_id = u.id
  WHERE u.email = p_email
  LIMIT 1;
$$;

-- ============================================================
-- MIGRATION: 20260718_enable_realtime_subscriptions.sql
-- ============================================================

-- ============================================================
-- Enable Realtime for gyms and subscription_requests
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

DO $$
BEGIN
  -- Add gyms table to supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'gyms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gyms;
  END IF;

  -- Add subscription_requests table to supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'subscription_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subscription_requests;
  END IF;
END $$;

-- ============================================================
-- MIGRATION: 20260722_realtime_complete_verification.sql
-- ============================================================

-- ============================================================
-- Verify all tables required for Realtime are in the publication.
--
-- This is a comprehensive safety-net migration that ensures every table
-- used by the app's Realtime subscriptions is present in
-- supabase_realtime. Idempotent — safe to run repeatedly.
--
-- Tables required:
--   gyms                  → ShellGuard, AccountClient, AdminDashboardRealtime
--   subscription_requests → SubscriptionClient, AdminSubscriptionList, AdminDashboardRealtime
--   admin_messages        → SupportTabsClient, AccountMenu
--   support_tickets       → SupportTabsClient, Admin Support Page
-- ============================================================

DO $$
BEGIN
  -- gyms: subscription status, account activation, name changes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gyms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gyms;
  END IF;

  -- subscription_requests: payment proof submissions, approval/rejection
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'subscription_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subscription_requests;
  END IF;

  -- admin_messages: messages from admin to gym owners
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_messages;
  END IF;

  -- support_tickets: gym owner tickets and resolution updates
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;
  END IF;
END $$;

-- ============================================================
-- MIGRATION: 20260723_perf_sell_inventory_rpc.sql
-- ============================================================

-- ============================================================
-- Atomic inventory sale RPC
--
-- Collapses the previous 3-round-trip sell flow (SELECT product →
-- INSERT sale → UPDATE stock) into a single atomic transaction, and
-- fixes an oversell race: two concurrent sells could each read the same
-- stock level and both succeed. Row-level FOR UPDATE lock prevents that.
--
-- Runs SECURITY DEFINER but re-verifies gym ownership via auth.uid(), so
-- it is safe to expose to the authenticated (anon-key + JWT) client.
--
-- Idempotent: safe to re-run (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION sell_inventory_item(
  p_inventory_id UUID,
  p_quantity     INTEGER,
  p_unit_price   NUMERIC,
  p_payment_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product  inventory%ROWTYPE;
  v_price    NUMERIC;
  v_total    NUMERIC;
  v_mode     TEXT;
  v_sale_id  UUID;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  v_mode := CASE WHEN p_payment_mode IN ('cash', 'upi', 'card') THEN p_payment_mode ELSE 'cash' END;

  -- Lock the product row so concurrent sells serialize and cannot oversell.
  SELECT * INTO v_product FROM inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  -- Re-verify ownership inside the definer function.
  IF NOT EXISTS (SELECT 1 FROM gyms WHERE id = v_product.gym_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  IF v_product.initial_stock < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_product.initial_stock;
  END IF;

  v_price := COALESCE(p_unit_price, v_product.selling_price);
  v_total := v_price * p_quantity;

  INSERT INTO inventory_sales (
    gym_id, inventory_id, product_name, variant_name,
    quantity, unit_price, total_price, payment_mode
  ) VALUES (
    v_product.gym_id, p_inventory_id, v_product.product_name, v_product.variant_name,
    p_quantity, v_price, v_total, v_mode
  )
  RETURNING id INTO v_sale_id;

  UPDATE inventory
  SET initial_stock = initial_stock - p_quantity,
      updated_at = NOW()
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'sale_id',         v_sale_id,
    'product_name',    v_product.product_name,
    'quantity',        p_quantity,
    'total_price',     v_total,
    'remaining_stock', v_product.initial_stock - p_quantity
  );
END;
$$;

-- ============================================================
-- MIGRATION: 20260723_add_gym_upi_config.sql
-- ============================================================

-- ============================================================
-- Gym UPI Merchant Configuration
--
-- Stores the normalized UPI merchant data parsed from the gym
-- owner's uploaded/scanned QR code. One row per gym.
-- ============================================================

CREATE TABLE IF NOT EXISTS gym_upi_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id UUID NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,

  -- Normalized merchant data (extracted from the QR code)
  upi_id TEXT NOT NULL,                -- pa: payee VPA e.g. yourname@bank
  merchant_name TEXT NOT NULL,         -- pn: display name
  merchant_code TEXT,                  -- mc: merchant category code (optional)
  currency TEXT NOT NULL DEFAULT 'INR',-- cu: currency

  -- Raw parsed parameters from the original QR (for future compatibility)
  raw_params JSONB NOT NULL DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast gym lookup
CREATE INDEX IF NOT EXISTS idx_gym_upi_config_gym_id ON gym_upi_config(gym_id);

-- Row Level Security
ALTER TABLE gym_upi_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners can view their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can view their UPI config"
  ON gym_upi_config FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can insert their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can insert their UPI config"
  ON gym_upi_config FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can update their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can update their UPI config"
  ON gym_upi_config FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can delete their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can delete their UPI config"
  ON gym_upi_config FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

-- ============================================================
-- MIGRATION: 20260723_drop_geo_pipeline.sql
-- ============================================================

-- ============================================================
-- Drop the entire geo normalizer pipeline from the database.
--
-- This removes:
--   - geo_review_queue (unresolved areas pending manual review)
--   - geo_normalization_log (audit trail for normalizations)
--   - geo_gym_aliases (gym-specific learned area aliases)
--   - geo_aliases (global alternate spelling aliases)
--   - geo_localities (canonical locality reference data)
--   - Google Places metadata columns from the members table
--
-- The members.area column is KEPT as a simple free-text field.
--
-- Run this in Supabase Dashboard → SQL Editor.
-- ============================================================

-- Drop tables in dependency order (children before parents)

DROP TABLE IF EXISTS geo_review_queue CASCADE;
DROP TABLE IF EXISTS geo_normalization_log CASCADE;
DROP TABLE IF EXISTS geo_gym_aliases CASCADE;
DROP TABLE IF EXISTS geo_aliases CASCADE;
DROP TABLE IF EXISTS geo_localities CASCADE;

-- Drop Google Places metadata columns from members
-- (These were supplementary and are no longer populated)

ALTER TABLE members DROP COLUMN IF EXISTS google_place_id;
ALTER TABLE members DROP COLUMN IF EXISTS google_formatted_addr;
ALTER TABLE members DROP COLUMN IF EXISTS google_locality_raw;
ALTER TABLE members DROP COLUMN IF EXISTS google_city_raw;
ALTER TABLE members DROP COLUMN IF EXISTS google_state_raw;
ALTER TABLE members DROP COLUMN IF EXISTS google_postal_code;
ALTER TABLE members DROP COLUMN IF EXISTS google_latitude;
ALTER TABLE members DROP COLUMN IF EXISTS google_longitude;

-- Drop the index that referenced google_place_id
DROP INDEX IF EXISTS idx_members_google_place_id;

-- ============================================================
-- MIGRATION: 20260722130000_secure_realtime_activities.sql
-- ============================================================

-- Secure Realtime convergence for owner, admin web, and admin mobile clients.
--
-- Owner browsers use RLS-filtered INSERT/UPDATE postgres_changes plus private,
-- RLS-authorized delete invalidations. Admin clients use custom application sessions (not Supabase Auth), so they receive only payload-free
-- public invalidation hints and then re-fetch through authenticated admin APIs.
-- Broadcast hints are untrusted and contain no row IDs, tenant IDs, or data.
--
-- Supabase database broadcast signature:
-- https://supabase.com/docs/guides/realtime/broadcast#broadcast-from-the-database
-- Content was rephrased for compliance with licensing restrictions.

BEGIN;

-- Tables consumed directly by authenticated owner clients must be part of the
-- Realtime publication. RLS remains the authorization boundary for delivery.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'gyms',
    'subscription_requests',
    'admin_messages',
    'support_tickets',
    'whatsapp_messages',
    'whatsapp_automation_logs',
    'whatsapp_send_queue'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;

-- One generic AFTER-trigger function emits an empty invalidation signal to one
-- or more public topics. Public is intentional because admin web/mobile use a
-- separate app-session system; consumers debounce and securely re-fetch data.
CREATE OR REPLACE FUNCTION public.broadcast_admin_realtime_invalidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_topic TEXT;
BEGIN
  FOREACH v_topic IN ARRAY TG_ARGV
  LOOP
    BEGIN
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        v_topic,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      -- Realtime is an enhancement; a transient broadcast failure must never
      -- roll back the authoritative business transaction.
      RAISE WARNING 'Realtime invalidation failed for topic %: %', v_topic, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_admin_realtime_invalidation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_admin_gyms ON public.gyms;
CREATE TRIGGER trg_realtime_admin_gyms
  AFTER INSERT OR UPDATE OR DELETE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:gyms',
    'admin:subscriptions'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_requests ON public.subscription_requests;
CREATE TRIGGER trg_realtime_admin_subscription_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:subscriptions',
    'admin:gyms'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_support_tickets ON public.support_tickets;
CREATE TRIGGER trg_realtime_admin_support_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:support'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_messages ON public.admin_messages;
CREATE TRIGGER trg_realtime_admin_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:support'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_audit ON public.subscription_audit_logs;
CREATE TRIGGER trg_realtime_admin_subscription_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_logs ON public.whatsapp_automation_logs;
CREATE TRIGGER trg_realtime_admin_whatsapp_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_automation_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_messages ON public.whatsapp_messages;
CREATE TRIGGER trg_realtime_admin_whatsapp_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_queue ON public.whatsapp_send_queue;
CREATE TRIGGER trg_realtime_admin_whatsapp_queue
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_send_queue
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_realtime_admin_member_activity ON public.members;
CREATE TRIGGER trg_realtime_admin_member_activity
  AFTER INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

-- DELETE events from Postgres Changes cannot be filtered. Route them through
-- private Broadcast topics whose join is authorized by realtime.messages RLS.
DROP POLICY IF EXISTS "gym owners receive tenant realtime invalidations"
  ON realtime.messages;
CREATE POLICY "gym owners receive tenant realtime invalidations"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND split_part((SELECT realtime.topic()), ':', 1) = 'gym'
    AND split_part((SELECT realtime.topic()), ':', 3) IN ('support', 'subscription')
    AND EXISTS (
      SELECT 1
      FROM public.gyms
      WHERE public.gyms.id::text = split_part((SELECT realtime.topic()), ':', 2)
        AND public.gyms.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.broadcast_owner_delete_invalidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record JSONB;
  v_gym_id TEXT;
  v_scope TEXT;
  v_topic TEXT;
BEGIN
  v_record := to_jsonb(OLD);
  v_gym_id := COALESCE(v_record ->> 'gym_id', v_record ->> 'id');
  IF v_gym_id IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_scope IN ARRAY TG_ARGV
  LOOP
    v_topic := format('gym:%s:%s', v_gym_id, v_scope);
    BEGIN
      PERFORM realtime.send('{}'::jsonb, 'invalidate', v_topic, true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Private Realtime invalidation failed for topic %: %', v_topic, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_owner_delete_invalidation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_admin_message ON public.admin_messages;
CREATE TRIGGER trg_realtime_owner_deleted_admin_message
  AFTER DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_realtime_owner_deleted_support_ticket
  AFTER DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_subscription_request ON public.subscription_requests;
CREATE TRIGGER trg_realtime_owner_deleted_subscription_request
  AFTER DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('subscription');

COMMIT;

-- ============================================================
-- MIGRATION: 20260724_member_pwa_auth_foundation.sql
-- ============================================================

-- Member PWA M0: auth identity linkage and read-only self access.
-- This migration is additive and does not alter existing owner policies.

BEGIN;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS member_code TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_blood_group_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_blood_group_check
      CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_auth_user_id_unique
  ON public.members(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_email_lower
  ON public.members(LOWER(email))
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_gym_member_code_unique
  ON public.members(gym_id, member_code)
  WHERE member_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_member_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number TEXT := NEW.member_number::TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.member_code := 'GF-' || LPAD(v_number, GREATEST(5, LENGTH(v_number)), '0');
  ELSIF NEW.member_number IS DISTINCT FROM OLD.member_number
     OR NEW.member_code IS NULL
     OR BTRIM(NEW.member_code) = '' THEN
    NEW.member_code := 'GF-' || LPAD(v_number, GREATEST(5, LENGTH(v_number)), '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_member_code ON public.members;
CREATE TRIGGER trg_generate_member_code
  BEFORE INSERT OR UPDATE OF member_number, member_code ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.generate_member_code();

UPDATE public.members
SET member_code = 'GF-' || LPAD(
  member_number::TEXT,
  GREATEST(5, LENGTH(member_number::TEXT)),
  '0'
)
WHERE member_code IS NULL OR BTRIM(member_code) = '';

-- auth_user_id is an authorization boundary. Existing owner RLS permits row
-- updates, so this trigger prevents owner JWTs from linking an Auth identity.
-- Linking must run through a trusted service-role/admin workflow.
CREATE OR REPLACE FUNCTION public.guard_member_auth_user_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_role TEXT := COALESCE(auth.role(), '');
  v_link_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_link_changed := NEW.auth_user_id IS NOT NULL;
  ELSE
    v_link_changed := NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id;
  END IF;

  IF v_link_changed
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND v_auth_role <> 'service_role' THEN
    RAISE EXCEPTION 'member auth identity can only be linked by a trusted server workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_insert ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_insert
  BEFORE INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_update ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_update
  BEFORE UPDATE OF auth_user_id ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own profile" ON public.members;
CREATE POLICY "Members can view their own profile"
  ON public.members FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

-- A definer helper avoids recursive RLS evaluation between members and gyms.
-- It returns only the caller's own tenant ID and accepts no user-controlled ID.
CREATE OR REPLACE FUNCTION public.current_member_gym_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT gym_id
  FROM public.members
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_member_gym_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_gym_id() TO authenticated;

-- Needed for the member shell to read its own gym branding. This does not
-- expose gyms outside the linked member's tenant.
DROP POLICY IF EXISTS "Members can view their gym" ON public.gyms;
CREATE POLICY "Members can view their gym"
  ON public.gyms FOR SELECT
  TO authenticated
  USING (id = public.current_member_gym_id());

COMMENT ON COLUMN public.members.auth_user_id IS
  'Supabase Auth identity for Member PWA access. Set only by trusted owner/server workflows.';
COMMENT ON COLUMN public.members.member_code IS
  'Human-readable gym-scoped display code; never use for authorization.';

COMMIT;

-- ============================================================
-- MIGRATION: 20260729_member_portal_management.sql
-- ============================================================

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

-- ─── member_app_settings — REMOVED (settings tab removed from module) ────────

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

-- ============================================================
-- MIGRATION: 20260730_member_self_read_rls.sql
-- ============================================================

-- ================================================
-- MEMBER SELF-READ RLS FOR MEMBERSHIPS & ATTENDANCE
-- ================================================
-- Allows authenticated member PWA users to read their own memberships
-- and attendance records. The members table self-read policy already
-- exists (20260724 migration). This migration adds the linked-table
-- policies and the last_portal_login update trigger.

BEGIN;

-- ── memberships ───────────────────────────────────────────────────────────────
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own memberships" ON public.memberships;
CREATE POLICY "Members can view their own memberships"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- ── attendance ────────────────────────────────────────────────────────────────
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their own attendance" ON public.attendance;
CREATE POLICY "Members can view their own attendance"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- ── workout_programs ──────────────────────────────────────────────────────────
-- Members read the gym's published programs (non-draft only).
DROP POLICY IF EXISTS "Members can view their gym programs" ON public.workout_programs;
CREATE POLICY "Members can view their gym programs"
  ON public.workout_programs FOR SELECT
  TO authenticated
  USING (
    gym_id = public.current_member_gym_id()
    AND is_draft = false
  );

-- ── member_portal_activity: member self-read ──────────────────────────────────
DROP POLICY IF EXISTS "Members can view their own activity" ON public.member_portal_activity;
CREATE POLICY "Members can view their own activity"
  ON public.member_portal_activity FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- ── last_portal_login trigger ─────────────────────────────────────────────────
-- Automatically stamps members.last_portal_login when the member logs in.
-- Fires on auth.sessions INSERT (Supabase >= 2.x exposes this via the
-- auth schema trigger mechanism). We use a lightweight AFTER trigger
-- on members so any UPDATE that sets portal_enabled=true can also be
-- used, but the canonical update is done from the activation callback.

-- A helper function updated from the server side (via service-role) is
-- more reliable than auth-schema triggers, so we expose a SECURITY DEFINER
-- function that the member app's login API route can call.

CREATE OR REPLACE FUNCTION public.record_member_login(p_member_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.members
  SET last_portal_login = NOW()
  WHERE id = p_member_id
    AND auth_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_login(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_login(UUID) TO authenticated;

-- ── member_portal_activity: member self-insert (login event) ─────────────────
-- Members can insert their own logged_in activity (client calls this on login).
DROP POLICY IF EXISTS "Members can insert their own login activity" ON public.member_portal_activity;
CREATE POLICY "Members can insert their own login activity"
  ON public.member_portal_activity FOR INSERT
  TO authenticated
  WITH CHECK (
    activity = 'logged_in'
    AND member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
    AND gym_id = public.current_member_gym_id()
  );

COMMIT;

-- ============================================================
-- MIGRATION: 20260807_program_assignments.sql
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROGRAM ASSIGNMENTS — links members to workout programs
-- ═══════════════════════════════════════════════════════════════════════════════
-- Gym owners assign programs to specific members (or all at once). Members see
-- their assigned programs in the member PWA workout page.

BEGIN;

CREATE TABLE IF NOT EXISTS public.program_assignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  program_id    UUID        NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- A member can only be assigned to the same program once.
  CONSTRAINT uq_program_member UNIQUE (program_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_program_assignments_gym
  ON public.program_assignments(gym_id);
CREATE INDEX IF NOT EXISTS idx_program_assignments_program
  ON public.program_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_program_assignments_member
  ON public.program_assignments(member_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;

-- Gym owners: full CRUD on their own gym's assignments.
DROP POLICY IF EXISTS "Gym owners can view program assignments" ON public.program_assignments;
CREATE POLICY "Gym owners can view program assignments"
  ON public.program_assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.gyms WHERE id = program_assignments.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert program assignments" ON public.program_assignments;
CREATE POLICY "Gym owners can insert program assignments"
  ON public.program_assignments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.gyms WHERE id = program_assignments.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete program assignments" ON public.program_assignments;
CREATE POLICY "Gym owners can delete program assignments"
  ON public.program_assignments FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.gyms WHERE id = program_assignments.gym_id AND owner_id = auth.uid()));

-- Members: can see their own assignments (for the member PWA).
DROP POLICY IF EXISTS "Members can view their own assignments" ON public.program_assignments;
CREATE POLICY "Members can view their own assignments"
  ON public.program_assignments FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members WHERE auth_user_id = auth.uid()
    )
  );

COMMIT;

-- ============================================================
-- MIGRATION: 20260807_realtime_all_tables.sql
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- Publish remaining business tables to supabase_realtime
-- ═══════════════════════════════════════════════════════════════════════════════
-- Previously only gyms, subscription_requests, admin_messages, support_tickets,
-- and whatsapp tables were published. The core business tables (members,
-- memberships, attendance, workout_programs, inventory, payments) were NOT,
-- which meant:
--   - Owner dashboard/members/payments pages showed stale data until manual refresh
--   - Member PWA never received updates (subscription renewals, attendance, etc.)
--
-- RLS remains the delivery filter — a member can only receive changes to their
-- own rows, and an owner can only receive changes within their gym.

BEGIN;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'members',
    'memberships',
    'attendance',
    'workout_programs',
    'program_assignments',
    'inventory',
    'inventory_sales',
    'due_payments',
    'member_portal_activity'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;

COMMIT;

-- ============================================================
-- MIGRATION: 20260808_gamification_computed.sql
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- GAMIFICATION: computed XP, badges, and streaks from existing behaviour data
-- ═══════════════════════════════════════════════════════════════════════════════
-- No new tables needed — XP, badges, and streaks are derived from attendance,
-- memberships, and portal activity that already exist. This approach means:
--   • Zero owner configuration required — it just works
--   • Retroactive: existing activity instantly gives members their earned XP
--   • No data duplication or sync jobs
--   • Owner panel and member rewards page both read from this function
--
-- XP RULES:
--   • Each attendance check-in:      10 XP
--   • Each membership renewal:       50 XP
--   • Portal activation:             25 XP
--   • Workout session completed:     20 XP (logged_in activity on same day as attendance)
--
-- BADGES (6 total, matching the member rewards UI):
--   • First Check-in:        1+ total attendance
--   • Week Warrior:          5+ check-ins in the current week
--   • Month Hustler:         10+ check-ins in the current month
--   • Dedicated:             25+ total attendance
--   • Consistency King:      50+ total attendance
--   • Century Club:          100+ total attendance
--
-- STREAK: consecutive days with at least one check-in (breaks on a missed day).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_member_gamification(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_attendance INT;
  v_this_week INT;
  v_this_month INT;
  v_membership_count INT;
  v_portal_activated BOOLEAN;
  v_xp INT := 0;
  v_badges INT := 0;
  v_streak INT := 0;
  v_prev_date DATE;
  v_cur_date DATE;
  v_week_start DATE;
  v_month_start DATE;
  rec RECORD;
BEGIN
  v_week_start := date_trunc('week', CURRENT_DATE)::date;
  v_month_start := date_trunc('month', CURRENT_DATE)::date;

  -- Total attendance
  SELECT COUNT(*) INTO v_total_attendance
  FROM attendance WHERE member_id = p_member_id;

  -- This week
  SELECT COUNT(*) INTO v_this_week
  FROM attendance WHERE member_id = p_member_id AND date >= v_week_start;

  -- This month
  SELECT COUNT(*) INTO v_this_month
  FROM attendance WHERE member_id = p_member_id AND date >= v_month_start;

  -- Membership renewals
  SELECT COUNT(*) INTO v_membership_count
  FROM memberships WHERE member_id = p_member_id;

  -- Portal activation
  SELECT (portal_activated_at IS NOT NULL) INTO v_portal_activated
  FROM members WHERE id = p_member_id;

  -- Calculate XP
  v_xp := (v_total_attendance * 10)
         + (v_membership_count * 50)
         + (CASE WHEN v_portal_activated THEN 25 ELSE 0 END);

  -- Calculate badges
  IF v_total_attendance >= 1 THEN v_badges := v_badges + 1; END IF;   -- First Check-in
  IF v_this_week >= 5 THEN v_badges := v_badges + 1; END IF;          -- Week Warrior
  IF v_this_month >= 10 THEN v_badges := v_badges + 1; END IF;        -- Month Hustler
  IF v_total_attendance >= 25 THEN v_badges := v_badges + 1; END IF;  -- Dedicated
  IF v_total_attendance >= 50 THEN v_badges := v_badges + 1; END IF;  -- Consistency King
  IF v_total_attendance >= 100 THEN v_badges := v_badges + 1; END IF; -- Century Club

  -- Calculate current streak (consecutive days with attendance, most recent first)
  v_prev_date := NULL;
  v_streak := 0;
  FOR rec IN
    SELECT DISTINCT date FROM attendance
    WHERE member_id = p_member_id
    ORDER BY date DESC
    LIMIT 365
  LOOP
    v_cur_date := rec.date;
    IF v_prev_date IS NULL THEN
      -- First row: only count if it's today or yesterday (streak is "current")
      IF v_cur_date >= CURRENT_DATE - 1 THEN
        v_streak := 1;
        v_prev_date := v_cur_date;
      ELSE
        EXIT; -- Last check-in was >1 day ago, no active streak
      END IF;
    ELSE
      IF v_prev_date - v_cur_date = 1 THEN
        v_streak := v_streak + 1;
        v_prev_date := v_cur_date;
      ELSE
        EXIT; -- Gap found, streak ends
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'xp', v_xp,
    'badges', v_badges,
    'streak', v_streak,
    'total_attendance', v_total_attendance,
    'this_week', v_this_week,
    'this_month', v_this_month,
    'memberships', v_membership_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_gamification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_gamification(UUID) TO authenticated;

-- Gym-level leaderboard: top N members by XP
CREATE OR REPLACE FUNCTION public.get_gym_leaderboard(p_gym_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE(
  member_id UUID,
  member_name TEXT,
  xp INT,
  badges INT,
  streak INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS member_id,
    m.name AS member_name,
    ((att_count.cnt * 10) + (ms_count.cnt * 50) + (CASE WHEN m.portal_activated_at IS NOT NULL THEN 25 ELSE 0 END))::INT AS xp,
    (
      (CASE WHEN att_count.cnt >= 1 THEN 1 ELSE 0 END) +
      (CASE WHEN att_week.cnt >= 5 THEN 1 ELSE 0 END) +
      (CASE WHEN att_month.cnt >= 10 THEN 1 ELSE 0 END) +
      (CASE WHEN att_count.cnt >= 25 THEN 1 ELSE 0 END) +
      (CASE WHEN att_count.cnt >= 50 THEN 1 ELSE 0 END) +
      (CASE WHEN att_count.cnt >= 100 THEN 1 ELSE 0 END)
    )::INT AS badges,
    0::INT AS streak  -- Streak is expensive to compute per-member; shown as 0 in leaderboard
  FROM members m
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS cnt FROM attendance WHERE attendance.member_id = m.id
  ) att_count ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS cnt FROM attendance
    WHERE attendance.member_id = m.id AND date >= date_trunc('week', CURRENT_DATE)::date
  ) att_week ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS cnt FROM attendance
    WHERE attendance.member_id = m.id AND date >= date_trunc('month', CURRENT_DATE)::date
  ) att_month ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS cnt FROM memberships WHERE memberships.member_id = m.id
  ) ms_count ON TRUE
  WHERE m.gym_id = p_gym_id
  ORDER BY xp DESC, m.name ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gym_leaderboard(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_leaderboard(UUID, INT) TO authenticated;

COMMIT;

-- ============================================================
-- MIGRATION: 20260903_unread_messages_partial_index.sql
-- ============================================================

-- Run: supabase db push
--
-- Partial index for the unread notification badge.
--
-- The query behind it (app/api/support/unread-count/route.ts, and the RLS policy
-- on admin_messages) is:
--
--     SELECT count(*) FROM admin_messages
--     WHERE gym_id = ? AND read_at IS NULL
--
-- The existing idx_admin_messages_gym_id covers only gym_id, so Postgres has to
-- read every message the gym has ever received and re-filter on read_at. Unread
-- rows are a small and shrinking subset of that, which is exactly the case a
-- partial index is for: it indexes only the rows the query wants, so the index
-- stays tiny regardless of message history.
--
-- Measured before this change: ~214ms for the count, versus ~157ms for a plain
-- single-row lookup on gyms — i.e. it was the slowest query in the owner shell.
-- That query has since been moved off the server render path (see the note in
-- lib/dal.ts), so this now speeds up the client-side badge fetch rather than
-- page load. Still worth having: it is the last unindexed predicate on the
-- owner critical path.
--
-- Safe to run on a live database: admin_messages is small, and CREATE INDEX on a
-- small table completes in milliseconds. Deliberately NOT using CONCURRENTLY,
-- because the Supabase CLI wraps migrations in a transaction and CONCURRENTLY
-- cannot run inside one.

CREATE INDEX IF NOT EXISTS idx_admin_messages_gym_unread
  ON admin_messages(gym_id)
  WHERE read_at IS NULL;

-- ============================================================
-- MIGRATION: 20260924130000_add_gym_contact_columns.sql
-- ============================================================

-- The owner onboarding flow has always collected city and phone, but older deployed
-- databases only retained those values inside gyms.onboarding_data. The current app also
-- mirrors them into first-class columns so admin and reporting queries do not need to know
-- the onboarding JSON shape.
--
-- IF NOT EXISTS keeps this safe for environments created from supabase-schema.sql, where
-- both columns already exist. NOTIFY makes PostgREST refresh immediately after a manual
-- migration instead of continuing to return PGRST204 schema-cache errors until its next
-- reload.
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Backfill gyms created before these columns were mirrored. NULLIF avoids turning an empty
-- onboarding field into an apparently populated first-class value, and COALESCE preserves
-- any value that was already written directly to the column.
UPDATE public.gyms
SET city = COALESCE(city, NULLIF(BTRIM(onboarding_data ->> 'city'), '')),
    phone = COALESCE(phone, NULLIF(BTRIM(onboarding_data ->> 'phone'), ''))
WHERE (city IS NULL AND NULLIF(BTRIM(onboarding_data ->> 'city'), '') IS NOT NULL)
   OR (phone IS NULL AND NULLIF(BTRIM(onboarding_data ->> 'phone'), '') IS NOT NULL);

COMMENT ON COLUMN public.gyms.city IS
  'Gym locality collected during onboarding; mirrored in onboarding_data.city for backward compatibility.';

COMMENT ON COLUMN public.gyms.phone IS
  'Gym contact number collected during onboarding; mirrored in onboarding_data.phone for backward compatibility.';

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260925090000_three_tier_subscription_pricing.sql
-- ============================================================

-- =============================================================
-- GymFlow — Three-tier SaaS subscription pricing
--
-- Grows the owner-facing subscription from two tiers (monthly, yearly) to
-- three (monthly, half-yearly, yearly) and reprices all of them:
--   1 month   ₹1,999
--   6 months  ₹6,999
--   1 year    ₹12,999
--
-- A NEW migration rather than an edit to update_prices_and_qr.sql, because that
-- one has already run on live databases; re-editing applied history would not
-- re-run. This is written to be safe to run on a fresh schema or an existing
-- 2999/29999 install alike.
--
-- Run in Supabase Dashboard -> SQL Editor.
-- =============================================================

-- 1. Add the six-month column. IF NOT EXISTS so re-running is a no-op; the
--    DEFAULT seeds the correct price for the existing single settings row.
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS price_half_yearly INT NOT NULL DEFAULT 6999;

-- 2. Reprice all three tiers on the singleton row. Set explicitly rather than
--    relying on the column defaults, since the row already exists with the old
--    2999 / 29999 values and defaults only apply to new rows.
UPDATE platform_settings
SET price_monthly     = 1999,
    price_half_yearly = 6999,
    price_yearly      = 12999
WHERE id = 1
  -- only a row still on the legacy prices: re-running this file must not undo prices you set
  AND price_monthly = 2999 AND price_yearly = 29999;

-- 3. Keep PostgREST's schema cache in step so the new column is queryable
--    without a manual reload.
NOTIFY pgrst, 'reload schema';

-- 4. Allow 'half_yearly' as a plan_type on gyms. The activation routes write this
--    value when an owner buys the six-month tier; without it the CHECK constraint
--    would reject the update. 'quarterly' is left in place (it predates this) so
--    the constraint only grows and never invalidates existing rows.
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_plan_type_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_plan_type_check
  CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'lifetime'));

-- ============================================================
-- MIGRATION: 20260925150000_support_feedback.sql
-- ============================================================

-- ================================================
-- Support Tickets — add owner feedback
--
-- Owners can now leave feedback (a star rating + optional comment) from the same
-- Contact & Support surface they file tickets from. Feedback is stored as a
-- support_tickets row so the admin side sees it in one place, distinguished by
-- type = 'feedback' and carrying a 1-5 rating.
--
-- Two changes, both idempotent so this is safe to re-run:
--   1. widen the type CHECK to allow 'feedback'
--   2. add a nullable rating column (only feedback rows populate it)
--
-- Run in Supabase Dashboard -> SQL Editor.
-- ================================================

-- 1. Allow 'feedback' as a ticket type. Drop the existing named/anonymous CHECK
--    and recreate it with the extra value. The constraint name is deterministic
--    (Postgres names it <table>_<column>_check), so this drops the original from
--    migration 16 whether or not it was ever renamed.
ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_type_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_type_check
  CHECK (type IN ('query', 'issue', 'bug', 'high_priority', 'feedback'));

-- 2. Star rating for feedback rows. Nullable because support tickets do not carry
--    one; bounded 1-5 so a bad client cannot store nonsense.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS rating SMALLINT
  CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));

-- Keep PostgREST's schema cache in step so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260925160000_admin_notifications.sql
-- ============================================================

-- ================================================================
-- Admin push + in-app notifications
-- ================================================================
--
-- Two tables and a set of AFTER-INSERT triggers that turn meaningful business
-- events into durable notification rows. The rows drive:
--   1. the in-app notification centre (read live via the admin API), and
--   2. lock-screen push. Each insert pings /api/push/dispatch via pg_net (see
--      20260925170000_push_dispatch_pg_net.sql) for instant, cron-free delivery.
--
-- The admin apps authenticate with a shared application session (not Supabase
-- Auth), and read exclusively through the service-role admin API — so, exactly
-- like support_tickets, these tables carry RLS that denies anon/authenticated
-- and is bypassed by the service role. No owner-facing policies are added.
--
-- Naming, SECURITY DEFINER + empty search_path, and the "realtime is an
-- enhancement, never roll back the business txn" guard all mirror
-- 20260722130000_secure_realtime_activities.sql.

BEGIN;

-- ── notifications ────────────────────────────────────────────
-- One row per admin-facing event. `entity_id` points back at the source row
-- (ticket id, request id, gym id) so the app can deep-link. `pushed_at` is the
-- dispatch watermark: NULL means "not yet sent to FCM".
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('ticket', 'feedback', 'payment_request', 'new_gym')),
  gym_id      UUID        REFERENCES gyms(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  -- The source row this notification refers to (kept as text: sources have
  -- different id types and we only ever echo it back for deep-linking).
  entity_id   TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  pushed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read) WHERE is_read = false;
-- Partial index the dispatcher scans every run: only rows still awaiting push.
CREATE INDEX IF NOT EXISTS idx_notifications_unpushed   ON notifications(created_at) WHERE pushed_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- No policies: RLS on with zero policies denies anon/authenticated entirely.
-- The service-role admin API bypasses RLS, which is the only reader/writer.

-- ── device_push_tokens ───────────────────────────────────────
-- FCM registration tokens per device. Admin auth is a single shared password
-- with no per-user identity, so a token is bound to a device, not a user.
-- `token` is the natural key; re-registration upserts and bumps last_seen_at.
CREATE TABLE IF NOT EXISTS device_push_tokens (
  token        TEXT        PRIMARY KEY,
  platform     TEXT        NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;
-- Same as above: service-role only.

-- ── Realtime invalidation hint ───────────────────────────────
-- Broadcast a payload-free 'admin:notifications' hint so the in-app centre
-- re-fetches through the authenticated admin API (identical pattern to the
-- existing admin:* hints; broadcast payloads are never trusted as data).
--
-- Deliberately NOT added to the supabase_realtime publication: that is only
-- needed for postgres_changes, which no client uses for this table (owner clients
-- are denied by RLS and admin clients consume broadcast only). Publishing a
-- frequently-inserted table would add WAL/realtime overhead for nothing.
DROP TRIGGER IF EXISTS trg_realtime_admin_notifications ON public.notifications;
CREATE TRIGGER trg_realtime_admin_notifications
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:notifications'
  );

-- ── Event → notification trigger functions ───────────────────
-- Each mirrors the "never roll back the business txn" guard: a failure to log a
-- notification must not abort the ticket/payment/gym insert that caused it.

-- Support tickets AND feedback both land in support_tickets; the type column
-- discriminates. Owner-sent rows are the ones worth alerting on.
CREATE OR REPLACE FUNCTION public.notify_on_support_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
BEGIN
  BEGIN
    SELECT name INTO v_gym_name FROM public.gyms WHERE id = NEW.gym_id;

    IF NEW.type = 'feedback' THEN
      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'feedback',
        NEW.gym_id,
        'New feedback' || CASE WHEN NEW.rating IS NOT NULL THEN ' (' || NEW.rating || '★)' ELSE '' END,
        COALESCE(v_gym_name, 'A gym') || ': ' || NEW.subject,
        NEW.id::text
      );
    ELSE
      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'ticket',
        NEW.gym_id,
        'New support ticket',
        COALESCE(v_gym_name, 'A gym') || ': ' || NEW.subject,
        NEW.id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_support_ticket failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_subscription_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_name TEXT;
BEGIN
  BEGIN
    -- Only a brand-new pending request is an actionable alert.
    IF NEW.status = 'pending' THEN
      SELECT name INTO v_gym_name FROM public.gyms WHERE id = NEW.gym_id;
      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'payment_request',
        NEW.gym_id,
        'New payment proof',
        COALESCE(v_gym_name, 'A gym') || ' submitted a payment for review',
        NEW.id::text
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_subscription_request failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_gym()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
    VALUES (
      'new_gym',
      NEW.id,
      'New gym signup',
      COALESCE(NEW.name, 'A new gym') || ' just registered',
      NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_new_gym failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- These functions run as definer and are called only by triggers; keep them off
-- the public execute grant, matching the existing broadcast helper.
REVOKE ALL ON FUNCTION public.notify_on_support_ticket()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_subscription_request()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_new_gym()               FROM PUBLIC, anon, authenticated;

-- ── Wire the triggers ────────────────────────────────────────
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

-- Keep PostgREST's schema cache in step so the new tables are queryable now.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- MIGRATION: 20260925170000_push_dispatch_pg_net.sql
-- ============================================================

-- ================================================================
-- Instant push delivery via pg_net (no external cron)
-- ================================================================
--
-- Instead of a scheduled job polling for unpushed notifications, each new
-- notifications row fires an HTTP POST to the admin app's /api/push/dispatch
-- endpoint straight from Postgres using the pg_net extension. The endpoint then
-- reads unpushed rows and sends them through FCM (batching any that arrived
-- close together), so delivery is effectively immediate and costs no Vercel Pro
-- cron.
--
-- Secrets (the endpoint URL and the shared CRON_SECRET) live in a private
-- app_config table that only the service role / SECURITY DEFINER functions can
-- read — never hard-coded into the function body, and never exposed to
-- anon/authenticated.

BEGIN;

-- pg_net ships with Supabase but is not enabled by default. It always creates and
-- owns its own `net` schema, so it must NOT be given a target schema here.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── app_config ───────────────────────────────────────────────
-- Single-row key/value store for server-side secrets consumed by triggers.
-- RLS on with no policies => only the service role (and SECURITY DEFINER
-- functions) can read it.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Seed the dispatch config. Update the CRON_SECRET value to match the
-- CRON_SECRET env var set in the admin app (gymflow-admin/.env.local + Vercel).
-- Re-running is safe: ON CONFLICT keeps whatever is already there for the secret
-- so a later manual change from the SQL editor is not clobbered by a redeploy.
INSERT INTO app_config (key, value) VALUES
  ('push_dispatch_url', 'https://admin.gymflow.sbs/api/push/dispatch')
ON CONFLICT (key) DO NOTHING; -- fresh-install seed: a later re-run must not undo the URL you set

INSERT INTO app_config (key, value) VALUES
  ('push_cron_secret', 'REPLACE_WITH_CRON_SECRET')
ON CONFLICT (key) DO NOTHING;

-- ── Trigger: ping the dispatch endpoint on each new notification ──
-- SECURITY DEFINER so it can read app_config and call net.http_post; wrapped in
-- its own BEGIN/EXCEPTION so a transient pg_net failure never rolls back the
-- notification insert (the row still shows in-app and a later insert re-triggers
-- a dispatch that will pick up any it missed).
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  BEGIN
    SELECT value INTO v_url    FROM public.app_config WHERE key = 'push_dispatch_url';
    SELECT value INTO v_secret FROM public.app_config WHERE key = 'push_cron_secret';

    -- No config, no secret, or the placeholder still in place => do nothing.
    IF v_url IS NULL OR v_secret IS NULL OR v_secret = 'REPLACE_WITH_CRON_SECRET' THEN
      RETURN NULL;
    END IF;

    -- pg_net lives in the `net` schema (the extension creates it). Fully
    -- qualified because this function runs with an empty search_path.
    PERFORM net.http_post(
      url     := v_url,
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', v_secret
      ),
      -- The dispatch endpoint does real work (cold start + FCM fan-out), so allow
      -- more than the 5s default. pg_net is async: a timeout here only loses the
      -- response row, never the request, and claimed rows are never re-sent.
      timeout_milliseconds := 15000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_push_on_notification failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_push_on_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dispatch_push_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();

COMMIT;

-- ============================================================
-- MIGRATION: 20260925180000_fix_push_dispatch_pg_net.sql
-- ============================================================

-- ================================================================
-- Fix: push-dispatch pg_net setup (schema + function call)
-- ================================================================
--
-- A forward, idempotent correction for the pg_net wiring first introduced in
-- 20260925170000_push_dispatch_pg_net.sql.
--
-- Two defects in the original are corrected here:
--
--   1. `CREATE EXTENSION pg_net WITH SCHEMA extensions` — pg_net always creates
--      and owns its OWN `net` schema, so pointing it at a target schema is wrong.
--      On databases where the original ran, the extension is in `net` regardless.
--
--   2. `extensions.net.http_post(...)` — an invalid three-part name
--      (database.schema.function). The correct call is `net.http_post(...)`.
--      A trigger created with the bad call raises at INSERT time; because the
--      trigger body swallows exceptions, the symptom was "no push ever arrives"
--      rather than a hard error.
--
-- This migration is safe to run whether or not 20260925170000 was applied, and
-- safe to run more than once. It does not touch the notification tables/triggers
-- from 20260925160000 — only the pg_net dispatch path.
--
-- NOTE ON SECRETS: this migration does NOT reseed app_config, so a CRON_SECRET
-- you already set from the SQL editor is preserved. If app_config does not yet
-- hold the dispatch rows (i.e. 20260925170000 never ran), they are seeded with a
-- placeholder you must then update — see the block below.

BEGIN;

-- ── 1. Ensure pg_net exists in its own `net` schema ──────────────────────────
-- If a prior run somehow created it elsewhere, drop and recreate so the `net`
-- schema and its functions exist at the expected path. Dropping the extension
-- also removes its (unlogged, transient) queue tables — safe, as they only hold
-- in-flight HTTP requests, never business data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_extension e
       JOIN pg_namespace n ON n.oid = e.extnamespace
       WHERE e.extname = 'pg_net' AND n.nspname = 'net'
     )
  THEN
    DROP EXTENSION pg_net;
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Ensure app_config exists and is seeded (idempotent) ───────────────────
-- Present already if 20260925170000 ran; created here otherwise so this migration
-- stands alone. The secret row uses DO NOTHING so an existing value is preserved.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

INSERT INTO app_config (key, value) VALUES
  ('push_dispatch_url', 'https://admin.gymflow.sbs/api/push/dispatch')
ON CONFLICT (key) DO NOTHING; -- fresh-install seed: a later re-run must not undo the URL you set

INSERT INTO app_config (key, value) VALUES
  ('push_cron_secret', 'REPLACE_WITH_CRON_SECRET')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Recreate the dispatch trigger function with the correct call ──────────
-- CREATE OR REPLACE overwrites any earlier (broken) definition in place.
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  BEGIN
    SELECT value INTO v_url    FROM public.app_config WHERE key = 'push_dispatch_url';
    SELECT value INTO v_secret FROM public.app_config WHERE key = 'push_cron_secret';

    -- No config, no secret, or the placeholder still in place => do nothing.
    IF v_url IS NULL OR v_secret IS NULL OR v_secret = 'REPLACE_WITH_CRON_SECRET' THEN
      RETURN NULL;
    END IF;

    -- pg_net lives in the `net` schema (the extension creates it). Fully
    -- qualified because this function runs with an empty search_path.
    PERFORM net.http_post(
      url     := v_url,
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', v_secret
      ),
      -- The dispatch endpoint does real work (cold start + FCM fan-out), so allow
      -- more than the 5s default. pg_net is async: a timeout here only loses the
      -- response row, never the request, and claimed rows are never re-sent.
      timeout_milliseconds := 15000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_push_on_notification failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_push_on_notification() FROM PUBLIC, anon, authenticated;

-- ── 4. Ensure the trigger is attached exactly once ───────────────────────────
DROP TRIGGER IF EXISTS trg_dispatch_push_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();

-- ── 5. Drop notifications from the realtime publication if an earlier run added it
-- The first cut of 20260925160000 published `notifications` for postgres_changes,
-- but no client consumes it that way (owner clients are RLS-denied; admin clients
-- use broadcast). Publishing a high-insert table just adds WAL/realtime overhead,
-- so remove it. Harmless no-op if it was never added.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications';
  END IF;
END
$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- AFTER APPLYING: set the shared secret so the trigger starts firing. It must
-- equal the CRON_SECRET env var in the admin app (and Vercel):
--
--   update app_config
--   set value = '<YOUR_CRON_SECRET>'
--   where key = 'push_cron_secret';
--
-- And, if your admin app is not at admin.gymflow.sbs:
--
--   update app_config
--   set value = 'https://YOUR-ADMIN-HOST/api/push/dispatch'
--   where key = 'push_dispatch_url';
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================
-- MIGRATION: 20260928150000_detailed_admin_notifications.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20261005120000_restore_reports_rpc.sql
-- ============================================================

-- get_gym_reports — everything the owner Reports page (/owner/reports) shows, in one round trip.
--
-- Replaces the 20260612 version rather than altering it, for three reasons:
--
--   · 20260624120000 gave the function `search_path = ''` without schema-qualifying
--     its tables, so `FROM memberships` no longer resolves and the call raises
--     "relation memberships does not exist". Every reference below is qualified.
--
--   · It returned every member who ever had a plan, name and phone included. That
--     grows with the gym, pushes the payload past what is worth caching, and ships
--     the whole phone list to the browser for a page that shows a handful of rows.
--     Lists are capped at 20 here; the counts and totals beside them are complete.
--
--   · Revenue was `amount + admission_fee` on `start_date`. The Payments page counts
--     money when it is collected — the membership fee net of the part left unpaid,
--     dues collected later, and inventory sales — so a backdated plan or a part
--     payment made the two pages disagree. This uses the Payments definition.
--
-- Days are Indian calendar days: `created_at` is stored in UTC, and a payment taken
-- at 1 am on the 1st belongs to the new month, not the old one.
--
-- SECURITY INVOKER, so RLS applies and p_gym_id can only ever read the caller's gym.
-- Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION public.get_gym_reports(p_gym_id UUID, p_today DATE)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH
-- six calendar months ending with the current one, oldest first
months AS (
  SELECT i AS idx,
         (date_trunc('month', p_today::timestamp) - make_interval(months => 5 - i))::date AS start_dt,
         (date_trunc('month', p_today::timestamp) - make_interval(months => 4 - i))::date AS next_dt
  FROM generate_series(0, 5) AS i
),
since AS (
  SELECT (date_trunc('month', p_today::timestamp) - interval '5 months') AT TIME ZONE 'Asia/Kolkata' AS ts
),
collected AS (
  SELECT (ms.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
         (ms.amount + ms.admission_fee - ms.due_amount)::numeric AS amount,
         ms.payment_mode AS mode, 'memberships' AS source, 0 AS units
  FROM public.memberships ms, since
  WHERE ms.gym_id = p_gym_id AND ms.created_at >= since.ts
  UNION ALL
  SELECT (dp.created_at AT TIME ZONE 'Asia/Kolkata')::date, dp.amount::numeric, dp.payment_mode, 'dues', 0
  FROM public.due_payments dp, since
  WHERE dp.gym_id = p_gym_id AND dp.created_at >= since.ts
  UNION ALL
  SELECT (s.sold_at AT TIME ZONE 'Asia/Kolkata')::date, s.total_price, s.payment_mode, 'inventory', s.quantity
  FROM public.inventory_sales s, since
  WHERE s.gym_id = p_gym_id AND s.sold_at >= since.ts
),
month_rows AS (
  SELECT m.idx,
         to_char(m.start_dt, 'Mon YYYY') AS label,
         COALESCE(SUM(c.amount), 0) AS total,
         COALESCE(SUM(c.amount) FILTER (WHERE c.source = 'memberships'), 0) AS memberships,
         COALESCE(SUM(c.amount) FILTER (WHERE c.source = 'dues'), 0) AS dues,
         COALESCE(SUM(c.amount) FILTER (WHERE c.source = 'inventory'), 0) AS inventory,
         COALESCE(SUM(c.amount) FILTER (WHERE c.mode = 'cash'), 0) AS cash,
         COALESCE(SUM(c.amount) FILTER (WHERE c.mode = 'upi'), 0) AS upi,
         COALESCE(SUM(c.amount) FILTER (WHERE c.mode = 'card'), 0) AS card,
         COUNT(c.day) AS transactions
  FROM months m
  LEFT JOIN collected c ON c.day >= m.start_dt AND c.day < m.next_dt
  GROUP BY m.idx, m.start_dt
),
-- People who joined in each month. Imported members are left out: their rows were
-- all created on the day of the import, which would read as one enormous month.
joined AS (
  SELECT m.idx, COUNT(mb.id) AS n
  FROM months m
  LEFT JOIN public.members mb
    ON mb.gym_id = p_gym_id AND NOT COALESCE(mb.is_imported, false)
   AND (mb.created_at AT TIME ZONE 'Asia/Kolkata')::date >= m.start_dt
   AND (mb.created_at AT TIME ZONE 'Asia/Kolkata')::date < m.next_dt
  GROUP BY m.idx
),
-- A renewal is a plan bought by someone who already had one.
renewed AS (
  SELECT m.idx, COUNT(ms.id) AS n
  FROM months m
  LEFT JOIN public.memberships ms
    ON ms.gym_id = p_gym_id
   AND (ms.created_at AT TIME ZONE 'Asia/Kolkata')::date >= m.start_dt
   AND (ms.created_at AT TIME ZONE 'Asia/Kolkata')::date < m.next_dt
   AND EXISTS (SELECT 1 FROM public.memberships prev WHERE prev.member_id = ms.member_id AND prev.created_at < ms.created_at)
  GROUP BY m.idx
),
-- Each member's most recent membership, picked the way the dashboard and the
-- Members page pick it (latest created), so the counts agree across pages.
latest AS (
  SELECT DISTINCT ON (mb.id)
         mb.id, mb.name, mb.phone, mb.created_at, ms.end_date, ms.plan, ms.amount
  FROM public.members mb
  LEFT JOIN public.memberships ms ON ms.member_id = mb.id AND ms.gym_id = p_gym_id
  WHERE mb.gym_id = p_gym_id
  ORDER BY mb.id, ms.created_at DESC
),
member_counts AS (
  SELECT COUNT(*) AS total,
         COUNT(*) FILTER (WHERE end_date >= p_today) AS active,
         -- a member with no plan at all counts as expired, as on the dashboard
         COUNT(*) FILTER (WHERE end_date IS NULL OR end_date < p_today) AS expired,
         COUNT(*) FILTER (WHERE end_date BETWEEN p_today AND p_today + 7) AS expiring7,
         COUNT(*) FILTER (WHERE end_date BETWEEN p_today AND p_today + 30) AS expiring30,
         -- what those members paid for the plan that is ending: the renewal at stake
         COALESCE(SUM(amount) FILTER (WHERE end_date BETWEEN p_today AND p_today + 7), 0) AS renewal7,
         COALESCE(SUM(amount) FILTER (WHERE end_date BETWEEN p_today AND p_today + 30), 0) AS renewal30
  FROM latest
),
plan_rows AS (
  SELECT plan, COUNT(*) AS n FROM latest WHERE end_date >= p_today GROUP BY plan
),
expiring_rows AS (
  SELECT name, phone, end_date, plan, amount
  FROM latest
  WHERE end_date BETWEEN p_today AND p_today + 30
  ORDER BY end_date, name
  LIMIT 20
),
-- Plans that ran out in the last 30 days and have not been renewed: the people
-- who are leaving right now, as opposed to everyone who ever left.
lapsed AS (
  SELECT name, phone, end_date, plan FROM latest WHERE end_date < p_today AND end_date >= p_today - 30
),
lapsed_top AS (
  SELECT * FROM lapsed ORDER BY end_date DESC, name LIMIT 20
),
dues_all AS (
  SELECT name, phone, pending_amount
  FROM public.members
  WHERE gym_id = p_gym_id AND pending_amount > 0
),
dues_top AS (
  SELECT * FROM dues_all ORDER BY pending_amount DESC, name LIMIT 20
),
att AS (
  SELECT a.member_id, a.date, a.session
  FROM public.attendance a
  WHERE a.gym_id = p_gym_id AND a.date > p_today - 90 AND a.date <= p_today
),
att_by_day AS (
  SELECT d.idx, d.name, COUNT(a.date) AS n
  FROM (VALUES (0, 'Sun'), (1, 'Mon'), (2, 'Tue'), (3, 'Wed'), (4, 'Thu'), (5, 'Fri'), (6, 'Sat')) AS d(idx, name)
  LEFT JOIN att a ON EXTRACT(DOW FROM a.date) = d.idx
  GROUP BY d.idx, d.name
),
last_visit AS (
  SELECT member_id, MAX(date) AS last_date FROM att GROUP BY member_id
),
-- Paying members who have stopped coming. Members who joined this week are left
-- out: they have had no chance to be absent yet.
inactive AS (
  SELECT l.name, l.phone, v.last_date
  FROM latest l
  LEFT JOIN last_visit v ON v.member_id = l.id
  WHERE l.end_date >= p_today
    AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_today - 7
    AND (v.last_date IS NULL OR v.last_date <= p_today - 7)
),
inactive_top AS (
  SELECT * FROM inactive ORDER BY last_date ASC NULLS FIRST, name LIMIT 20
),
-- One row per locality however it was typed ("velachery", "Velachery "), shown in
-- its most common spelling.
area_rows AS (
  SELECT mode() WITHIN GROUP (ORDER BY btrim(area)) AS area, COUNT(*) AS n
  FROM public.members
  WHERE gym_id = p_gym_id AND btrim(COALESCE(area, '')) <> ''
  GROUP BY lower(btrim(area))
  ORDER BY n DESC, area
  LIMIT 10
)
SELECT json_build_object(
  'months', (
    SELECT COALESCE(json_agg(json_build_object(
      'label', label, 'total', total, 'memberships', memberships, 'dues', dues, 'inventory', inventory,
      'cash', cash, 'upi', upi, 'card', card, 'transactions', transactions,
      'newMembers', (SELECT n FROM joined j WHERE j.idx = month_rows.idx),
      'renewals', (SELECT n FROM renewed r WHERE r.idx = month_rows.idx)
    ) ORDER BY idx), '[]'::json) FROM month_rows
  ),
  'members', (
    SELECT json_build_object(
      'total', total, 'active', active, 'expired', expired,
      'expiring7', expiring7, 'expiring30', expiring30, 'renewal7', renewal7, 'renewal30', renewal30
    ) FROM member_counts
  ),
  'plans', (
    SELECT COALESCE(json_agg(json_build_object('plan', plan, 'count', n) ORDER BY n DESC, plan), '[]'::json) FROM plan_rows
  ),
  'expiring', (
    SELECT COALESCE(json_agg(json_build_object(
      'name', name, 'phone', phone, 'endDate', end_date, 'plan', plan, 'amount', amount
    ) ORDER BY end_date, name), '[]'::json) FROM expiring_rows
  ),
  'dues', json_build_object(
    'total', (SELECT COALESCE(SUM(pending_amount), 0) FROM dues_all),
    'count', (SELECT COUNT(*) FROM dues_all),
    'top', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'phone', phone, 'amount', pending_amount)
        ORDER BY pending_amount DESC, name), '[]'::json) FROM dues_top
    )
  ),
  'attendance', json_build_object(
    -- Without recent check-ins "nobody came" only means attendance is not being
    -- marked, so the page hides its absence figures instead of raising an alarm.
    'tracked', EXISTS (SELECT 1 FROM att WHERE date > p_today - 30),
    'today', (SELECT COUNT(*) FROM att WHERE date = p_today),
    'total', (SELECT COUNT(*) FROM att),
    'morning', (SELECT COUNT(*) FROM att WHERE session = 'morning'),
    'evening', (SELECT COUNT(*) FROM att WHERE session = 'evening'),
    'byDay', (SELECT json_agg(json_build_object('name', name, 'count', n) ORDER BY idx) FROM att_by_day)
  ),
  'inactive', json_build_object(
    'count', (SELECT COUNT(*) FROM inactive),
    'top', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'phone', phone, 'lastVisit', last_date)
        ORDER BY last_date ASC NULLS FIRST, name), '[]'::json) FROM inactive_top
    )
  ),
  'areas', (
    SELECT COALESCE(json_agg(json_build_object('area', area, 'count', n) ORDER BY n DESC, area), '[]'::json) FROM area_rows
  ),
  'lapsed', json_build_object(
    'count', (SELECT COUNT(*) FROM lapsed),
    'top', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'phone', phone, 'endDate', end_date, 'plan', plan)
        ORDER BY end_date DESC, name), '[]'::json) FROM lapsed_top
    )
  )
);
$$;

REVOKE ALL ON FUNCTION public.get_gym_reports(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_reports(UUID, DATE) TO authenticated;

-- ============================================================
-- MIGRATION: 20261006200000_support_inbox_email.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20261006210000_email_ai_drafts.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20261008100000_gym_owner_contact_search.sql
-- ============================================================

-- Search the gym owners the admin may want to email, by gym name, owner name or email.
--
-- The admin app's "New message" screen lets the admin write to any existing customer, not only
-- to people who have already emailed support. A gym owner's email address lives in auth.users,
-- which the API cannot filter with ILIKE, so the search runs here. SECURITY DEFINER because it
-- reads auth.users; closed to everyone but the service role, like gym_id_for_owner_email.
--
-- Idempotent: CREATE OR REPLACE, and the grants can be repeated.

CREATE OR REPLACE FUNCTION public.search_gym_owner_contacts(p_q TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE (email TEXT, owner_name TEXT, gym_id UUID, gym_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.email::text,
         NULLIF(u.raw_user_meta_data ->> 'full_name', '')::text,
         g.id,
         g.name::text
    FROM public.gyms g
    JOIN auth.users u ON u.id = g.owner_id
   WHERE u.email IS NOT NULL
     AND (
       COALESCE(p_q, '') = ''
       OR u.email ILIKE '%' || p_q || '%'
       OR g.name ILIKE '%' || p_q || '%'
       OR COALESCE(u.raw_user_meta_data ->> 'full_name', '') ILIKE '%' || p_q || '%'
     )
   ORDER BY g.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.search_gym_owner_contacts(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_gym_owner_contacts(TEXT, INT) TO service_role;

-- ============================================================
-- MIGRATION: 20261008120000_owner_feedback_prompts.sql
-- ============================================================

-- When the feedback pop-up was last shown to each gym owner.
--
-- A new gym owner is asked for feedback in a pop-up: at most once every 3 days, for the first
-- 30 days after the gym was created, and never again once they have sent feedback (a
-- support_tickets row with type = 'feedback'). The only thing that has to be remembered is
-- when the pop-up was last shown, so a closed tab or a second device does not ask again at
-- once. Kept in the database, not in the browser, for that reason.
--
-- One row per gym. The owner can read and write only their own gym's row. Idempotent.

CREATE TABLE IF NOT EXISTS public.owner_feedback_prompts (
  gym_id        UUID        PRIMARY KEY REFERENCES public.gyms(id) ON DELETE CASCADE,
  last_shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shown_count   INTEGER     NOT NULL DEFAULT 1 CHECK (shown_count >= 0)
);

ALTER TABLE public.owner_feedback_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gym owners manage their feedback prompt state" ON public.owner_feedback_prompts;
CREATE POLICY "Gym owners manage their feedback prompt state"
  ON public.owner_feedback_prompts
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gyms g
     WHERE g.id = owner_feedback_prompts.gym_id AND g.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gyms g
     WHERE g.id = owner_feedback_prompts.gym_id AND g.owner_id = (SELECT auth.uid())
  ));

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- MIGRATION: 20261008140000_harden_gyms_and_rpc_security.sql
-- ============================================================

-- ============================================================
-- Security hardening: stop owners editing privileged columns, close
-- check_gym_active to anonymous callers.
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================================
--
-- Why: the owner RLS policies on gyms / support_tickets / admin_messages /
-- subscription_requests are row-level only. With the public anon key an owner
-- can PATCH /rest/v1/gyms with their own JWT and set subscription_status =
-- 'active', plan_type = 'lifetime', subscription_ends_at = <far future>,
-- is_active, login_disabled, ... — a one-request paywall bypass.
--
-- Approach: BEFORE triggers with an ALLOWLIST of columns the owner app really
-- writes (checked against app/api/account/gym, onboarding/complete, tours,
-- support/clear, notifications page). An allowlist means any column added later
-- is protected by default. service_role / postgres (admin app, crons, SQL
-- editor) are exempt, so gymflow-admin keeps working.

-- ── helper: is the caller a trusted server role? ─────────────
CREATE OR REPLACE FUNCTION public.is_trusted_db_caller()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT current_user IN ('postgres', 'supabase_admin', 'service_role')
      OR coalesce(auth.role(), '') = 'service_role'
$$;
REVOKE ALL ON FUNCTION public.is_trusted_db_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trusted_db_caller() TO authenticated, service_role;

-- ── 1. gyms: owners may change only profile/onboarding fields ─
CREATE OR REPLACE FUNCTION public.guard_gyms_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Columns an owner may write. Everything else is admin/billing state.
  v_allowed TEXT[] := ARRAY['name','city','phone','gst_number','onboarding_completed','onboarding_data'];
BEGIN
  IF public.is_trusted_db_caller() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Onboarding may create the owner's gym, but only as a plain trial.
    IF NEW.owner_id IS DISTINCT FROM auth.uid()
       OR NEW.subscription_status <> 'trial'
       OR NEW.plan_type <> 'trial'
       OR NEW.is_active IS NOT TRUE
       OR NEW.subscription_ends_at IS NOT NULL
       OR (NEW.trial_ends_at IS NOT NULL AND NEW.trial_ends_at > now() + interval '31 days')
    THEN
      RAISE EXCEPTION 'gyms: owners can only create their own gym as a trial'
        USING ERRCODE = '42501';
    END IF;

    -- Reset every admin/billing field to its default for owner-created rows.
    NEW.is_vip                := false;
    NEW.is_payment_verified   := false;
    NEW.whatsapp_enabled      := true;
    NEW.priority_support      := false;
    NEW.auto_renewal_eligible := false;
    NEW.lifetime_offer        := false;
    NEW.login_disabled        := false;
    NEW.admin_notes           := NULL;
    NEW.last_payment_amount   := NULL;
    NEW.last_payment_method   := NULL;
    NEW.last_transaction_id   := NULL;
    NEW.last_payment_date     := NULL;
    NEW.last_payment_status   := 'none';
    NEW.subscription_started_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: any change outside the allowlist is rejected.
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'gyms: only profile and onboarding fields can be changed by the owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_gyms_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_gyms_privileged_columns ON public.gyms;
CREATE TRIGGER trg_guard_gyms_privileged_columns
  BEFORE INSERT OR UPDATE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.guard_gyms_privileged_columns();

-- ── 2. support_tickets: owners may only clear their own copy ──
CREATE OR REPLACE FUNCTION public.guard_support_tickets_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY['is_cleared_by_owner'];
BEGIN
  IF public.is_trusted_db_caller() THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'support_tickets: owners can only clear their own ticket view'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_support_tickets_owner_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_support_tickets_owner_update ON public.support_tickets;
CREATE TRIGGER trg_guard_support_tickets_owner_update
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_tickets_owner_update();

-- ── 3. admin_messages: owners may only mark read / clear ──────
-- Without this an owner can rewrite subject/body/sent_by and forge a
-- "message from super admin".
CREATE OR REPLACE FUNCTION public.guard_admin_messages_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY['read_at','is_cleared_by_owner'];
BEGIN
  IF public.is_trusted_db_caller() THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'admin_messages: owners can only mark messages read or cleared'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admin_messages_owner_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_admin_messages_owner_update ON public.admin_messages;
CREATE TRIGGER trg_guard_admin_messages_owner_update
  BEFORE UPDATE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_messages_owner_update();

-- ── 4. subscription_requests: owners can only file 'pending' ──
-- Re-create the INSERT policy so an owner cannot insert a row that is already
-- approved/rejected or carries a reviewer.
DROP POLICY IF EXISTS "gym owner insert own requests" ON public.subscription_requests;
CREATE POLICY "gym owner insert own requests"
  ON public.subscription_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    gym_id IN (SELECT id FROM public.gyms WHERE owner_id = (SELECT auth.uid()))
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND rejection_reason IS NULL
  );

-- ── 5. check_gym_active: close to anonymous callers ───────────
-- It was SECURITY DEFINER, no search_path, executable by PUBLIC, so anyone
-- could probe /rest/v1/rpc/check_gym_active to learn which emails are gym
-- owners and whether the account is active/suspended.
-- Callers must now use the service role (server-side login route).
CREATE OR REPLACE FUNCTION public.check_gym_active(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN g.is_active = false                   THEN false
      WHEN g.subscription_status = 'expired'     THEN false
      WHEN g.subscription_status = 'cancelled'   THEN false
      WHEN g.subscription_status = 'suspended'   THEN false
      WHEN g.subscription_status = 'trial'
           AND g.trial_ends_at < now()           THEN false
      WHEN g.subscription_status = 'active'
           AND g.subscription_ends_at IS NOT NULL
           AND g.subscription_ends_at < now()    THEN false
      ELSE true
    END
  FROM auth.users u
  JOIN public.gyms g ON g.owner_id = u.id
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.check_gym_active(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_gym_active(TEXT) TO service_role;

-- ── 6. sell_inventory_item: not callable anonymously ──────────
REVOKE ALL ON FUNCTION public.sell_inventory_item(UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_inventory_item(UUID, INTEGER, NUMERIC, TEXT) TO authenticated;

-- ── 7. defense in depth for policy-less internal tables ───────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_config','notifications','device_push_tokens'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── 8. dead policy: service_role bypasses RLS, so this never matched ──
DROP POLICY IF EXISTS whatsapp_webhook_logs_admin_policy ON public.whatsapp_webhook_logs;
DO $$
BEGIN
  IF to_regclass('public.whatsapp_webhook_logs') IS NOT NULL THEN
    REVOKE ALL ON public.whatsapp_webhook_logs FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- MIGRATION: 20261008150000_member_gym_rpc_wa_config_tenant_fks.sql
-- ============================================================

-- ============================================================
-- Security hardening, part 2
--   A. Members no longer read the whole gyms row (admin_notes, billing, ...)
--   B. gym_whatsapp_config becomes server-only (owners cannot repoint it)
--   C. Child rows must belong to the same gym as their parent
-- Idempotent. Run in the Supabase SQL editor AFTER deploying the app change
-- in lib/member/member-data.ts (see ordering note in A).
-- ============================================================

-- ── A. Member gym branding via a narrow RPC ──────────────────
-- The "Members can view their gym" policy is row-level, so any member could
-- `select *` from gyms through PostgREST and read admin_notes, last_payment_*,
-- is_vip, subscription columns, etc. Column lists in the app do not help: the
-- anon key is public. RLS cannot restrict columns, so members get a definer
-- function that returns only branding fields for their OWN gym and take no
-- direct access to the table.
--
-- ORDER: the function is created first so the new app code works the moment it
-- is deployed; the policy is dropped last. Deploy the app between the two if
-- you run the statements by hand, otherwise members see "no readable gym"
-- until the deploy lands.
--
-- `location` is aliased from city: the member app only needs one free-text
-- place label and `city` is the column onboarding keeps current.
CREATE OR REPLACE FUNCTION public.get_member_gym()
RETURNS TABLE (id UUID, name TEXT, location TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, g.name, g.city AS location, g.created_at
    FROM public.gyms g
   WHERE g.id = public.current_member_gym_id()
$$;
REVOKE ALL ON FUNCTION public.get_member_gym() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_gym() TO authenticated;

DROP POLICY IF EXISTS "Members can view their gym" ON public.gyms;

-- ── B. gym_whatsapp_config: server-only ──────────────────────
-- Only the webhook (service role) maps phone_number_id -> gym. The owner app
-- never reads or writes this table, yet owners could UPDATE phone_number_id /
-- business_account_id to point at another tenant's WhatsApp number and hijack
-- inbound routing. No owner policy is needed, so remove them.
DROP POLICY IF EXISTS gym_whatsapp_config_select_policy ON public.gym_whatsapp_config;
DROP POLICY IF EXISTS gym_whatsapp_config_update_policy ON public.gym_whatsapp_config;
DO $$
BEGIN
  IF to_regclass('public.gym_whatsapp_config') IS NOT NULL THEN
    REVOKE ALL ON public.gym_whatsapp_config FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── C. Same-tenant foreign keys ──────────────────────────────
-- Owner RLS only checks that the ROW's gym_id is the owner's. Nothing stopped
-- an owner inserting memberships/attendance/assignments whose member_id or
-- program_id belongs to ANOTHER gym (the row then appears in that member's own
-- view). A composite FK (child_id, gym_id) -> parent(id, gym_id) makes the
-- database reject it, for every caller including the service role.
--
-- NOT VALID: enforced for all new/updated rows immediately, without scanning
-- or failing on legacy rows. After checking the audit queries at the bottom,
-- run the VALIDATE statements to enforce history too.
-- Existing single-column FKs keep doing the ON DELETE CASCADE / SET NULL, so
-- these use the default NO ACTION and do not change delete behaviour.
DO $$
BEGIN
  IF to_regclass('public.members') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_members_id_gym ON public.members (id, gym_id);
  END IF;
  IF to_regclass('public.inventory') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_id_gym ON public.inventory (id, gym_id);
  END IF;
  IF to_regclass('public.workout_programs') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_programs_id_gym ON public.workout_programs (id, gym_id);
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('memberships',           'fk_memberships_member_same_gym',        'member_id',    'members',          'id'),
    ('attendance',            'fk_attendance_member_same_gym',         'member_id',    'members',          'id'),
    ('due_payments',          'fk_due_payments_member_same_gym',       'member_id',    'members',          'id'),
    ('member_portal_activity','fk_portal_activity_member_same_gym',    'member_id',    'members',          'id'),
    ('program_assignments',   'fk_assignments_member_same_gym',        'member_id',    'members',          'id'),
    ('program_assignments',   'fk_assignments_program_same_gym',       'program_id',   'workout_programs', 'id'),
    ('inventory_units',       'fk_inventory_units_item_same_gym',      'inventory_id', 'inventory',        'id'),
    ('inventory_sales',       'fk_inventory_sales_item_same_gym',      'inventory_id', 'inventory',        'id')
  ) AS t(child, conname, child_col, parent, parent_col)
  LOOP
    -- Skip tables this database does not have (not every migration is applied
    -- everywhere, e.g. inventory_units), and constraints that already exist.
    IF to_regclass(format('public.%I', r.child)) IS NULL
       OR to_regclass(format('public.%I', r.parent)) IS NULL THEN
      RAISE NOTICE 'skipping %: table missing', r.conname;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.conname
         AND conrelid = format('public.%I', r.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, gym_id) REFERENCES public.%I (%I, gym_id) NOT VALID',
        r.child, r.conname, r.child_col, r.parent, r.parent_col
      );
    END IF;
  END LOOP;
END $$;

-- ── Optional follow-up (run by hand, not part of the migration) ──────────────
-- 1. Audit legacy rows that cross tenants (expect 0 rows each):
--      SELECT c.id FROM memberships c JOIN members m ON m.id = c.member_id WHERE m.gym_id <> c.gym_id;
--      SELECT c.id FROM attendance c JOIN members m ON m.id = c.member_id WHERE m.gym_id <> c.gym_id;
--      SELECT c.id FROM program_assignments c JOIN workout_programs p ON p.id = c.program_id WHERE p.gym_id <> c.gym_id;
-- 2. Then enforce on history too, e.g.:
--      ALTER TABLE public.memberships VALIDATE CONSTRAINT fk_memberships_member_same_gym;
--    (repeat per constraint name above)

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- MIGRATION: 20261008160000_hide_admin_notes_from_owners.sql
-- ============================================================

-- ============================================================
-- Hide gyms.admin_notes (super-admin private notes) from gym owners
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================================
--
-- Why: owners could read their own gyms row through PostgREST with their JWT,
-- including admin_notes. Only gymflow-admin (service role) and the admin mobile
-- app (via the admin API) ever read or write that column; no owner/member code
-- selects it (checked: owner queries use explicit column lists, the admin
-- dashboard counts with the service role).
--
-- Postgres cannot revoke a single column from a table-level grant, so the
-- table-level SELECT is replaced by a column-level grant of every column
-- except admin_notes. service_role / postgres are unaffected.
--
-- MAINTENANCE: a column added to gyms in future is NOT readable by owners until
-- it is granted, e.g.
--     GRANT SELECT (new_column) ON public.gyms TO authenticated;
-- That fails closed on purpose; a forgotten grant shows up as
-- "permission denied for column" in the first test, instead of leaking.
-- INSERT/UPDATE privileges are untouched (the guard trigger from
-- 20261008140000 restricts what owners can write).

DO $$
DECLARE
  v_cols TEXT;
BEGIN
  IF to_regclass('public.gyms') IS NULL THEN
    RAISE NOTICE 'public.gyms missing, skipping';
    RETURN;
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'gyms'
     AND column_name <> 'admin_notes';

  REVOKE SELECT ON public.gyms FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.gyms TO authenticated', v_cols);
END $$;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- MIGRATION: 20261008170000_lock_platform_settings.sql
-- ============================================================

-- ============================================================
-- Lock platform_settings (platform UPI id + plan prices)
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================================
--
-- Why: platform_settings never had ROW LEVEL SECURITY enabled. With Supabase's
-- default grants, any signed-in gym owner (or even the public anon key) could
-- PATCH /rest/v1/platform_settings and change upi_id/upi_name — redirecting
-- every owner's subscription payment to an attacker's UPI — or change prices.
--
-- Owners must still READ it (app/owner/subscription and /api/subscription/status
-- use the user client to show where to pay). Writes happen only through the
-- service role (admin app), which bypasses RLS and these grants.
DO $$
BEGIN
  IF to_regclass('public.platform_settings') IS NULL THEN
    RAISE NOTICE 'platform_settings missing, skipping';
    RETURN;
  END IF;

  ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Gym owners can read platform settings" ON public.platform_settings;
  CREATE POLICY "Gym owners can read platform settings"
    ON public.platform_settings FOR SELECT
    TO authenticated
    USING (true);

  REVOKE ALL ON public.platform_settings FROM PUBLIC, anon;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.platform_settings FROM authenticated;
  GRANT SELECT ON public.platform_settings TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';
