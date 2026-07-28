-- ============================================================
-- GymFlow — Consolidated Schema
-- Single-file fresh install: tables, indexes, RLS, functions,
-- triggers, realtime publications, and storage buckets.
-- All conflicts resolved. Safe to run on a brand-new Supabase project.
-- ============================================================

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
                                      CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'yearly', 'lifetime')),
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
  type                  TEXT        NOT NULL CHECK (type IN ('query', 'issue', 'bug', 'high_priority')),
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
  id              INT     PRIMARY KEY DEFAULT 1,
  upi_id          TEXT    NOT NULL DEFAULT '',
  upi_name        TEXT    NOT NULL DEFAULT 'GymFlow',
  price_monthly   INT     NOT NULL DEFAULT 2999,
  price_yearly    INT     NOT NULL DEFAULT 29999,
  CHECK (id = 1)
);

INSERT INTO platform_settings DEFAULT VALUES
  ON CONFLICT (id) DO NOTHING;

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
CREATE POLICY "Users can view their own gym"
  ON gyms FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own gym"
  ON gyms FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own gym"
  ON gyms FOR UPDATE
  USING (owner_id = auth.uid());

-- ── members ──────────────────────────────────────────────────
CREATE POLICY "Gym owners can view their members"
  ON members FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert members"
  ON members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update members"
  ON members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete members"
  ON members FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

-- ── memberships ──────────────────────────────────────────────
CREATE POLICY "Gym owners can view memberships"
  ON memberships FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert memberships"
  ON memberships FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update memberships"
  ON memberships FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete memberships"
  ON memberships FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

-- ── due_payments ─────────────────────────────────────────────
CREATE POLICY "Gym owners can view due payments"
  ON due_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert due payments"
  ON due_payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update due payments"
  ON due_payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete due payments"
  ON due_payments FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

-- ── attendance ───────────────────────────────────────────────
CREATE POLICY "Gym owners can view attendance"
  ON attendance FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert attendance"
  ON attendance FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update attendance"
  ON attendance FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete attendance"
  ON attendance FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

-- ── admin_messages ───────────────────────────────────────────
CREATE POLICY "Gym owners can read their admin messages"
  ON admin_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid()));

-- ── support_tickets ──────────────────────────────────────────
CREATE POLICY "Gym owners can view their support tickets"
  ON support_tickets FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert support tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

-- ── gym_plan_prices ──────────────────────────────────────────
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
CREATE POLICY "Gym owners can view their inventory"
  ON inventory FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert inventory"
  ON inventory FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update inventory"
  ON inventory FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete inventory"
  ON inventory FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

-- ── inventory_units ──────────────────────────────────────────
CREATE POLICY "Gym owners can view their inventory units"
  ON inventory_units FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert inventory units"
  ON inventory_units FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update inventory units"
  ON inventory_units FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete inventory units"
  ON inventory_units FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid()));

-- ── inventory_sales ──────────────────────────────────────────
CREATE POLICY "Gym owners can view their inventory sales"
  ON inventory_sales FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert inventory sales"
  ON inventory_sales FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update inventory sales"
  ON inventory_sales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete inventory sales"
  ON inventory_sales FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

-- ── workout_programs ─────────────────────────────────────────
-- RLS is enabled above; without these policies every owner query is denied.
CREATE POLICY "Gym owners can view their programs"
  ON workout_programs FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert programs"
  ON workout_programs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update programs"
  ON workout_programs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

-- ── workout_programs ─────────────────────────────────────────
CREATE POLICY "Gym owners can view their programs"
  ON workout_programs FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert programs"
  ON workout_programs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update programs"
  ON workout_programs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid()));

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
CREATE POLICY "Gym owners can view own usage stats"
  ON gym_usage_stats FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── gym_upi_config ───────────────────────────────────────────
CREATE POLICY "Gym owners can view their UPI config"
  ON gym_upi_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can insert their UPI config"
  ON gym_upi_config FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can update their UPI config"
  ON gym_upi_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

CREATE POLICY "Gym owners can delete their UPI config"
  ON gym_upi_config FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid()));

-- ── whatsapp_messages ────────────────────────────────────────
CREATE POLICY whatsapp_messages_select_policy ON whatsapp_messages
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

CREATE POLICY whatsapp_messages_insert_policy ON whatsapp_messages
  FOR INSERT
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

CREATE POLICY whatsapp_messages_update_policy ON whatsapp_messages
  FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── whatsapp_webhook_logs ────────────────────────────────────
-- Only service role can access webhook logs (no authenticated user policy needed)
CREATE POLICY whatsapp_webhook_logs_admin_policy ON whatsapp_webhook_logs
  FOR ALL
  USING (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' = 'service_role');

-- ── gym_whatsapp_config ──────────────────────────────────────
CREATE POLICY gym_whatsapp_config_select_policy ON gym_whatsapp_config
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

CREATE POLICY gym_whatsapp_config_update_policy ON gym_whatsapp_config
  FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── whatsapp_automation_logs ─────────────────────────────────
CREATE POLICY wa_auto_logs_select ON whatsapp_automation_logs
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ── whatsapp_send_queue ──────────────────────────────────────
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
