-- ============================================================
-- GymFlow — Complete Database Schema (single canonical file)
--
-- This is the FINAL current state of the database, not a history. Run this one
-- file on a brand-new Supabase project and you have the whole schema. Every
-- statement is idempotent, so running it again on an existing database is safe.
--
-- Do NOT also run supabase/migrations/*.sql on a fresh project. Those files are
-- kept only to upgrade databases that already exist; this file supersedes them.
--
-- Contents
--   1  Extensions
--   2  Tables (+ column comments)
--   3  Constraints that span tables (same-tenant foreign keys)
--   4  Indexes
--   5  Functions
--   6  Triggers
--   7  Views
--   8  Row Level Security: enable + policies
--   9  Privileges (table, column and function level)
--  10  Realtime publication and broadcast authorization
--  11  Storage buckets and policies
--  12  Seed rows
--
-- After it finishes, set your own values (see SELF_HOSTING.md):
--   update app_config set value = '<CRON_SECRET>' where key = 'push_cron_secret';
--   update app_config set value = '<admin app URL>/api/push/dispatch' where key = 'push_dispatch_url';
--   update platform_settings set upi_id = '<your-upi-id>', upi_name = '<name>' where id = 1;
--
-- Security model in one paragraph: every tenant table carries `gym_id` and its
-- RLS policies resolve to `gyms.owner_id = auth.uid()`. Members of a gym reach
-- their own rows through `members.auth_user_id`. The service role (admin app,
-- crons, webhooks) bypasses RLS and is the only writer for platform-owned
-- tables. Columns an owner must not change are protected by BEFORE triggers,
-- because RLS can restrict rows but not columns.
-- ============================================================


-- ############################################################
-- 1 — EXTENSIONS
-- ############################################################

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Trigram search backs the admin support inbox's owner lookup.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
-- pg_net lets a trigger POST to the admin app so a new notification turns into a
-- push without an external cron. It always owns its own `net` schema, so it must
-- NOT be given a target schema here.
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ############################################################
-- 2 — TABLES
-- ############################################################

-- ── gyms ─────────────────────────────────────────────────────
-- One row per tenant. `owner_id` is the Supabase Auth user who owns it and is
-- the anchor of every RLS policy in the schema.
--
-- The subscription and admin columns are platform state, not owner state: the
-- owner may only edit name/city/phone/gst_number/onboarding_*. That boundary is
-- enforced by trg_guard_gyms_privileged_columns, since RLS cannot restrict
-- columns. The admin's private notes live in their own service-role-only table,
-- gym_admin_notes, so they never appear in a gyms row or its Realtime payload.
CREATE TABLE IF NOT EXISTS gyms (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT        NOT NULL,
  owner_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic info. city/phone are mirrored into onboarding_data for backward
  -- compatibility with databases that only kept them in the JSON blob.
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
                                      CHECK (plan_type IN ('free', 'trial', 'monthly', 'quarterly', 'yearly', 'lifetime')),
  subscription_started_at TIMESTAMPTZ,
  -- NULL for a lifetime plan, which is why "no end date" must never be read as
  -- "expired" anywhere in the app.
  subscription_ends_at    TIMESTAMPTZ,
  -- Paid WhatsApp add-on end date. Billing state: owners cannot write it (the
  -- gyms column guard rejects every non-allowlisted column).
  whatsapp_addon_until    TIMESTAMPTZ,

  -- Admin fields, written only by the admin app through the service role.
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

COMMENT ON COLUMN gyms.city IS
  'Gym locality collected during onboarding; mirrored in onboarding_data.city for backward compatibility.';
COMMENT ON COLUMN gyms.phone IS
  'Gym contact number collected during onboarding; mirrored in onboarding_data.phone for backward compatibility.';

-- ── members ──────────────────────────────────────────────────
-- `phone` is deliberately NOT unique: gyms share family numbers, and a unique
-- constraint blocked real sign-ups.
--
-- `auth_user_id` is an authorization boundary — it is what lets a person sign in
-- to the member PWA as this member — so it may only be set by a trusted
-- service-role workflow (trg_guard_member_auth_user_link).
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

  -- Member PWA identity and profile
  auth_user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email               TEXT,
  photo_url           TEXT,
  member_code         TEXT,
  blood_group         TEXT,
  emergency_name      TEXT,
  emergency_phone     TEXT,
  medical_notes       TEXT,

  -- Portal management (owner-side "Member App" module)
  portal_enabled      BOOLEAN     NOT NULL DEFAULT false,
  portal_suspended    BOOLEAN     NOT NULL DEFAULT false,
  invitation_status   TEXT        NOT NULL DEFAULT 'not_sent'
                                  CHECK (invitation_status IN ('not_sent','pending','delivered','activated','expired')),
  invitation_sent_at  TIMESTAMPTZ,
  portal_activated_at TIMESTAMPTZ,
  last_portal_login   TIMESTAMPTZ,

  -- The member's own choice to appear on the gym leaderboard. Owners cannot
  -- change it (trg_guard_member_leaderboard_visibility); members change it
  -- through set_leaderboard_visibility().
  show_on_leaderboard BOOLEAN     NOT NULL DEFAULT true,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, member_number),
  CONSTRAINT members_blood_group_check
    CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))
);

COMMENT ON COLUMN members.legacy_member_id IS
  'Original member ID from an external/legacy system, preserved during import. '
  'The canonical GymFlow ID is derived from member_number as GF + zero-padded 4 digits.';
COMMENT ON COLUMN members.date_of_birth IS
  'Used for automated birthday_wishes WhatsApp messages';
COMMENT ON COLUMN members.is_imported IS
  'True for members created via Excel/CSV import. Suppresses the _gymflow_welcome_member template; all other automations behave identically.';
COMMENT ON COLUMN members.auth_user_id IS
  'Supabase Auth identity for Member PWA access. Set only by trusted owner/server workflows.';
COMMENT ON COLUMN members.member_code IS
  'Human-readable gym-scoped display code; never use for authorization.';

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
-- Dues collected after the membership was sold.
CREATE TABLE IF NOT EXISTS due_payments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount        INTEGER     NOT NULL,
  payment_mode  TEXT        NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── attendance ───────────────────────────────────────────────
-- One row per member per day per session, so a gym can run morning and evening
-- batches without the second check-in colliding with the first.
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  session         TEXT        CHECK (session IN ('morning', 'evening')) DEFAULT 'morning',
  check_out_time  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT attendance_member_id_date_session_key UNIQUE (member_id, date, session)
);

-- ── admin_messages ───────────────────────────────────────────
-- Messages the super admin sends to one gym. Written only by the service role;
-- the owner may only mark one read or clear it from their own list
-- (trg_guard_admin_messages_owner_update).
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
-- Owner-raised tickets and star feedback share this table; `type = 'feedback'`
-- rows are the ones that carry `rating`. An owner may only clear their own view
-- of a row (trg_guard_support_tickets_owner_update) — status is the admin's.
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
-- What this gym charges its own members (not the SaaS price).
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

-- ── gym_gamification_settings ────────────────────────────────
-- Owner-tunable gamification rules, one row per gym. A MISSING row means "use
-- the defaults", which equal the values that were hardcoded before this table
-- existed, so a gym that never opens the settings keeps its old XP numbers.
--
-- Members get no access to this table: they read the few values they need
-- through get_member_gamification(), so prize text and rule tuning cannot be
-- scraped across gyms with the public anon key.
--
-- xp_multipliers is an array of
--   { "label": text, "factor": 1..5, "days_of_week": [0=Sunday..6] | null,
--     "start_date": "YYYY-MM-DD" | null, "end_date": "YYYY-MM-DD" | null }
-- badge_rules overrides achievement thresholds by code, e.g.
--   { "att-consistency-king": 50 }
-- Both are validated in the app (lib/gamification/settings.ts); the checks here
-- only pin the container type so the SQL readers can iterate them safely.
CREATE TABLE IF NOT EXISTS gym_gamification_settings (
  gym_id                UUID        PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  leaderboards_enabled  BOOLEAN     NOT NULL DEFAULT true,
  xp_per_checkin        INT         NOT NULL DEFAULT 10
                                    CHECK (xp_per_checkin BETWEEN 0 AND 100),
  xp_per_renewal        INT         NOT NULL DEFAULT 50
                                    CHECK (xp_per_renewal BETWEEN 0 AND 500),
  xp_portal_activation  INT         NOT NULL DEFAULT 25
                                    CHECK (xp_portal_activation BETWEEN 0 AND 500),
  weekly_goal_days      INT         NOT NULL DEFAULT 4
                                    CHECK (weekly_goal_days BETWEEN 1 AND 7),
  xp_multipliers        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  badge_rules           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  weekly_prize          TEXT,
  monthly_prize         TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_gamification_settings_multipliers_check
    CHECK (jsonb_typeof(xp_multipliers) = 'array' AND jsonb_array_length(xp_multipliers) <= 20),
  CONSTRAINT gym_gamification_settings_badge_rules_check
    CHECK (jsonb_typeof(badge_rules) = 'object'),
  CONSTRAINT gym_gamification_settings_prize_length_check
    CHECK (
      (weekly_prize  IS NULL OR char_length(weekly_prize)  <= 200)
      AND (monthly_prize IS NULL OR char_length(monthly_prize) <= 200)
    )
);

-- ── member_achievements ──────────────────────────────────────
-- Achievements used to be re-derived on every read, so a badge earned on a
-- streak re-locked the day the streak broke. A row here makes an unlock
-- permanent. `code` is the achievement id from lib/member/achievements.
-- Written only by record_member_achievements() for the caller's own member row.
CREATE TABLE IF NOT EXISTS member_achievements (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id     UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  code       TEXT        NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_achievements_member_code_key UNIQUE (member_id, code)
);

-- ── gamification_awards ──────────────────────────────────────
-- Only the owner's "mark prize awarded" action. The boards themselves are never
-- snapshotted (they are rolling windows computed on read), so `period_label` is
-- free text chosen by the app, and the unique key stops a double tap from
-- awarding the same member twice for the same period.
CREATE TABLE IF NOT EXISTS gamification_awards (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  board         TEXT        NOT NULL CHECK (board IN ('week', 'month', 'streak', 'all')),
  period_label  TEXT        NOT NULL,
  prize         TEXT        NOT NULL,
  awarded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gamification_awards_unique_award UNIQUE (gym_id, member_id, board, period_label)
);

-- ── gym_events ───────────────────────────────────────────────
-- Owner-defined challenges ("Complete 7 check-in days"). Members who meet the
-- goal inside [start_date, end_date] earn reward_xp and/or an item (reward_text)
-- the owner later hands over. Progress is never stored: it is derived from
-- attendance by gym_event_progress(), and only the completion is persisted.
--
--   checkin_days   distinct attended days in the window
--   streak_days    longest run of consecutive attended days inside the window
--   long_sessions  distinct days with a checked-out session >= min_session_minutes
-- session_filter (morning/evening) narrows checkin_days and long_sessions; a
-- streak is always about days, so it cannot carry one.
--
-- Members get no access to this table: they read through get_member_events().
CREATE TABLE IF NOT EXISTS gym_events (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id               UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  title                TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  description          TEXT        CHECK (description IS NULL OR char_length(description) <= 200),
  goal_type            TEXT        NOT NULL CHECK (goal_type IN ('checkin_days', 'streak_days', 'long_sessions')),
  goal_target          INT         NOT NULL CHECK (goal_target BETWEEN 1 AND 365),
  min_session_minutes  INT         CHECK (min_session_minutes IS NULL OR min_session_minutes BETWEEN 15 AND 720),
  session_filter       TEXT        CHECK (session_filter IS NULL OR session_filter IN ('morning', 'evening')),
  start_date           DATE        NOT NULL,
  end_date             DATE        NOT NULL,
  reward_xp            INT         NOT NULL DEFAULT 0 CHECK (reward_xp BETWEEN 0 AND 1000),
  reward_text          TEXT        CHECK (reward_text IS NULL OR char_length(reward_text) BETWEEN 1 AND 80),
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_events_window_check
    CHECK (end_date >= start_date AND end_date - start_date <= 365),
  CONSTRAINT gym_events_reward_check
    CHECK (reward_xp > 0 OR reward_text IS NOT NULL),
  CONSTRAINT gym_events_min_session_check
    CHECK ((goal_type = 'long_sessions') = (min_session_minutes IS NOT NULL)),
  CONSTRAINT gym_events_streak_no_session_check
    CHECK (goal_type <> 'streak_days' OR session_filter IS NULL)
);

-- ── gym_event_completions ────────────────────────────────────
-- One row per (event, member) the moment the goal is met. xp_awarded and
-- reward_text are snapshots, so editing the event later never rewrites history.
-- Written only by evaluate_member_events() / evaluate_gym_events(); the owner
-- may only stamp reward_given_at (column-level UPDATE grant).
CREATE TABLE IF NOT EXISTS gym_event_completions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id           UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  event_id         UUID        NOT NULL REFERENCES gym_events(id) ON DELETE CASCADE,
  member_id        UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  xp_awarded       INT         NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  reward_text      TEXT,
  reward_given_at  TIMESTAMPTZ,
  CONSTRAINT gym_event_completions_event_member_key UNIQUE (event_id, member_id)
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
-- Serialized (barcode-tracked) units of an inventory product.
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
-- product_name / variant_name are copied at sale time so a sale keeps its
-- description after the product is renamed or deleted.
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
-- Members see only non-draft programs of their own gym.
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

-- ── program_assignments ──────────────────────────────────────
-- Links members to workout programs. Owners assign; members read their own.
CREATE TABLE IF NOT EXISTS program_assignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  program_id    UUID        NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- A member can only be assigned to the same program once.
  CONSTRAINT uq_program_member UNIQUE (program_id, member_id)
);

-- ── member_portal_activity ───────────────────────────────────
-- Append-only event log for portal actions by either the owner or the member.
-- Rows are never updated or deleted.
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

-- ── subscription_requests ────────────────────────────────────
-- An owner's UPI payment proof awaiting admin review. The owner can only file a
-- 'pending' row; status and reviewer are the admin's to set.
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
  reviewed_by       TEXT,
  -- What the payment is for; NULL on rows from before this column existed.
  plan_requested    TEXT
                    CONSTRAINT subscription_requests_plan_requested_check
                    CHECK (plan_requested IN ('monthly', 'yearly', 'whatsapp_addon'))
);

-- ── subscription_audit_logs ──────────────────────────────────
-- Every admin change to a gym's subscription, for dispute resolution.
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

-- ── platform_settings ────────────────────────────────────────
-- Singleton row (id = 1): the platform's own UPI details and SaaS prices.
-- Owners read it to know where to pay; only the service role may write it.
CREATE TABLE IF NOT EXISTS platform_settings (
  id                 INT     PRIMARY KEY DEFAULT 1,
  upi_id             TEXT    NOT NULL DEFAULT '',
  upi_name           TEXT    NOT NULL DEFAULT 'GymFlow',
  price_monthly      INT     NOT NULL DEFAULT 999,
  price_yearly       INT     NOT NULL DEFAULT 9999,
  CHECK (id = 1)
);

-- ── platform_announcement ────────────────────────────────────
-- Singleton row (id = 1): site-wide banner shown at the top of every owner page.
-- Written only by the admin app (service role); `version` is bumped on each
-- publish so a dismissed banner reappears when the message changes.
CREATE TABLE IF NOT EXISTS platform_announcement (
  id          INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  message     TEXT        NOT NULL DEFAULT '',
  level       TEXT        NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'critical')),
  link_url    TEXT,
  link_label  TEXT,
  -- Plain text shown after the link ("... <link>. We are working on it.").
  message_after TEXT      NOT NULL DEFAULT '',
  is_active   BOOLEAN     NOT NULL DEFAULT false,
  version     INT         NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── gym_usage_stats ──────────────────────────────────────────
-- Per-gym counters maintained by triggers, so the admin panel can show activity
-- without aggregating the whole tenant on every page load.
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
-- The gym's own UPI handle, used to generate QR codes for member payments.
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

-- ── owner_feedback_prompts ───────────────────────────────────
-- When the feedback pop-up was last shown to each gym owner. Kept in the
-- database rather than the browser so a closed tab or a second device does not
-- ask again at once. One row per gym.
CREATE TABLE IF NOT EXISTS owner_feedback_prompts (
  gym_id        UUID        PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  last_shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shown_count   INTEGER     NOT NULL DEFAULT 1 CHECK (shown_count >= 0)
);

-- ── notifications ────────────────────────────────────────────
-- One row per admin-facing event; drives the notification centre and push.
-- Written only by database triggers, read only through the service-role admin
-- API. RLS is on with no policies, so no owner or member can reach it.
-- `entity_id` points back at the source row so the app can deep-link;
-- `pushed_at` is the dispatch watermark (NULL = not yet sent to FCM).
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('ticket', 'feedback', 'payment_request', 'new_gym', 'email', 'alert')),
  gym_id      UUID        REFERENCES gyms(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  entity_id   TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  pushed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- ── app_config ───────────────────────────────────────────────
-- Private server-side key/value store (push dispatch URL + CRON_SECRET), read
-- only by SECURITY DEFINER triggers and the service role. RLS on, no policies.
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── email_threads ────────────────────────────────────────────
-- Admin support inbox. One row per conversation with one outside address.
-- `subject` is stored with any Re:/Fwd: prefixes stripped, so a reply that
-- starts a new chain still matches. Service-role only (no policies, no grants).
CREATE TABLE IF NOT EXISTS email_threads (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject            TEXT        NOT NULL DEFAULT '(no subject)',
  counterparty_email TEXT        NOT NULL,
  counterparty_name  TEXT,
  -- Filled when the sender's address belongs to a gym owner, so the app can jump
  -- to that gym. Nullable: most website enquiries come from people who are not
  -- customers yet.
  gym_id             UUID        REFERENCES gyms(id) ON DELETE SET NULL,
  status             TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  snippet            TEXT,
  last_message_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_direction     TEXT        CHECK (last_direction IN ('inbound', 'outbound')),
  unread_count       INTEGER     NOT NULL DEFAULT 0 CHECK (unread_count >= 0),

  -- AI-drafted reply, offered to the admin as a starting point.
  ai_draft            TEXT,
  -- The inbound message this draft answers. The app only offers the draft while
  -- this is still the newest inbound message, so a stale draft is never shown
  -- for a newer question. The foreign key is added in section 3, because
  -- email_messages does not exist yet at this point.
  ai_draft_message_id UUID,
  ai_draft_at         TIMESTAMPTZ,
  ai_draft_status     TEXT        NOT NULL DEFAULT 'none'
                                  CONSTRAINT email_threads_ai_draft_status_check
                                  CHECK (ai_draft_status IN ('none', 'ready', 'queued', 'failed', 'skipped')),
  -- True when the model judged the message to need a person (refund, account
  -- access, anger, legal tone, or a question outside what it knows). The draft
  -- is then only a short holding reply and the app says so.
  ai_needs_human      BOOLEAN     NOT NULL DEFAULT false,
  ai_draft_model      TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── email_messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        UUID        NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
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
-- Service-role only: raw webhook payloads for debugging. RLS on, no policies.
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
-- Maps a Meta phone_number_id to a gym, which is how an inbound webhook is
-- routed to the right tenant. Service-role only: an owner who could repoint
-- phone_number_id would hijack another tenant's inbound mail.
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
  'Throttled outbound queue for automated WhatsApp sends (15 per 5 minutes, drained via QStash).';

-- ── gym_admin_notes ──────────────────────────────────────────
-- The super admin's private notes about a gym. Deliberately NOT a gyms column:
-- owners receive Realtime UPDATE payloads for their own gyms row, and a hidden
-- column can still travel in them. RLS is on with no policies and every client
-- role is revoked, so only the service role (admin app) can touch it. Never add
-- it to a realtime publication.
CREATE TABLE IF NOT EXISTS gym_admin_notes (
  gym_id     UUID        PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── owner_verified_phones ────────────────────────────────────
-- Mobile numbers owners proved by WhatsApp code at signup; one number, one owner.
-- Service role only (RLS on, no policies, client roles revoked).
CREATE TABLE IF NOT EXISTS owner_verified_phones (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164  TEXT        NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every mobile number an owner types on the signup phone step, verified or not, kept for marketing.
-- user_id is a plain uuid with NO foreign key on purpose: the lead must outlive the owner's account,
-- so deleting the auth user or gym must never cascade here. Only marketing_consent = true rows with
-- unsubscribed_at null may be marketed to. Service role only (RLS on, no policies, client roles revoked).
CREATE TABLE IF NOT EXISTS owner_phone_leads (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164           TEXT        NOT NULL UNIQUE,
  email                TEXT,
  full_name            TEXT,
  user_id              UUID,
  source               TEXT        NOT NULL DEFAULT 'signup',
  first_entered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_entered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_count          INT         NOT NULL DEFAULT 1,
  verified_at          TIMESTAMPTZ,
  marketing_consent    BOOLEAN     NOT NULL DEFAULT false,
  marketing_consent_at TIMESTAMPTZ,
  unsubscribed_at      TIMESTAMPTZ
);

-- Unique recipients messaged in the last 24 h on the one shared WhatsApp number.
-- Meta allows 250 unique customers per rolling 24 h; a customer counts once and leaves
-- the count 24 h after their FIRST message in the window. Service role only.
CREATE TABLE IF NOT EXISTS whatsapp_recipient_window (
  phone_e164    TEXT        PRIMARY KEY,
  first_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ############################################################
-- 3 — CONSTRAINTS THAT SPAN TABLES
-- ############################################################

-- The AI draft's anchor message. Added here rather than inline, because
-- email_threads is created before email_messages.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'email_threads_ai_draft_message_id_fkey'
       AND conrelid = 'public.email_threads'::regclass
  ) THEN
    ALTER TABLE public.email_threads
      ADD CONSTRAINT email_threads_ai_draft_message_id_fkey
      FOREIGN KEY (ai_draft_message_id)
      REFERENCES public.email_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Same-tenant foreign keys ─────────────────────────────────
-- Owner RLS only checks that a row's own gym_id belongs to the caller. Without
-- these, an owner could insert a membership, attendance row or assignment whose
-- member_id or program_id belongs to ANOTHER gym — the row would then show up in
-- that member's own view. A composite key (child_id, gym_id) -> parent(id,
-- gym_id) makes the database reject it, for every caller including the service
-- role.
--
-- Each one repeats the ON DELETE action of its single-column twin in section 2.
-- Left at the default NO ACTION they block the delete: Postgres may run the
-- composite key's check before the single-column CASCADE has removed the child
-- rows, so deleting a member that has memberships failed with
-- "violates foreign key constraint fk_memberships_member_same_gym" (23503).
-- inventory_sales is SET NULL on inventory_id only, because gym_id is NOT NULL
-- (column list needs PostgreSQL 15+).

-- Composite targets the foreign keys below point at.
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_id_gym          ON members (id, gym_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_id_gym        ON inventory (id, gym_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_programs_id_gym ON workout_programs (id, gym_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_events_id_gym ON gym_events (id, gym_id);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('memberships',            'fk_memberships_member_same_gym',     'member_id',    'members', 'CASCADE'),
    ('attendance',             'fk_attendance_member_same_gym',      'member_id',    'members', 'CASCADE'),
    ('due_payments',           'fk_due_payments_member_same_gym',    'member_id',    'members', 'CASCADE'),
    ('member_portal_activity', 'fk_portal_activity_member_same_gym', 'member_id',    'members', 'CASCADE'),
    ('member_achievements',    'fk_member_achievements_member_same_gym', 'member_id', 'members', 'CASCADE'),
    ('gamification_awards',    'fk_gamification_awards_member_same_gym', 'member_id', 'members', 'CASCADE'),
    ('gym_event_completions',  'fk_gym_event_completions_member_same_gym', 'member_id', 'members', 'CASCADE'),
    ('gym_event_completions',  'fk_gym_event_completions_event_same_gym',  'event_id',  'gym_events', 'CASCADE'),
    ('program_assignments',    'fk_assignments_member_same_gym',     'member_id',    'members', 'CASCADE'),
    ('program_assignments',    'fk_assignments_program_same_gym',    'program_id',   'workout_programs', 'CASCADE'),
    ('inventory_units',        'fk_inventory_units_item_same_gym',   'inventory_id', 'inventory', 'CASCADE'),
    ('inventory_sales',        'fk_inventory_sales_item_same_gym',   'inventory_id', 'inventory', 'SET NULL (inventory_id)')
  ) AS t(child, conname, child_col, parent, on_delete)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.conname
         AND conrelid = format('public.%I', r.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, gym_id) REFERENCES public.%I (id, gym_id) ON DELETE %s',
        r.child, r.conname, r.child_col, r.parent, r.on_delete
      );
    END IF;
  END LOOP;
END $$;


-- ############################################################
-- 4 — INDEXES
-- ############################################################

-- ────────────────────────────────────────────────────────────
-- indexes on admin_messages
-- ────────────────────────────────────────────────────────────

-- Index for fast lookups by gym
CREATE INDEX IF NOT EXISTS idx_admin_messages_gym_id ON admin_messages(gym_id);

CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON admin_messages(created_at DESC);

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

-- ────────────────────────────────────────────────────────────
-- indexes on attendance
-- ────────────────────────────────────────────────────────────

-- attendance
CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance(gym_id);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);

CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date DESC);

-- Performance indexes for Issues 8 & 9 from the 27 June 2026 production audit.
-- Run: supabase db push

-- Issue 8: Compound index for the most common attendance query pattern.
-- Both dashboard RPC and attendance page query: WHERE gym_id = ? AND date = ?
-- A compound index allows an index-only scan instead of two separate single-column index scans.
CREATE INDEX IF NOT EXISTS idx_attendance_gym_date
  ON attendance(gym_id, date);

-- ────────────────────────────────────────────────────────────
-- indexes on due_payments
-- ────────────────────────────────────────────────────────────

-- due_payments
CREATE INDEX IF NOT EXISTS idx_due_payments_gym_id ON due_payments(gym_id);

-- ────────────────────────────────────────────────────────────
-- indexes on email_messages
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_messages_thread
  ON public.email_messages (thread_id, created_at);

-- Reply matching looks messages up by the id in a reply's In-Reply-To/References.
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id
  ON public.email_messages (message_id) WHERE message_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- indexes on email_threads
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_threads_list
  ON public.email_threads (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_threads_counterparty
  ON public.email_threads (counterparty_email, last_message_at DESC);

-- ────────────────────────────────────────────────────────────
-- indexes on gym_upi_config
-- ────────────────────────────────────────────────────────────

-- Index for fast gym lookup
CREATE INDEX IF NOT EXISTS idx_gym_upi_config_gym_id ON gym_upi_config(gym_id);

-- ────────────────────────────────────────────────────────────
-- indexes on gym_whatsapp_config
-- ────────────────────────────────────────────────────────────

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_gym_id ON gym_whatsapp_config(gym_id);

CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_phone_number_id ON gym_whatsapp_config(phone_number_id);

CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_enabled ON gym_whatsapp_config(enabled);

-- ────────────────────────────────────────────────────────────
-- indexes on gyms
-- ────────────────────────────────────────────────────────────

-- INDEXES

-- gyms
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);

  -- ── 3. Indexes ────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_gyms_subscription_status
    ON gyms(subscription_status);

  CREATE INDEX IF NOT EXISTS idx_gyms_trial_ends_at
    ON gyms(trial_ends_at)
    WHERE subscription_status = 'trial';

-- ────────────────────────────────────────────────────────────
-- indexes on inventory
-- ────────────────────────────────────────────────────────────

-- inventory
CREATE INDEX IF NOT EXISTS idx_inventory_gym_id ON inventory(gym_id);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(gym_id, category);

CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(gym_id, sku);

-- ────────────────────────────────────────────────────────────
-- indexes on inventory_sales
-- ────────────────────────────────────────────────────────────

-- inventory_sales
CREATE INDEX IF NOT EXISTS idx_inventory_sales_gym_id ON inventory_sales(gym_id);

CREATE INDEX IF NOT EXISTS idx_inventory_sales_inventory_id ON inventory_sales(inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_sales_sold_at ON inventory_sales(gym_id, sold_at DESC);

-- ────────────────────────────────────────────────────────────
-- indexes on inventory_units
-- ────────────────────────────────────────────────────────────

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_units_gym_id ON inventory_units(gym_id);

CREATE INDEX IF NOT EXISTS idx_inventory_units_inventory_id ON inventory_units(inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_units_barcode ON inventory_units(gym_id, barcode);

-- ────────────────────────────────────────────────────────────
-- indexes on gamification tables
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_member_achievements_gym_id ON member_achievements(gym_id);

-- The unique key leads with gym_id, so it already serves "awards of this gym";
-- this one serves the member-delete cascade.
CREATE INDEX IF NOT EXISTS idx_gamification_awards_member_id ON gamification_awards(member_id);

-- ────────────────────────────────────────────────────────────
-- indexes on gym_events / gym_event_completions
-- ────────────────────────────────────────────────────────────

-- Serves the attendance trigger ("active events of this gym") and the owner list.
CREATE INDEX IF NOT EXISTS idx_gym_events_gym_active ON gym_events(gym_id, is_active);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_gym_id    ON gym_event_completions(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_member_id ON gym_event_completions(member_id);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_event_id  ON gym_event_completions(event_id);

-- ────────────────────────────────────────────────────────────
-- indexes on member_portal_activity
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_portal_activity_gym
  ON member_portal_activity(gym_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_activity_member
  ON member_portal_activity(member_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- indexes on members
-- ────────────────────────────────────────────────────────────

-- members
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);

CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);

CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(gym_id, member_number);

CREATE INDEX IF NOT EXISTS idx_members_gym_created ON members(gym_id, created_at DESC);

-- Bonus: Partial index for dues queries — only indexes rows that actually have outstanding dues.
-- This makes the "Total Dues" dashboard stat query significantly faster on large datasets.
CREATE INDEX IF NOT EXISTS idx_members_gym_dues
  ON members(gym_id, pending_amount)
  WHERE pending_amount > 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_auth_user_id_unique
  ON public.members(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_email_lower
  ON public.members(LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_gym_member_code_unique
  ON public.members(gym_id, member_code)
  WHERE member_code IS NOT NULL;

-- Index for the portal management table query (gym-scoped, sorted by last activity)
CREATE INDEX IF NOT EXISTS idx_members_portal_status
  ON public.members(gym_id, portal_enabled, invitation_status);

CREATE INDEX IF NOT EXISTS idx_members_last_portal_login
  ON public.members(gym_id, last_portal_login DESC NULLS LAST)
  WHERE last_portal_login IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- indexes on memberships
-- ────────────────────────────────────────────────────────────

-- memberships
CREATE INDEX IF NOT EXISTS idx_memberships_gym_id ON memberships(gym_id);

CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);

CREATE INDEX IF NOT EXISTS idx_memberships_end_date ON memberships(end_date);

CREATE INDEX IF NOT EXISTS idx_memberships_start_date ON memberships(gym_id, start_date);

-- Add missing indexes to optimize report aggregations and window functions
CREATE INDEX IF NOT EXISTS idx_memberships_member_created ON memberships(member_id, created_at DESC);

-- Issue 9: Compound index for membership expiry status queries.
-- The idx_memberships_end_date single-column index has no gym_id, meaning it covers all gyms.
-- When the query planner uses it for a gym-scoped query, it must re-filter by gym_id after the scan.
-- This compound index enables an index-only scan for the dashboard RPC and expiring members logic.
CREATE INDEX IF NOT EXISTS idx_memberships_gym_end_date
  ON memberships(gym_id, end_date);

-- ────────────────────────────────────────────────────────────
-- indexes on notifications
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read) WHERE is_read = false;

-- Partial index the dispatcher scans every run: only rows still awaiting push.
CREATE INDEX IF NOT EXISTS idx_notifications_unpushed   ON notifications(created_at) WHERE pushed_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- indexes on program_assignments
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_program_assignments_gym
  ON public.program_assignments(gym_id);

CREATE INDEX IF NOT EXISTS idx_program_assignments_program
  ON public.program_assignments(program_id);

CREATE INDEX IF NOT EXISTS idx_program_assignments_member
  ON public.program_assignments(member_id);

-- ────────────────────────────────────────────────────────────
-- indexes on subscription_audit_logs
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_logs_gym_id    ON subscription_audit_logs(gym_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created   ON subscription_audit_logs(gym_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- indexes on subscription_requests
-- ────────────────────────────────────────────────────────────

  CREATE INDEX IF NOT EXISTS idx_sub_requests_gym_id ON subscription_requests(gym_id);

  CREATE INDEX IF NOT EXISTS idx_sub_requests_status ON subscription_requests(status);

-- ────────────────────────────────────────────────────────────
-- indexes on support_tickets
-- ────────────────────────────────────────────────────────────

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_gym_id ON support_tickets(gym_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- indexes on whatsapp_automation_logs
-- ────────────────────────────────────────────────────────────

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

-- Recreate it as a PARTIAL unique index that only constrains real sends.
-- Uses timezone('UTC', sent_at)::date — TIMESTAMPTZ::date is not immutable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_auto_logs_daily_dedup_sent
  ON whatsapp_automation_logs (member_id, template_name, (timezone('UTC', sent_at)::date))
  WHERE status = 'sent';

-- Composite index to resolve "the current cycle for this member+template"
-- quickly (latest row by sent_at within a member+template).
CREATE INDEX IF NOT EXISTS idx_wa_auto_logs_member_template_sent
  ON whatsapp_automation_logs (member_id, template_name, sent_at DESC);

-- ────────────────────────────────────────────────────────────
-- indexes on whatsapp_messages
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- indexes on whatsapp_send_queue
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- indexes on whatsapp_webhook_logs
-- ────────────────────────────────────────────────────────────

-- Indexes for webhook logs
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_request_id ON whatsapp_webhook_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_phone_number_id ON whatsapp_webhook_logs(phone_number_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_event_type ON whatsapp_webhook_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_created_at ON whatsapp_webhook_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_processed ON whatsapp_webhook_logs(processed);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_signature_valid ON whatsapp_webhook_logs(signature_valid);

-- ────────────────────────────────────────────────────────────
-- indexes on workout_programs
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workout_programs_gym_id ON workout_programs(gym_id);

CREATE INDEX IF NOT EXISTS idx_workout_programs_created ON workout_programs(gym_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_whatsapp_recipient_window_first_sent ON whatsapp_recipient_window (first_sent_at);


-- ############################################################
-- 5 — FUNCTIONS
-- ############################################################

-- ────────────────────────────────────────────────────────────
-- Helpers used by policies and other functions
-- ────────────────────────────────────────────────────────────

-- Security hardening: stop owners editing privileged columns, close
-- check_gym_active to anonymous callers.
-- Idempotent. Run in the Supabase SQL editor.
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

-- ────────────────────────────────────────────────────────────
-- Auth / subscription gate
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- Member PWA read helpers
-- ────────────────────────────────────────────────────────────

-- Security hardening, part 2
--   A. Members no longer read the whole gyms row (billing, ...)
--   B. gym_whatsapp_config becomes server-only (owners cannot repoint it)
--   C. Child rows must belong to the same gym as their parent
-- Idempotent. Run in the Supabase SQL editor AFTER deploying the app change
-- in lib/member/member-data.ts (see ordering note in A).

-- ── A. Member gym branding via a narrow RPC ──────────────────
-- The "Members can view their gym" policy is row-level, so any member could
-- `select *` from gyms through PostgREST and read last_payment_*,
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

-- ────────────────────────────────────────────────────────────
-- Gamification (XP, streaks, leaderboards)
-- ────────────────────────────────────────────────────────────
--
-- Nothing here is snapshotted: XP, streaks and board positions are computed on
-- read from attendance + memberships, so a kiosk check-in moves the rankings the
-- next time anyone opens a board. The same rules are implemented in TypeScript
-- in lib/gamification/ (streak.ts, xp.ts, periods.ts, maskName.ts) and pinned by
-- __tests__/gamification/. Change both together.
--
-- SECURITY: the previous versions took a member id / gym id argument and were
-- SECURITY DEFINER, so any signed-in user could read another gym's members by
-- passing its id. None of the callable functions below accept an id: the caller
-- is resolved from auth.uid() and nothing else.
--
-- RULES
--   * Every date is an Asia/Kolkata date. The database runs in UTC, so
--     CURRENT_DATE was the wrong day between 00:00 and 05:30 IST.
--   * A member's attended days are DISTINCT days: a morning and an evening
--     check-in on one day count once.
--   * Day rollover has a 5 hour tolerance. A row saved before 05:00 IST for
--     that same calendar date counts for the PREVIOUS day when the member has no
--     row for the previous day (a late check-in keeps the streak); if the
--     previous day already has a row it counts for the new day. Rows whose save
--     date differs from their attendance date were back/forward-dated by the
--     owner and are taken as-is. The tolerance is a fixed constant and is
--     deliberately not a setting and not surfaced to users anywhere.
--   * "gym today" is the IST date of now() - 5 hours. A streak is alive while
--     its last attended day is >= gym today - 1. Today is never counted before
--     the check-in exists: streak_pending says "alive, but not yet attended on
--     the real IST calendar today".

-- Old signatures trusted a caller-supplied id. They are dropped (not replaced)
-- so no overload with the leak can survive on a database that had them.
DROP FUNCTION IF EXISTS public.get_member_gamification(UUID);
DROP FUNCTION IF EXISTS public.get_gym_leaderboard(UUID, INT);

-- Highest matching multiplier factor for one day, 1 when none matches.
-- A multiplier matches when (days_of_week is not an array OR contains the day's
-- dow, 0 = Sunday) AND (no start_date OR day >= start) AND (no end_date OR
-- day <= end). The factor is rounded to 2 decimals and clamped to 1..5.
--
-- Each element is evaluated inside its own exception block: the JSON is
-- owner-editable through PostgREST, and one malformed entry (a bad date string)
-- must not make every board in the gym fail. A malformed entry is skipped.
CREATE OR REPLACE FUNCTION public.gamification_day_factor(p_multipliers JSONB, p_day DATE)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_best   NUMERIC := 1;
  v_m      JSONB;
  v_factor NUMERIC;
  v_ok     BOOLEAN;
BEGIN
  IF p_day IS NULL OR p_multipliers IS NULL OR jsonb_typeof(p_multipliers) <> 'array' THEN
    RETURN 1;
  END IF;

  FOR v_m IN SELECT e.value FROM jsonb_array_elements(p_multipliers) AS e(value)
  LOOP
    BEGIN
      v_ok := jsonb_typeof(v_m) = 'object'
              AND jsonb_typeof(v_m -> 'factor') IS NOT DISTINCT FROM 'number';

      IF v_ok AND jsonb_typeof(v_m -> 'days_of_week') IS NOT DISTINCT FROM 'array' THEN
        v_ok := (v_m -> 'days_of_week') @> to_jsonb(EXTRACT(DOW FROM p_day)::int);
      END IF;
      IF v_ok AND jsonb_typeof(v_m -> 'start_date') IS NOT DISTINCT FROM 'string' THEN
        v_ok := p_day >= (v_m ->> 'start_date')::date;
      END IF;
      IF v_ok AND jsonb_typeof(v_m -> 'end_date') IS NOT DISTINCT FROM 'string' THEN
        v_ok := p_day <= (v_m ->> 'end_date')::date;
      END IF;

      IF v_ok THEN
        v_factor := LEAST(GREATEST(ROUND((v_m ->> 'factor')::numeric, 2), 1), 5);
        IF v_factor > v_best THEN
          v_best := v_factor;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- malformed entry: ignore it, keep the rest
    END;
  END LOOP;

  RETURN v_best;
END;
$$;

-- "Akhil Prasad" -> "Akhil P.". What one member sees of another: enough to
-- recognise a friend, not enough to identify a stranger. Single-word names are
-- returned unchanged; case is left exactly as the owner typed it.
CREATE OR REPLACE FUNCTION public.gamification_mask_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_parts TEXT[];
  v_n     INT;
BEGIN
  v_parts := regexp_split_to_array(
    btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g')),
    ' '
  );
  v_n := COALESCE(array_length(v_parts, 1), 0);
  IF v_n <= 1 THEN
    RETURN COALESCE(v_parts[1], '');
  END IF;
  RETURN v_parts[1] || ' ' || left(v_parts[v_n], 1) || '.';
END;
$$;

-- The signed-in member's own stats. Takes NO argument on purpose: the member row
-- is resolved from auth.uid(). Returns NULL for a caller with no linked member.
CREATE OR REPLACE FUNCTION public.get_member_gamification()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_member_id   UUID;
  v_gym_id      UUID;
  v_portal      BOOLEAN;
  v_visible     BOOLEAN;
  -- The real IST calendar date, and the date used to decide whether a streak
  -- is still alive (see RULES above).
  v_ist_today   DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_gym_today   DATE := ((now() - INTERVAL '5 hours') AT TIME ZONE 'Asia/Kolkata')::date;
  -- settings
  v_enabled     BOOLEAN;
  v_xp_checkin  INT;
  v_xp_renewal  INT;
  v_xp_portal   INT;
  v_weekly_goal INT;
  v_multipliers JSONB;
  v_badge_rules JSONB;
  v_weekly_prize  TEXT;
  v_monthly_prize TEXT;
  -- results
  v_total_days  INT;
  v_d7          INT;
  v_d30         INT;
  v_checkin_xp  INT;
  v_longest     INT;
  v_cur_len     INT;
  v_last_day    DATE;
  v_streak      INT := 0;
  v_pending     BOOLEAN := false;
  v_memberships INT;
  v_morning     INT;
  v_xp          INT;
  v_event_xp    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.id, m.gym_id, (m.portal_activated_at IS NOT NULL), m.show_on_leaderboard
    INTO v_member_id, v_gym_id, v_portal, v_visible
    FROM members m
   WHERE m.auth_user_id = v_uid
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- LEFT JOIN from a one-row source so a gym with no settings row still yields
  -- a row of defaults (SELECT INTO on zero rows would null every variable).
  SELECT COALESCE(s.leaderboards_enabled, true),
         COALESCE(s.xp_per_checkin, 10),
         COALESCE(s.xp_per_renewal, 50),
         COALESCE(s.xp_portal_activation, 25),
         COALESCE(s.weekly_goal_days, 4),
         COALESCE(s.xp_multipliers, '[]'::jsonb),
         COALESCE(s.badge_rules, '{}'::jsonb),
         s.weekly_prize,
         s.monthly_prize
    INTO v_enabled, v_xp_checkin, v_xp_renewal, v_xp_portal, v_weekly_goal,
         v_multipliers, v_badge_rules, v_weekly_prize, v_monthly_prize
    FROM (SELECT 1) AS one
    LEFT JOIN gym_gamification_settings s ON s.gym_id = v_gym_id;

  WITH days AS (
    -- Effective day per row. The nested CASE guarantees the previous-day probe
    -- only runs for the rare row saved before 05:00 IST on its own date.
    SELECT DISTINCT
           CASE
             WHEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date = a.date
                  AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::time < TIME '05:00'
             THEN CASE
                    WHEN NOT EXISTS (
                      SELECT 1 FROM attendance p
                       WHERE p.member_id = a.member_id
                         AND p.date = a.date - 1
                    )
                    THEN a.date - 1
                    ELSE a.date
                  END
             ELSE a.date
           END AS day
      FROM attendance a
     WHERE a.member_id = v_member_id
  ),
  runs AS (
    -- Gaps and islands: consecutive days share (day - row_number). Days after
    -- the real today (forward-dated by the owner) cannot be part of a streak.
    SELECT d.day,
           d.day - (ROW_NUMBER() OVER (ORDER BY d.day))::int AS grp
      FROM days d
     WHERE d.day <= v_ist_today
  ),
  islands AS (
    SELECT COUNT(*)::int AS len, MAX(r.day) AS last_day
      FROM runs r
     GROUP BY r.grp
  )
  SELECT
    (SELECT COUNT(*)::int FROM days),
    (SELECT COUNT(*)::int FROM days d WHERE d.day BETWEEN v_gym_today - 6  AND v_gym_today),
    (SELECT COUNT(*)::int FROM days d WHERE d.day BETWEEN v_gym_today - 29 AND v_gym_today),
    (SELECT COALESCE(ROUND(SUM(v_xp_checkin * public.gamification_day_factor(v_multipliers, d.day))), 0)::int
       FROM days d),
    (SELECT COALESCE(MAX(i.len), 0) FROM islands i),
    (SELECT i.len FROM islands i ORDER BY i.last_day DESC LIMIT 1),
    (SELECT MAX(i.last_day) FROM islands i)
  INTO v_total_days, v_d7, v_d30, v_checkin_xp, v_longest, v_cur_len, v_last_day;

  IF v_last_day IS NOT NULL AND v_last_day >= v_gym_today - 1 THEN
    v_streak  := v_cur_len;
    v_pending := v_last_day < v_ist_today;
  END IF;

  SELECT COUNT(*)::int INTO v_memberships
    FROM memberships ms
   WHERE ms.member_id = v_member_id;

  -- Raw morning-session rows (not days): the "early bird" achievement counts
  -- sessions, and reading it here avoids the 6-month window of the member app's
  -- attendance query.
  SELECT COUNT(*)::int INTO v_morning
    FROM attendance a
   WHERE a.member_id = v_member_id
     AND a.session = 'morning';

  -- Bonus XP from completed gym events: a snapshot per completion, so editing
  -- an event later never changes what a member already earned.
  SELECT COALESCE(SUM(c.xp_awarded), 0)::int INTO v_event_xp
    FROM gym_event_completions c
   WHERE c.member_id = v_member_id;

  v_xp := v_checkin_xp
        + v_xp_renewal * v_memberships
        + (CASE WHEN v_portal THEN v_xp_portal ELSE 0 END)
        + v_event_xp;

  RETURN jsonb_build_object(
    'xp',                   v_xp,
    'event_xp',             v_event_xp,
    'level_xp_per_level',   300,
    'streak',               v_streak,
    'streak_pending',       v_pending,
    'longest_streak',       v_longest,
    'total_days',           v_total_days,
    'days_last_7',          v_d7,
    'days_last_30',         v_d30,
    'attended_today',       COALESCE(v_last_day = v_ist_today, false),
    'weekly_goal_days',     v_weekly_goal,
    'memberships',          v_memberships,
    'portal_activated',     v_portal,
    'leaderboards_enabled', v_enabled,
    'show_on_leaderboard',  v_visible,
    'total_morning',        v_morning,
    'badge_rules',          v_badge_rules,
    'weekly_prize',         v_weekly_prize,
    'monthly_prize',        v_monthly_prize,
    -- Legacy keys read by app/m/rewards/page.tsx. They now carry day counts
    -- (not session rows) over the rolling windows.
    'total_attendance',     v_total_days,
    'this_week',            v_d7,
    'this_month',           v_d30
  );
END;
$$;

-- One board for the caller's own gym. The gym is derived, never passed:
-- a gym owner gets their gym; otherwise a linked member gets theirs; anyone
-- else gets no rows.
--
--   p_board  'week'   attended days in the rolling last 7 days
--            'month'  attended days in the rolling last 30 days
--            'streak' current streak
--            'all'    lifetime XP
--
-- What a MEMBER caller gets is deliberately narrow: nothing at all when the gym
-- switched leaderboards off, masked names, no member ids except their own, and
-- no row for anyone who opted out (members.show_on_leaderboard = false) other
-- than themselves. Owners always get full rows, including with the switch off,
-- so they can preview the board before enabling it.
--
-- Only members with value > 0 are listed, plus the caller's own row, which is
-- always returned even outside the top p_limit so "you are #37" can be shown.
-- Set-based: one pass over the gym's attendance, no per-member subqueries.
CREATE OR REPLACE FUNCTION public.get_gym_leaderboard(
  p_board TEXT DEFAULT 'week',
  p_limit INT  DEFAULT 50
)
RETURNS TABLE(
  member_id      UUID,
  display_name   TEXT,
  rank           INT,
  value          INT,
  xp             INT,
  streak         INT,
  streak_pending BOOLEAN,
  days_last_7    INT,
  days_last_30   INT,
  is_me          BOOLEAN,
  total_members  INT,
  total_days     INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
-- ^ The OUT columns above are also PL/pgSQL variables; without the directive a
--   bare column of the same name inside the query is "ambiguous".
DECLARE
  v_uid         UUID := auth.uid();
  v_gym_id      UUID;
  v_me          UUID;
  v_is_owner    BOOLEAN := false;
  v_board       TEXT := COALESCE(p_board, 'week');
  v_limit       INT  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_ist_today   DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_gym_today   DATE := ((now() - INTERVAL '5 hours') AT TIME ZONE 'Asia/Kolkata')::date;
  v_enabled     BOOLEAN;
  v_xp_checkin  INT;
  v_xp_renewal  INT;
  v_xp_portal   INT;
  v_multipliers JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF v_board NOT IN ('week', 'month', 'streak', 'all') THEN
    RAISE EXCEPTION 'invalid leaderboard board: %', v_board USING ERRCODE = '22023';
  END IF;

  SELECT g.id INTO v_gym_id
    FROM gyms g
   WHERE g.owner_id = v_uid
   ORDER BY g.created_at
   LIMIT 1;

  IF v_gym_id IS NOT NULL THEN
    v_is_owner := true;
  ELSE
    SELECT m.id, m.gym_id INTO v_me, v_gym_id
      FROM members m
     WHERE m.auth_user_id = v_uid
     LIMIT 1;

    IF v_gym_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(s.leaderboards_enabled, true),
         COALESCE(s.xp_per_checkin, 10),
         COALESCE(s.xp_per_renewal, 50),
         COALESCE(s.xp_portal_activation, 25),
         COALESCE(s.xp_multipliers, '[]'::jsonb)
    INTO v_enabled, v_xp_checkin, v_xp_renewal, v_xp_portal, v_multipliers
    FROM (SELECT 1) AS one
    LEFT JOIN gym_gamification_settings s ON s.gym_id = v_gym_id;

  IF NOT v_is_owner AND NOT v_enabled THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH days AS (
    -- Effective day per row; same expression as get_member_gamification().
    SELECT DISTINCT
           a.member_id AS mid,
           CASE
             WHEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date = a.date
                  AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::time < TIME '05:00'
             THEN CASE
                    WHEN NOT EXISTS (
                      SELECT 1 FROM attendance p
                       WHERE p.member_id = a.member_id
                         AND p.date = a.date - 1
                    )
                    THEN a.date - 1
                    ELSE a.date
                  END
             ELSE a.date
           END AS day
      FROM attendance a
     WHERE a.gym_id = v_gym_id
  ),
  factors AS (
    -- The multiplier depends on the day only, so it is resolved once per
    -- distinct day in the gym instead of once per member-day.
    SELECT f.day, public.gamification_day_factor(v_multipliers, f.day) AS factor
      FROM (SELECT DISTINCT d.day FROM days d) f
  ),
  agg AS (
    SELECT d.mid,
           COUNT(*)::int AS tdays,
           (COUNT(*) FILTER (WHERE d.day BETWEEN v_gym_today - 6  AND v_gym_today))::int AS d7,
           (COUNT(*) FILTER (WHERE d.day BETWEEN v_gym_today - 29 AND v_gym_today))::int AS d30,
           SUM(v_xp_checkin * f.factor) AS checkin_xp
      FROM days d
      JOIN factors f ON f.day = d.day
     GROUP BY d.mid
  ),
  runs AS (
    SELECT d.mid,
           d.day,
           d.day - (ROW_NUMBER() OVER (PARTITION BY d.mid ORDER BY d.day))::int AS grp
      FROM days d
     WHERE d.day <= v_ist_today
  ),
  islands AS (
    SELECT r.mid, COUNT(*)::int AS len, MAX(r.day) AS last_day
      FROM runs r
     GROUP BY r.mid, r.grp
  ),
  cur AS (
    -- The run that contains the member's most recent attended day.
    SELECT DISTINCT ON (i.mid) i.mid, i.len, i.last_day
      FROM islands i
     ORDER BY i.mid, i.last_day DESC
  ),
  ms AS (
    SELECT s.member_id AS mid, COUNT(*)::int AS cnt
      FROM memberships s
     WHERE s.gym_id = v_gym_id
     GROUP BY s.member_id
  ),
  evx AS (
    -- Bonus XP from completed gym events (see get_member_gamification()).
    SELECT c.member_id AS mid, SUM(c.xp_awarded)::int AS xp
      FROM gym_event_completions c
     WHERE c.gym_id = v_gym_id
     GROUP BY c.member_id
  ),
  stats AS (
    SELECT m.id   AS mid,
           m.name AS nm,
           m.show_on_leaderboard AS visible,
           COALESCE(m.id = v_me, false) AS me,
           COALESCE(a.tdays, 0) AS tdays,
           COALESCE(a.d7, 0)    AS d7,
           COALESCE(a.d30, 0)   AS d30,
           (ROUND(COALESCE(a.checkin_xp, 0))
              + v_xp_renewal * COALESCE(ms.cnt, 0)
              + (CASE WHEN m.portal_activated_at IS NOT NULL THEN v_xp_portal ELSE 0 END)
              + COALESCE(ev.xp, 0)
           )::int AS xp_total,
           (CASE WHEN c.last_day >= v_gym_today - 1 THEN c.len ELSE 0 END)::int AS cur_streak,
           COALESCE(c.last_day >= v_gym_today - 1 AND c.last_day < v_ist_today, false) AS pending
      FROM members m
      LEFT JOIN agg a ON a.mid = m.id
      LEFT JOIN cur c ON c.mid = m.id
      LEFT JOIN ms    ON ms.mid = m.id
      LEFT JOIN evx ev ON ev.mid = m.id
     WHERE m.gym_id = v_gym_id
  ),
  valued AS (
    SELECT st.*,
           (CASE v_board
              WHEN 'week'   THEN st.d7
              WHEN 'month'  THEN st.d30
              WHEN 'streak' THEN st.cur_streak
              ELSE st.xp_total
            END)::int AS val
      FROM stats st
  ),
  eligible AS (
    SELECT v.*
      FROM valued v
     WHERE (v_is_owner OR v.visible OR v.me)
       AND (v.val > 0 OR v.me)
  ),
  ranked AS (
    SELECT e.*,
           (RANK()       OVER (ORDER BY e.val DESC, e.nm ASC))::int        AS rnk,
           -- RANK can tie; the cut-off needs a strict position.
           (ROW_NUMBER() OVER (ORDER BY e.val DESC, e.nm ASC, e.mid))::int AS pos,
           (COUNT(*)     OVER ())::int                                     AS total
      FROM eligible e
  )
  SELECT (CASE WHEN v_is_owner OR r.me THEN r.mid ELSE NULL END)::uuid,
         (CASE WHEN v_is_owner THEN btrim(r.nm) ELSE public.gamification_mask_name(r.nm) END)::text,
         r.rnk,
         r.val,
         r.xp_total,
         r.cur_streak,
         r.pending,
         r.d7,
         r.d30,
         r.me,
         r.total,
         r.tdays
    FROM ranked r
   WHERE r.pos <= v_limit OR r.me
   ORDER BY r.pos;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Gamification events
-- ────────────────────────────────────────────────────────────
-- Mirrored by lib/gamification/events.ts (eventProgress). Change both together.
-- The attended-day expression is the SAME one get_member_gamification() uses
-- (5-hour rollover, previous-day probe on raw rows); the session filter is
-- applied AFTER the effective day is resolved, like attendedDays() in streak.ts.

-- Progress of one member towards one event definition. Days after the real IST
-- today are ignored (forward-dated rows cannot satisfy a goal early).
-- Internal helper: only the definer functions below call it.
CREATE OR REPLACE FUNCTION public.gym_event_progress(
  p_member_id   UUID,
  p_goal_type   TEXT,
  p_start       DATE,
  p_end         DATE,
  p_min_minutes INT,
  p_session     TEXT
)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH rws AS (
    -- An effective day is a.date or a.date - 1, so the scan needs one extra day
    -- at the top of the window.
    SELECT a.session,
           a.check_out_time,
           a.created_at,
           CASE
             WHEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date = a.date
                  AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::time < TIME '05:00'
             THEN CASE
                    WHEN NOT EXISTS (
                      SELECT 1 FROM attendance p
                       WHERE p.member_id = a.member_id
                         AND p.date = a.date - 1
                    )
                    THEN a.date - 1
                    ELSE a.date
                  END
             ELSE a.date
           END AS day
      FROM attendance a
     WHERE a.member_id = p_member_id
       AND a.date BETWEEN p_start AND p_end + 1
  ),
  dys AS (
    SELECT DISTINCT r.day
      FROM rws r
     WHERE r.day BETWEEN p_start AND LEAST(p_end, (now() AT TIME ZONE 'Asia/Kolkata')::date)
       AND (p_goal_type = 'streak_days' OR p_session IS NULL OR r.session = p_session)
       AND (p_goal_type <> 'long_sessions'
            OR (r.check_out_time IS NOT NULL
                AND p_min_minutes IS NOT NULL
                AND r.check_out_time - r.created_at >= p_min_minutes * INTERVAL '1 minute'))
  ),
  runs AS (
    SELECT d.day - (ROW_NUMBER() OVER (ORDER BY d.day))::int AS grp FROM dys d
  )
  SELECT (CASE
            WHEN p_goal_type = 'streak_days'
            THEN COALESCE((SELECT MAX(c.len) FROM (SELECT COUNT(*) AS len FROM runs GROUP BY grp) c), 0)
            ELSE (SELECT COUNT(*) FROM dys)
          END)::int;
$$;

-- Complete every active event of the member's gym whose goal is now met.
-- ON CONFLICT DO NOTHING: a completion is never repeated and never removed.
-- Called by the attendance trigger; not callable by clients (it takes a member
-- id, so exposing it would let anyone probe other members).
CREATE OR REPLACE FUNCTION public.evaluate_member_events(p_member_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gym_id UUID;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_ev     RECORD;
  v_n      INT := 0;
BEGIN
  SELECT m.gym_id INTO v_gym_id FROM members m WHERE m.id = p_member_id;
  IF v_gym_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_ev IN
    SELECT e.*
      FROM gym_events e
     WHERE e.gym_id = v_gym_id
       AND e.is_active
       AND e.start_date <= v_today
       AND NOT EXISTS (
         SELECT 1 FROM gym_event_completions c
          WHERE c.event_id = e.id AND c.member_id = p_member_id
       )
  LOOP
    IF public.gym_event_progress(
         p_member_id, v_ev.goal_type, v_ev.start_date, v_ev.end_date,
         v_ev.min_session_minutes, v_ev.session_filter
       ) >= v_ev.goal_target
    THEN
      INSERT INTO gym_event_completions (gym_id, event_id, member_id, xp_awarded, reward_text)
      VALUES (v_gym_id, v_ev.id, p_member_id, v_ev.reward_xp, v_ev.reward_text)
      ON CONFLICT (event_id, member_id) DO NOTHING;
      IF FOUND THEN
        v_n := v_n + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

-- Evaluate ALL members of the gym for one event, so a back-dated window awards
-- immediately after the owner creates or edits it. Owner only: the gym is
-- looked up from the event and compared with auth.uid().
CREATE OR REPLACE FUNCTION public.evaluate_gym_events(p_event_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ev    gym_events%ROWTYPE;
  v_owner UUID;
  v_n     INT := 0;
BEGIN
  SELECT e.* INTO v_ev FROM gym_events e WHERE e.id = p_event_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT g.owner_id INTO v_owner FROM gyms g WHERE g.id = v_ev.gym_id;
  IF auth.uid() IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT v_ev.is_active OR v_ev.start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN 0;
  END IF;

  INSERT INTO gym_event_completions (gym_id, event_id, member_id, xp_awarded, reward_text)
  SELECT v_ev.gym_id, v_ev.id, m.id, v_ev.reward_xp, v_ev.reward_text
    FROM members m
   WHERE m.gym_id = v_ev.gym_id
     AND public.gym_event_progress(
           m.id, v_ev.goal_type, v_ev.start_date, v_ev.end_date,
           v_ev.min_session_minutes, v_ev.session_filter
         ) >= v_ev.goal_target
  ON CONFLICT (event_id, member_id) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Attendance trigger body. A failure here must never block a check-in, so any
-- error is downgraded to a warning (the next attendance write or the owner's
-- evaluate_gym_events() call re-evaluates). An UPDATE only matters when a
-- column the rules read changed (check-out is the usual one).
CREATE OR REPLACE FUNCTION public.trg_evaluate_events_on_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.check_out_time IS NOT DISTINCT FROM OLD.check_out_time
     AND NEW.date           IS NOT DISTINCT FROM OLD.date
     AND NEW.session        IS NOT DISTINCT FROM OLD.session
  THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.evaluate_member_events(NEW.member_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'evaluate_member_events failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Event definition guard: at most 20 ACTIVE events per gym, and once anyone has
-- completed an event its goal and start can no longer change (a completion
-- would otherwise stop matching the rule it was earned under). end_date, reward
-- text/xp (history is snapshotted) and is_active stay editable.
CREATE OR REPLACE FUNCTION public.guard_gym_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active) THEN
    IF (SELECT COUNT(*) FROM gym_events e
         WHERE e.gym_id = NEW.gym_id AND e.is_active AND e.id <> NEW.id) >= 20 THEN
      RAISE EXCEPTION 'a gym can have at most 20 active events' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.goal_type           IS DISTINCT FROM OLD.goal_type
       OR NEW.goal_target         IS DISTINCT FROM OLD.goal_target
       OR NEW.min_session_minutes IS DISTINCT FROM OLD.min_session_minutes
       OR NEW.session_filter      IS DISTINCT FROM OLD.session_filter
       OR NEW.start_date          IS DISTINCT FROM OLD.start_date)
     AND EXISTS (SELECT 1 FROM gym_event_completions c WHERE c.event_id = OLD.id)
  THEN
    RAISE EXCEPTION 'event goal and start date are locked once a member has completed it'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- The signed-in member's events: active ones that have not ended more than 14
-- days ago (upcoming included). Takes NO argument; the member is resolved from
-- auth.uid(), so another member's or gym's data cannot be requested. Returns
-- NULL for a caller with no linked member.
CREATE OR REPLACE FUNCTION public.get_member_events()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_member_id UUID;
  v_gym_id    UUID;
  v_today     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_result    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.id, m.gym_id INTO v_member_id, v_gym_id
    FROM members m
   WHERE m.auth_user_id = v_uid
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.end_date, x.start_date, x.created_at), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT e.end_date, e.start_date, e.created_at,
             jsonb_build_object(
               'id',                e.id,
               'title',             e.title,
               'description',       e.description,
               'goalType',          e.goal_type,
               'goalTarget',        e.goal_target,
               'minSessionMinutes', e.min_session_minutes,
               'sessionFilter',     e.session_filter,
               'startDate',         e.start_date,
               'endDate',           e.end_date,
               'rewardXp',          COALESCE(c.xp_awarded, e.reward_xp),
               -- Not COALESCE: a completion with no item must not pick up an item
               -- the owner added to the event afterwards.
               'rewardText',        CASE WHEN c.id IS NOT NULL THEN c.reward_text ELSE e.reward_text END,
               -- A completed event reads as full even if the rule would now be
               -- evaluated against fewer days (e.g. an attendance row deleted).
               'progress',          CASE WHEN c.id IS NOT NULL
                                         THEN GREATEST(pr.p, e.goal_target)
                                         ELSE pr.p END,
               'completed',         c.id IS NOT NULL,
               'completedAt',       c.completed_at,
               'rewardGiven',       c.reward_given_at IS NOT NULL
             ) AS item
        FROM gym_events e
        LEFT JOIN gym_event_completions c
               ON c.event_id = e.id AND c.member_id = v_member_id
        CROSS JOIN LATERAL (
          SELECT public.gym_event_progress(
                   v_member_id, e.goal_type, e.start_date, e.end_date,
                   e.min_session_minutes, e.session_filter
                 ) AS p
        ) pr
       WHERE e.gym_id = v_gym_id
         AND e.is_active
         AND e.end_date >= v_today - 14
    ) x;

  RETURN v_result;
END;
$$;

-- Leaderboard opt-out. Updates ONLY the caller's own linked member row and
-- returns the stored value (NULL when the caller has no member row).
CREATE OR REPLACE FUNCTION public.set_leaderboard_visibility(p_visible BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_result BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_visible IS NULL THEN
    RAISE EXCEPTION 'p_visible must be true or false' USING ERRCODE = '22004';
  END IF;

  UPDATE members
     SET show_on_leaderboard = p_visible
   WHERE auth_user_id = v_uid
  RETURNING show_on_leaderboard INTO v_result;

  RETURN v_result;
END;
$$;

-- Makes achievement unlocks permanent for the caller's own member row.
-- Returns every achievement the caller holds; is_new marks the ones inserted by
-- this call so the app can celebrate exactly once.
--
-- Codes are format-checked and capped because this is callable with the public
-- anon key + a member JWT: without the cap a member could write unbounded rows.
CREATE OR REPLACE FUNCTION public.record_member_achievements(p_codes TEXT[])
RETURNS TABLE(code TEXT, earned_at TIMESTAMPTZ, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid       UUID := auth.uid();
  v_member_id UUID;
  v_gym_id    UUID;
  v_codes     TEXT[] := COALESCE(p_codes, ARRAY[]::TEXT[]);
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT m.id, m.gym_id INTO v_member_id, v_gym_id
    FROM members m
   WHERE m.auth_user_id = v_uid
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN;
  END IF;

  IF cardinality(v_codes) > 100 THEN
    RAISE EXCEPTION 'too many achievement codes (max 100)' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_codes) AS u(c)
     WHERE u.c IS NULL OR u.c !~ '^[a-z0-9-]{1,60}$'
  ) THEN
    RAISE EXCEPTION 'invalid achievement code' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO member_achievements (member_id, gym_id, code)
    SELECT v_member_id, v_gym_id, x.c
      FROM (SELECT DISTINCT u.c FROM unnest(v_codes) AS u(c)) x
    -- Named constraint, not a column list: (member_id, code) would collide with
    -- the OUT column `code`.
    ON CONFLICT ON CONSTRAINT member_achievements_member_code_key DO NOTHING
    RETURNING member_achievements.code AS c, member_achievements.earned_at AS earned
  )
  -- The second branch reads the pre-statement snapshot, so it never sees the
  -- rows `ins` just wrote: the two branches cannot overlap.
  SELECT i.c, i.earned, true
    FROM ins i
  UNION ALL
  SELECT ma.code, ma.earned_at, false
    FROM member_achievements ma
   WHERE ma.member_id = v_member_id
   ORDER BY 2, 1;
END;
$$;

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

-- ────────────────────────────────────────────────────────────
-- Owner dashboard and reports
-- ────────────────────────────────────────────────────────────

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
    -- Imported memberships carry plan details only; no payment was taken. The import stamps
    -- created_at as midnight UTC of start_date. Keep in sync with lib/payments/import-membership.ts.
    AND NOT (
      ms.created_at = (ms.start_date::timestamp AT TIME ZONE 'UTC')
      AND EXISTS (SELECT 1 FROM public.members mb WHERE mb.id = ms.member_id AND mb.is_imported)
    )
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

-- ────────────────────────────────────────────────────────────
-- Inventory
-- ────────────────────────────────────────────────────────────

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

CREATE OR REPLACE FUNCTION sell_inventory_item(
  p_inventory_id UUID,
  p_quantity     INTEGER,
  p_unit_price   NUMERIC,
  p_payment_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- ────────────────────────────────────────────────────────────
-- Usage stats and audit
-- ────────────────────────────────────────────────────────────

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

-- Remembers a number typed at signup. p_consent NULL leaves consent untouched; true/false is recorded
-- with a timestamp only when it changes. Ticking again after an unsubscribe is a fresh opt-in.
CREATE OR REPLACE FUNCTION public.record_owner_phone_lead(
  p_phone text, p_email text, p_full_name text, p_user_id uuid, p_consent boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.owner_phone_leads AS l
    (phone_e164, email, full_name, user_id, marketing_consent, marketing_consent_at)
  VALUES
    (p_phone, p_email, p_full_name, p_user_id,
     COALESCE(p_consent, false),
     CASE WHEN p_consent IS TRUE THEN pg_catalog.now() END)
  ON CONFLICT (phone_e164) DO UPDATE SET
    last_entered_at = pg_catalog.now(),
    entry_count     = l.entry_count + 1,
    user_id         = EXCLUDED.user_id,
    email           = COALESCE(EXCLUDED.email, l.email),
    full_name       = COALESCE(EXCLUDED.full_name, l.full_name),
    marketing_consent = CASE WHEN p_consent IS NULL THEN l.marketing_consent ELSE p_consent END,
    marketing_consent_at = CASE
      WHEN p_consent IS NULL THEN l.marketing_consent_at
      WHEN p_consent IS TRUE AND (NOT l.marketing_consent OR l.unsubscribed_at IS NOT NULL) THEN pg_catalog.now()
      WHEN p_consent IS FALSE AND l.marketing_consent THEN pg_catalog.now()
      ELSE l.marketing_consent_at
    END,
    unsubscribed_at = CASE WHEN p_consent IS TRUE THEN NULL ELSE l.unsubscribed_at END;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_owner_phone_lead_verified(p_phone text, p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.owner_phone_leads
     SET verified_at = COALESCE(verified_at, pg_catalog.now()),
         user_id     = p_user_id
   WHERE phone_e164 = p_phone;
$$;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ────────────────────────────────────────────────────────────
-- Support inbox (service-role only)
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- Maintenance
-- ────────────────────────────────────────────────────────────

-- Auto-delete old webhook logs (keep last 7 days)
CREATE OR REPLACE FUNCTION delete_old_whatsapp_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_webhook_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- Trigger functions — column guards
-- ────────────────────────────────────────────────────────────

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

-- members.show_on_leaderboard is the MEMBER's privacy choice. Owner RLS permits
-- row updates on members, so without this an owner could PATCH an opted-out
-- member back onto the board. Only the member themself (through
-- set_leaderboard_visibility) or a trusted server role may change it. An update
-- that leaves the value unchanged passes, so owner forms that write the whole
-- row keep working.
CREATE OR REPLACE FUNCTION public.guard_member_leaderboard_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.show_on_leaderboard IS NOT DISTINCT FROM OLD.show_on_leaderboard THEN
    RETURN NEW;
  END IF;
  IF public.is_trusted_db_caller() THEN
    RETURN NEW;
  END IF;
  IF OLD.auth_user_id IS NOT NULL AND OLD.auth_user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'leaderboard visibility can only be changed by the member'
    USING ERRCODE = '42501';
END;
$$;

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
    NEW.last_payment_amount   := NULL;
    NEW.last_payment_method   := NULL;
    NEW.last_transaction_id   := NULL;
    NEW.last_payment_date     := NULL;
    NEW.last_payment_status   := 'none';
    NEW.subscription_started_at := NULL;
    NEW.whatsapp_addon_until  := NULL;
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

-- ── 1b. gyms: a paid plan cannot be downgraded to free/trial by hand ──
-- Without this a paid gym could be flipped to 'free' by a bug or a stray
-- service call and silently keep its data under a 50-member cap, or be reset
-- to 'trial' to get fresh trial days. Only trusted server roles (admin app,
-- SQL editor) may do it.
CREATE OR REPLACE FUNCTION public.guard_gyms_plan_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.plan_type IN ('monthly', 'quarterly', 'yearly', 'lifetime')
     AND NEW.plan_type IN ('free', 'trial')
     AND NOT public.is_trusted_db_caller()
  THEN
    RAISE EXCEPTION 'gyms: a paid plan cannot be changed to %', NEW.plan_type
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 1c. owner_switch_to_free: the only owner path onto the free plan ──
-- Takes no arguments: the gym comes from auth.uid() and every eligibility rule
-- is re-checked here under a row lock, so the client cannot pick a gym, skip
-- the trial, or race a member import past the 50-member cap. It runs as the
-- definer, so the gyms column guard treats the write as trusted.
CREATE OR REPLACE FUNCTION public.owner_switch_to_free()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id   UUID;
  v_plan     TEXT;
  v_trial_end TIMESTAMPTZ;
  v_status   TEXT;
  v_active   BOOLEAN;
BEGIN
  SELECT id, plan_type, trial_ends_at, subscription_status, is_active
    INTO v_gym_id, v_plan, v_trial_end, v_status, v_active
    FROM public.gyms
   WHERE owner_id = auth.uid()
   FOR UPDATE;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'no gym for caller' USING ERRCODE = '42501';
  END IF;
  -- The switch sets status 'active', so it must not run on a gym an admin suspended,
  -- cancelled or deactivated: that would let the owner undo the admin's action.
  IF v_active IS NOT TRUE OR v_status NOT IN ('trial', 'expired') THEN
    RAISE EXCEPTION 'free plan is not available for a suspended or cancelled gym' USING ERRCODE = '42501';
  END IF;
  IF v_plan <> 'trial' THEN
    RAISE EXCEPTION 'free plan is only available at trial end' USING ERRCODE = '42501';
  END IF;
  IF v_trial_end IS NULL OR v_trial_end > now() THEN
    RAISE EXCEPTION 'trial has not ended' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM public.members WHERE gym_id = v_gym_id) > 50 THEN
    RAISE EXCEPTION 'free plan allows 50 members' USING ERRCODE = '23514';
  END IF;

  UPDATE public.gyms
     SET plan_type = 'free',
         subscription_status = 'active',
         subscription_ends_at = NULL
   WHERE id = v_gym_id;
END;
$$;

-- ── 1d. members: free plan is capped at 50 members ──
-- Enforced in the database so every insert path (owner API, bulk import,
-- member self-signup) is covered. The gym row lock serialises concurrent
-- inserts, otherwise two requests at 49 members would both pass the count.
CREATE OR REPLACE FUNCTION public.enforce_free_plan_member_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT plan_type INTO v_plan
    FROM public.gyms
   WHERE id = NEW.gym_id
   FOR UPDATE;

  IF v_plan = 'free'
     AND (SELECT count(*) FROM public.members WHERE gym_id = NEW.gym_id) >= 50
  THEN
    RAISE EXCEPTION 'free_plan_member_limit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

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

  IF TG_OP = 'INSERT' THEN
    -- A new ticket always starts open and uncleared; resolving and clearing
    -- belong to the admin.
    NEW.status               := 'open';
    NEW.resolved_at          := NULL;
    NEW.is_cleared_by_admin  := false;
    NEW.is_cleared_by_owner  := false;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'support_tickets: owners can only clear their own ticket view'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

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

-- ────────────────────────────────────────────────────────────
-- Trigger functions — derived data
-- ────────────────────────────────────────────────────────────

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

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_whatsapp_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

-- ────────────────────────────────────────────────────────────
-- Trigger functions — realtime invalidation
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- Trigger functions — admin notifications and push
-- ────────────────────────────────────────────────────────────

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

-- ── approve_whatsapp_addon: atomic admin approval of an add-on payment ──
-- Service-role only (the admin app). Request lock, gym lock and both writes are
-- one transaction so a double click or two admins cannot approve the same
-- request twice and stack 60 days. It runs as the definer, so the gyms column
-- guard treats the billing writes as trusted. plan_type and subscription_status
-- are deliberately left alone: the add-on is independent of the plan.
CREATE OR REPLACE FUNCTION public.approve_whatsapp_addon(
  p_request_id  UUID,
  p_gym_id      UUID,
  p_reviewed_by TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req   public.subscription_requests%ROWTYPE;
  v_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_req
    FROM public.subscription_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- The caller's gym id must match the stored one, so a stale or forged pair
  -- cannot extend a different gym's add-on.
  IF v_req.gym_id <> p_gym_id OR v_req.plan_requested IS DISTINCT FROM 'whatsapp_addon' THEN
    RAISE EXCEPTION 'request_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = 'P0001';
  END IF;

  -- Renewing early extends from the current end date instead of losing days.
  SELECT greatest(now(), coalesce(whatsapp_addon_until, now())) + interval '30 days'
    INTO v_until
    FROM public.gyms
   WHERE id = p_gym_id
   FOR UPDATE;

  UPDATE public.subscription_requests
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = p_reviewed_by
   WHERE id = p_request_id;

  UPDATE public.gyms
     SET whatsapp_addon_until = v_until,
         last_payment_amount  = 299,
         last_payment_date    = now(),
         last_payment_status  = 'paid',
         last_transaction_id  = v_req.transaction_id
   WHERE id = p_gym_id;

  RETURN v_until;
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
  v_what     TEXT;
  v_title    TEXT;
  v_body     TEXT;
BEGIN
  BEGIN
    IF NEW.status = 'pending' THEN
      SELECT name, plan_type INTO v_gym_name, v_plan FROM public.gyms WHERE id = NEW.gym_id;
      v_gym   := COALESCE(NULLIF(btrim(v_gym_name), ''), 'A gym');
      v_txn   := public.notification_snippet(NEW.transaction_id, 40);
      v_notes := public.notification_snippet(NEW.notes, 120);

      -- What was paid for goes first: a push preview cuts the body short, and an
      -- add-on request must not be mistaken for a plan renewal.
      v_what := CASE NEW.plan_requested
                  WHEN 'whatsapp_addon' THEN ' Requested: WhatsApp automation add-on (Rs 299 / 30 days).'
                  WHEN 'monthly'        THEN ' Requested plan: Monthly.'
                  WHEN 'yearly'         THEN ' Requested plan: Yearly.'
                  ELSE ''
                END;
      v_title := CASE WHEN NEW.plan_requested = 'whatsapp_addon'
                      THEN 'WhatsApp add-on request — '
                      ELSE 'Payment proof awaiting review — '
                 END || v_gym;

      -- e.g. "Fit Zone Gym submitted a payment proof and is waiting for approval.
      --       Requested plan: Monthly. Current plan: trial. Txn: ABC123. Note: paid via GPay"
      v_body := v_gym || ' submitted a payment proof and is waiting for approval.'
                || v_what
                || CASE WHEN COALESCE(v_plan, '') <> '' THEN ' Current plan: ' || v_plan || '.' ELSE '' END
                || CASE WHEN v_txn   <> '' THEN ' Txn: '  || v_txn   || '.' ELSE '' END
                || CASE WHEN v_notes <> '' THEN ' Note: ' || v_notes        ELSE '' END;

      INSERT INTO public.notifications (type, gym_id, title, body, entity_id)
      VALUES (
        'payment_request',
        NEW.gym_id,
        v_title,
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


-- ############################################################
-- 6 — TRIGGERS
-- ############################################################

-- ────────────────────────────────────────────────────────────
-- triggers on admin_messages
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_messages ON public.admin_messages;
CREATE TRIGGER trg_realtime_admin_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:support'
  );

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_admin_message ON public.admin_messages;
CREATE TRIGGER trg_realtime_owner_deleted_admin_message
  AFTER DELETE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_guard_admin_messages_owner_update ON public.admin_messages;
CREATE TRIGGER trg_guard_admin_messages_owner_update
  BEFORE UPDATE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_messages_owner_update();

-- ────────────────────────────────────────────────────────────
-- triggers on attendance
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_usage_on_attendance ON attendance;
CREATE TRIGGER trg_usage_on_attendance
AFTER INSERT ON attendance
FOR EACH ROW EXECUTE FUNCTION sync_usage_on_attendance_insert();

DROP TRIGGER IF EXISTS trg_evaluate_events_on_attendance ON attendance;
CREATE TRIGGER trg_evaluate_events_on_attendance
AFTER INSERT OR UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_events_on_attendance();

-- ────────────────────────────────────────────────────────────
-- triggers on email_messages
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_email_thread_on_message ON public.email_messages;
CREATE TRIGGER trg_email_thread_on_message
  AFTER INSERT ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.email_thread_on_message();

DROP TRIGGER IF EXISTS trg_notify_inbound_email ON public.email_messages;
CREATE TRIGGER trg_notify_inbound_email
  AFTER INSERT ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_inbound_email();

DROP TRIGGER IF EXISTS trg_realtime_admin_email_messages ON public.email_messages;
CREATE TRIGGER trg_realtime_admin_email_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:email');

-- ────────────────────────────────────────────────────────────
-- triggers on email_threads
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_email_threads ON public.email_threads;
CREATE TRIGGER trg_realtime_admin_email_threads
  AFTER INSERT OR UPDATE OR DELETE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation('admin:email');

-- ────────────────────────────────────────────────────────────
-- triggers on gym_whatsapp_config
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS gym_whatsapp_config_updated_at ON gym_whatsapp_config;
CREATE TRIGGER gym_whatsapp_config_updated_at
  BEFORE UPDATE ON gym_whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ────────────────────────────────────────────────────────────
-- triggers on gym_gamification_settings
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS gym_gamification_settings_updated_at ON gym_gamification_settings;
CREATE TRIGGER gym_gamification_settings_updated_at
  BEFORE UPDATE ON gym_gamification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ────────────────────────────────────────────────────────────
-- triggers on gym_events
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS gym_events_updated_at ON gym_events;
CREATE TRIGGER gym_events_updated_at
  BEFORE UPDATE ON gym_events
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

DROP TRIGGER IF EXISTS trg_guard_gym_events ON gym_events;
CREATE TRIGGER trg_guard_gym_events
  BEFORE INSERT OR UPDATE ON gym_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_gym_events();

-- ────────────────────────────────────────────────────────────
-- triggers on gyms
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_gyms ON public.gyms;
CREATE TRIGGER trg_realtime_admin_gyms
  AFTER INSERT OR UPDATE OR DELETE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:gyms',
    'admin:subscriptions'
  );

DROP TRIGGER IF EXISTS trg_notify_new_gym ON public.gyms;
CREATE TRIGGER trg_notify_new_gym
  AFTER INSERT ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_gym();

DROP TRIGGER IF EXISTS trg_guard_gyms_privileged_columns ON public.gyms;
CREATE TRIGGER trg_guard_gyms_privileged_columns
  BEFORE INSERT OR UPDATE ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.guard_gyms_privileged_columns();

DROP TRIGGER IF EXISTS trg_guard_gyms_plan_downgrade ON public.gyms;
CREATE TRIGGER trg_guard_gyms_plan_downgrade
  BEFORE UPDATE OF plan_type ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.guard_gyms_plan_downgrade();

-- ────────────────────────────────────────────────────────────
-- triggers on members
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_usage_on_member ON members;
CREATE TRIGGER trg_usage_on_member
AFTER INSERT ON members
FOR EACH ROW EXECUTE FUNCTION sync_usage_on_member_insert();

DROP TRIGGER IF EXISTS trg_realtime_admin_member_activity ON public.members;
CREATE TRIGGER trg_realtime_admin_member_activity
  AFTER INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

DROP TRIGGER IF EXISTS trg_generate_member_code ON public.members;
CREATE TRIGGER trg_generate_member_code
  BEFORE INSERT OR UPDATE OF member_number, member_code ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.generate_member_code();

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_insert ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_insert
  BEFORE INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

DROP TRIGGER IF EXISTS trg_enforce_free_plan_member_cap ON public.members;
CREATE TRIGGER trg_enforce_free_plan_member_cap
  BEFORE INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_plan_member_cap();

DROP TRIGGER IF EXISTS trg_guard_member_auth_user_link_update ON public.members;
CREATE TRIGGER trg_guard_member_auth_user_link_update
  BEFORE UPDATE OF auth_user_id ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_auth_user_link();

DROP TRIGGER IF EXISTS trg_guard_member_leaderboard_visibility ON public.members;
CREATE TRIGGER trg_guard_member_leaderboard_visibility
  BEFORE UPDATE OF show_on_leaderboard ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_leaderboard_visibility();

-- ────────────────────────────────────────────────────────────
-- triggers on memberships
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_usage_on_membership ON memberships;
CREATE TRIGGER trg_usage_on_membership
AFTER INSERT ON memberships
FOR EACH ROW EXECUTE FUNCTION sync_usage_on_membership_insert();

-- ────────────────────────────────────────────────────────────
-- triggers on notifications
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_notifications ON public.notifications;
CREATE TRIGGER trg_realtime_admin_notifications
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:notifications'
  );

DROP TRIGGER IF EXISTS trg_dispatch_push_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();

-- ────────────────────────────────────────────────────────────
-- triggers on subscription_audit_logs
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_audit ON public.subscription_audit_logs;
CREATE TRIGGER trg_realtime_admin_subscription_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

-- ────────────────────────────────────────────────────────────
-- triggers on subscription_requests
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_subscription_requests ON public.subscription_requests;
CREATE TRIGGER trg_realtime_admin_subscription_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:subscriptions',
    'admin:gyms'
  );

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_subscription_request ON public.subscription_requests;
CREATE TRIGGER trg_realtime_owner_deleted_subscription_request
  AFTER DELETE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('subscription');

DROP TRIGGER IF EXISTS trg_notify_subscription_request ON public.subscription_requests;
CREATE TRIGGER trg_notify_subscription_request
  AFTER INSERT ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_subscription_request();

-- ────────────────────────────────────────────────────────────
-- triggers on support_tickets
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_support_tickets ON public.support_tickets;
CREATE TRIGGER trg_realtime_admin_support_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:support'
  );

DROP TRIGGER IF EXISTS trg_realtime_owner_deleted_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_realtime_owner_deleted_support_ticket
  AFTER DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_owner_delete_invalidation('support');

DROP TRIGGER IF EXISTS trg_notify_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_notify_support_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_support_ticket();

DROP TRIGGER IF EXISTS trg_guard_support_tickets_owner_update ON public.support_tickets;
CREATE TRIGGER trg_guard_support_tickets_owner_update
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_tickets_owner_update();

-- ────────────────────────────────────────────────────────────
-- triggers on whatsapp_automation_logs
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_logs ON public.whatsapp_automation_logs;
CREATE TRIGGER trg_realtime_admin_whatsapp_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_automation_logs
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

-- ────────────────────────────────────────────────────────────
-- triggers on whatsapp_messages
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS whatsapp_messages_updated_at ON whatsapp_messages;
CREATE TRIGGER whatsapp_messages_updated_at
  BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_messages ON public.whatsapp_messages;
CREATE TRIGGER trg_realtime_admin_whatsapp_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );

-- ────────────────────────────────────────────────────────────
-- triggers on whatsapp_send_queue
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_realtime_admin_whatsapp_queue ON public.whatsapp_send_queue;
CREATE TRIGGER trg_realtime_admin_whatsapp_queue
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_send_queue
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_realtime_invalidation(
    'admin:activity'
  );


-- ############################################################
-- 7 — VIEWS
-- ############################################################

-- Inbound conversations per contact, for the WhatsApp inbox.
--
-- security_invoker = true is required: without it the view runs with its
-- OWNER's rights, and because the owner (postgres) bypasses RLS, every gym's
-- inbound numbers would be readable by any signed-in user. With it, the
-- whatsapp_messages policies apply to whoever queries the view.
CREATE OR REPLACE VIEW whatsapp_conversations
WITH (security_invoker = true) AS
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


-- ############################################################
-- 8 — ROW LEVEL SECURITY
-- ############################################################

-- RLS is enabled on EVERY table in this schema. Three patterns are in use:
--
--   1. Tenant tables — policies resolve to gyms.owner_id = auth.uid(), plus
--      member-scoped read policies where the member PWA needs them.
--   2. Platform tables (notifications, device_push_tokens, app_config,
--      email_threads, email_messages, whatsapp_webhook_logs,
--      gym_whatsapp_config) — RLS on with NO policies, which denies anon and
--      authenticated outright. The service role bypasses RLS and is the only
--      reader and writer. Section 9 revokes their privileges as well, so the
--      denial does not depend on the absence of a policy alone.
--   3. platform_settings — readable by any signed-in owner (they must know
--      where to pay), writable only by the service role.

ALTER TABLE gyms                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE members                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships              ENABLE ROW LEVEL SECURITY;
ALTER TABLE due_payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance               ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_plan_prices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_gamification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_achievements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_awards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_event_completions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_units          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_programs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_portal_activity   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_audit_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_announcement    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_usage_stats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_upi_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_feedback_prompts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_push_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config               ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_whatsapp_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_send_queue      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_admin_notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_verified_phones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_recipient_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_phone_leads         ENABLE ROW LEVEL SECURITY;

-- ── platform_settings ────────────────────────────────────────
-- Read-only for owners; writes are service-role only (see section 9).
DROP POLICY IF EXISTS "Gym owners can read platform settings" ON platform_settings;
CREATE POLICY "Gym owners can read platform settings"
  ON platform_settings FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gyms WHERE owner_id = (SELECT auth.uid())));

-- ── platform_announcement ────────────────────────────────────
-- Any signed-in user may read the banner; writes are service-role only.
DROP POLICY IF EXISTS "Authenticated can read platform announcement" ON platform_announcement;
CREATE POLICY "Authenticated can read platform announcement"
  ON platform_announcement FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ────────────────────────────────────────────────────────────
-- policies on admin_messages
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Gym owners can read their admin messages" ON admin_messages;
CREATE POLICY "Gym owners can read their admin messages"
  ON admin_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can mark messages as read" ON admin_messages;
CREATE POLICY "Gym owners can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id AND owner_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- policies on attendance
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Gym owners can view attendance" ON attendance;
CREATE POLICY "Gym owners can view attendance"
  ON attendance FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert attendance" ON attendance;
CREATE POLICY "Gym owners can insert attendance"
  ON attendance FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete attendance" ON attendance;
CREATE POLICY "Gym owners can delete attendance"
  ON attendance FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update attendance" ON attendance;
CREATE POLICY "Gym owners can update attendance"
  ON attendance FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = attendance.gym_id AND owner_id = auth.uid())
  );

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

-- ────────────────────────────────────────────────────────────
-- policies on due_payments
-- ────────────────────────────────────────────────────────────

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
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete due payments" ON due_payments;
CREATE POLICY "Gym owners can delete due payments"
  ON due_payments FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = due_payments.gym_id AND owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on gamification_awards
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Gym owners can view gamification awards" ON gamification_awards;
CREATE POLICY "Gym owners can view gamification awards"
  ON gamification_awards FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gamification_awards.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert gamification awards" ON gamification_awards;
CREATE POLICY "Gym owners can insert gamification awards"
  ON gamification_awards FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = gamification_awards.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete gamification awards" ON gamification_awards;
CREATE POLICY "Gym owners can delete gamification awards"
  ON gamification_awards FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = gamification_awards.gym_id AND owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on gym_gamification_settings
-- ────────────────────────────────────────────────────────────

-- Owner only. Members never read this table; see get_member_gamification().
-- There is no DELETE policy: a row is reset by updating it, and it goes away
-- with the gym.
DROP POLICY IF EXISTS "Owner can read own gamification settings" ON gym_gamification_settings;
CREATE POLICY "Owner can read own gamification settings"
  ON gym_gamification_settings FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can insert own gamification settings" ON gym_gamification_settings;
CREATE POLICY "Owner can insert own gamification settings"
  ON gym_gamification_settings FOR INSERT
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can update own gamification settings" ON gym_gamification_settings;
CREATE POLICY "Owner can update own gamification settings"
  ON gym_gamification_settings FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on gym_events
-- ────────────────────────────────────────────────────────────

-- Owner only. Members read through get_member_events().
DROP POLICY IF EXISTS "Owner can read own gym events" ON gym_events;
CREATE POLICY "Owner can read own gym events"
  ON gym_events FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can insert own gym events" ON gym_events;
CREATE POLICY "Owner can insert own gym events"
  ON gym_events FOR INSERT
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can update own gym events" ON gym_events;
CREATE POLICY "Owner can update own gym events"
  ON gym_events FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can delete own gym events" ON gym_events;
CREATE POLICY "Owner can delete own gym events"
  ON gym_events FOR DELETE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on gym_event_completions
-- ────────────────────────────────────────────────────────────

-- Owner reads and stamps reward_given_at (the column grant limits UPDATE to that
-- column). Inserts come only from the definer evaluate_* functions.
DROP POLICY IF EXISTS "Owner can read own event completions" ON gym_event_completions;
CREATE POLICY "Owner can read own event completions"
  ON gym_event_completions FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can update own event completions" ON gym_event_completions;
CREATE POLICY "Owner can update own event completions"
  ON gym_event_completions FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on gym_plan_prices
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owner can read own plan prices" ON gym_plan_prices;
CREATE POLICY "Owner can read own plan prices"
  ON gym_plan_prices FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can upsert own plan prices" ON gym_plan_prices;
CREATE POLICY "Owner can upsert own plan prices"
  ON gym_plan_prices FOR INSERT
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owner can update own plan prices" ON gym_plan_prices;
CREATE POLICY "Owner can update own plan prices"
  ON gym_plan_prices FOR UPDATE
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on gym_upi_config
-- ────────────────────────────────────────────────────────────

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
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can delete their UPI config" ON gym_upi_config;
CREATE POLICY "Gym owners can delete their UPI config"
  ON gym_upi_config FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = gym_upi_config.gym_id AND owner_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- policies on gym_usage_stats
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Gym owners can view own usage stats" ON gym_usage_stats;
CREATE POLICY "Gym owners can view own usage stats"
  ON gym_usage_stats FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on gyms
-- ────────────────────────────────────────────────────────────

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
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- policies on inventory
-- ────────────────────────────────────────────────────────────

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
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete inventory" ON inventory;
CREATE POLICY "Gym owners can delete inventory"
  ON inventory FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory.gym_id AND owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on inventory_sales
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Gym owners can view their inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can view their inventory sales"
  ON inventory_sales FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can insert inventory sales"
  ON inventory_sales FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can delete inventory sales"
  ON inventory_sales FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can update inventory sales" ON inventory_sales;
CREATE POLICY "Gym owners can update inventory sales"
  ON inventory_sales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = inventory_sales.gym_id AND owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on inventory_units
-- ────────────────────────────────────────────────────────────

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
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can delete inventory units" ON inventory_units;
CREATE POLICY "Gym owners can delete inventory units"
  ON inventory_units FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = inventory_units.gym_id AND owner_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- policies on member_achievements
-- ────────────────────────────────────────────────────────────

-- Read only. There is deliberately no INSERT/UPDATE/DELETE policy: rows are
-- written by record_member_achievements() for the caller's own member row.
DROP POLICY IF EXISTS "Members can view their own achievements" ON public.member_achievements;
CREATE POLICY "Members can view their own achievements"
  ON public.member_achievements FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Gym owners can view member achievements" ON public.member_achievements;
CREATE POLICY "Gym owners can view member achievements"
  ON public.member_achievements FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = member_achievements.gym_id AND owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on member_portal_activity
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Gym owners can view portal activity" ON member_portal_activity;
CREATE POLICY "Gym owners can view portal activity"
  ON member_portal_activity FOR SELECT
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = member_portal_activity.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can insert portal activity" ON member_portal_activity;
CREATE POLICY "Gym owners can insert portal activity"
  ON member_portal_activity FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = member_portal_activity.gym_id AND owner_id = auth.uid()));

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

DROP POLICY IF EXISTS "Members can insert their own login activity" ON public.member_portal_activity;
CREATE POLICY "Members can insert their own login activity"
  ON public.member_portal_activity FOR INSERT
  TO authenticated
  WITH CHECK (
    activity = 'logged_in'
    AND performed_by = 'member'
    AND member_id IN (
      SELECT id FROM public.members
      WHERE auth_user_id = (SELECT auth.uid())
    )
    AND gym_id = public.current_member_gym_id()
  );

-- ────────────────────────────────────────────────────────────
-- policies on members
-- ────────────────────────────────────────────────────────────

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
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete members" ON members;
CREATE POLICY "Gym owners can delete members"
  ON members FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Members can view their own profile" ON public.members;
CREATE POLICY "Members can view their own profile"
  ON public.members FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on memberships
-- ────────────────────────────────────────────────────────────

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
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Gym owners can delete memberships" ON memberships;
CREATE POLICY "Gym owners can delete memberships"
  ON memberships FOR DELETE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = memberships.gym_id AND owner_id = auth.uid()));

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

-- ────────────────────────────────────────────────────────────
-- policies on owner_feedback_prompts
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- policies on program_assignments
-- ────────────────────────────────────────────────────────────

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

DROP POLICY IF EXISTS "Members can view their own assignments" ON public.program_assignments;
CREATE POLICY "Members can view their own assignments"
  ON public.program_assignments FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members WHERE auth_user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- policies on subscription_requests
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "gym owner read own requests" ON subscription_requests;
  CREATE POLICY "gym owner read own requests"
    ON subscription_requests FOR SELECT
    USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

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
    AND uploaded_file_url LIKE (SELECT auth.uid())::text || '/%'
    AND uploaded_file_url NOT LIKE '%..%'
  );

-- ────────────────────────────────────────────────────────────
-- policies on support_tickets
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Gym owners can update their support tickets" ON support_tickets;
CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

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

-- ────────────────────────────────────────────────────────────
-- policies on whatsapp_automation_logs
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS wa_auto_logs_select ON whatsapp_automation_logs;
CREATE POLICY wa_auto_logs_select ON whatsapp_automation_logs
  FOR SELECT
  USING (
    gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- policies on whatsapp_messages
-- ────────────────────────────────────────────────────────────

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
  )
  WITH CHECK (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- policies on whatsapp_send_queue
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS wa_queue_select ON whatsapp_send_queue;
CREATE POLICY wa_queue_select ON whatsapp_send_queue
  FOR SELECT
  USING (gym_id IN (SELECT id FROM gyms WHERE owner_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- policies on workout_programs
-- ────────────────────────────────────────────────────────────

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
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gym owners can delete programs" ON workout_programs;
CREATE POLICY "Gym owners can delete programs"
  ON workout_programs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM gyms WHERE id = workout_programs.gym_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Members can view their gym programs" ON public.workout_programs;
CREATE POLICY "Members can view their gym programs"
  ON public.workout_programs FOR SELECT
  TO authenticated
  USING (
    gym_id = public.current_member_gym_id()
    AND is_draft = false
  );


-- ############################################################
-- 9 — PRIVILEGES
-- ############################################################

-- RLS decides which ROWS a caller sees. Privileges decide which TABLES and
-- COLUMNS it may touch at all, and are what makes the "RLS on, no policies"
-- tables above fail closed even if a policy is added by mistake later.

-- ── Platform-owned tables: service role only ─────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notifications',
    'device_push_tokens',
    'app_config',
    'email_threads',
    'email_messages',
    'whatsapp_webhook_logs',
    'gym_whatsapp_config'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

-- ── platform_settings: owners read, nobody but the service role writes ──
REVOKE ALL ON public.platform_settings FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.platform_settings FROM authenticated;
GRANT SELECT ON public.platform_settings TO authenticated;

-- ── platform_announcement: signed-in users read, nobody but the service role writes ──
REVOKE ALL ON public.platform_announcement FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_announcement TO authenticated;
GRANT ALL ON public.platform_announcement TO service_role;

-- ── Gamification tables ──────────────────────────────────────
-- Granted verb by verb so the tables fail closed for anything RLS has no policy
-- for. member_achievements is read-only to clients; its only writer is the
-- definer function record_member_achievements().
REVOKE ALL ON public.gym_gamification_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.gym_gamification_settings TO authenticated;
REVOKE ALL ON public.member_achievements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_achievements TO authenticated;
REVOKE ALL ON public.gamification_awards FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.gamification_awards TO authenticated;

-- ── Gamification events ──────────────────────────────────────
REVOKE ALL ON public.gym_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gym_events TO authenticated;
REVOKE ALL ON public.gym_event_completions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.gym_event_completions TO authenticated;
GRANT UPDATE (reward_given_at) ON public.gym_event_completions TO authenticated;

-- ── gym_admin_notes: service role only ──────────────────────
REVOKE ALL ON public.gym_admin_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.gym_admin_notes TO service_role;

-- ── owner_verified_phones: service role only ────────────────
REVOKE ALL ON public.owner_verified_phones FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.owner_verified_phones TO service_role;

-- ── whatsapp_recipient_window: service role only ────────────
REVOKE ALL ON public.whatsapp_recipient_window FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_recipient_window TO service_role;

REVOKE ALL ON FUNCTION public.reserve_whatsapp_recipient(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_whatsapp_recipient(text, int) TO service_role;
REVOKE ALL ON FUNCTION public.release_whatsapp_recipient(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_whatsapp_recipient(text) TO service_role;
REVOKE ALL ON FUNCTION public.whatsapp_recipient_window_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_recipient_window_usage() TO service_role;

-- ── owner_phone_leads: service role only ────────────────────
REVOKE ALL ON public.owner_phone_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.owner_phone_leads TO service_role;
REVOKE ALL ON FUNCTION public.record_owner_phone_lead(text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_owner_phone_lead(text, text, text, uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.mark_owner_phone_lead_verified(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_owner_phone_lead_verified(text, uuid) TO service_role;

-- ── gyms: column-level SELECT for owners ─────────────────────
-- The table-level SELECT is replaced by a column-level grant of every column,
-- so a column added later fails closed until it is granted.
--
-- MAINTENANCE: a column added to gyms later is NOT readable by owners until it
-- is granted:
--     GRANT SELECT (new_column) ON public.gyms TO authenticated;
-- That fails closed on purpose — a forgotten grant shows up as "permission
-- denied for column" the first time it is read, instead of leaking quietly.
-- INSERT/UPDATE are untouched; what an owner may write is enforced by
-- trg_guard_gyms_privileged_columns.
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'gyms';

  REVOKE SELECT ON public.gyms FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.gyms TO authenticated', v_cols);
END $$;

-- ── Function privileges ──────────────────────────────────────
-- Definer functions called only by triggers are kept off the public execute
-- grant entirely. Definer functions the app calls are granted to exactly the
-- role that calls them.

-- Trigger-only functions.
REVOKE ALL ON FUNCTION public.broadcast_admin_realtime_invalidation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_owner_delete_invalidation()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_support_ticket()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_subscription_request()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_new_gym()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_inbound_email()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_snippet(TEXT, INT)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_push_on_notification()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_thread_on_message()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_gyms_privileged_columns()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_gyms_plan_downgrade()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_free_plan_member_cap()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_support_tickets_owner_update()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_admin_messages_owner_update()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_member_leaderboard_visibility()   FROM PUBLIC, anon, authenticated;

-- Member PWA: definer helpers that resolve the caller's own identity.
REVOKE ALL ON FUNCTION public.current_member_gym_id()          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_gym_id()       TO authenticated;
REVOKE ALL ON FUNCTION public.get_member_gym()                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_gym()              TO authenticated;
REVOKE ALL ON FUNCTION public.record_member_login(UUID)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_login(UUID)     TO authenticated;
REVOKE ALL ON FUNCTION public.get_member_gamification()             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_gamification()          TO authenticated;
REVOKE ALL ON FUNCTION public.set_leaderboard_visibility(BOOLEAN)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_leaderboard_visibility(BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_switch_to_free()   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_switch_to_free() TO authenticated;
REVOKE ALL ON FUNCTION public.record_member_achievements(TEXT[])    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_achievements(TEXT[]) TO authenticated;

-- Gym leaderboard: callable by owners and members alike; the function decides
-- which gym and how much of each row the caller gets.
REVOKE ALL ON FUNCTION public.get_gym_leaderboard(TEXT, INT)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_leaderboard(TEXT, INT)     TO authenticated;
-- Gamification events. The member RPC takes no id; evaluate_gym_events checks
-- ownership itself. The rest are internal (trigger / definer callers only).
REVOKE ALL ON FUNCTION public.get_member_events()                    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_events()                 TO authenticated;
REVOKE ALL ON FUNCTION public.evaluate_gym_events(UUID)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_gym_events(UUID)           TO authenticated;
REVOKE ALL ON FUNCTION public.evaluate_member_events(UUID)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gym_event_progress(UUID, TEXT, DATE, DATE, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_evaluate_events_on_attendance()    FROM PUBLIC, anon, authenticated;

-- Pure helpers, only ever called from inside the definer functions above.
REVOKE ALL ON FUNCTION public.gamification_day_factor(JSONB, DATE)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gamification_mask_name(TEXT)          FROM PUBLIC, anon, authenticated;

-- Owner console RPCs. These run SECURITY INVOKER, so RLS still decides the rows.
REVOKE ALL ON FUNCTION public.get_gym_reports(UUID, DATE)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_reports(UUID, DATE) TO authenticated;
-- (REVOKE ... FROM anon alone does nothing while PUBLIC holds the default grant.)
REVOKE ALL ON FUNCTION public.get_gym_dashboard(UUID, DATE)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_dashboard(UUID, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.increment_inventory_stock(UUID, INTEGER)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_inventory_stock(UUID, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.sell_inventory_item(UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_inventory_item(UUID, INTEGER, NUMERIC, TEXT) TO authenticated;

-- Column guard helper: readable by the guards, harmless to call.
REVOKE ALL ON FUNCTION public.is_trusted_db_caller()    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trusted_db_caller() TO authenticated, service_role;

-- Service-role only. check_gym_active and the contact lookups read auth.users,
-- so they would otherwise let anyone probe which e-mail addresses are gym
-- owners and whether those accounts are active.
REVOKE ALL ON FUNCTION public.check_gym_active(TEXT)                 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_gym_active(TEXT)              TO service_role;
REVOKE ALL ON FUNCTION public.gym_id_for_owner_email(TEXT)           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gym_id_for_owner_email(TEXT)        TO service_role;
REVOKE ALL ON FUNCTION public.search_gym_owner_contacts(TEXT, INT)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_gym_owner_contacts(TEXT, INT) TO service_role;

-- Service-role only. These write to the gym the caller names without checking who
-- the caller is, so the default PUBLIC grant let anyone forge subscription audit
-- entries and usage counters for any gym. The admin app calls the first with the
-- service role; the other two have no client caller.
REVOKE ALL ON FUNCTION public.log_subscription_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_subscription_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.increment_gym_usage_stat(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_gym_usage_stat(UUID, TEXT, INTEGER) TO service_role;

-- Service-role only. Approves a WhatsApp add-on payment for the gym the caller
-- names, so an owner must never be able to call it on their own gym.
REVOKE ALL ON FUNCTION public.approve_whatsapp_addon(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_whatsapp_addon(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.record_whatsapp_sent(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_sent(UUID, INTEGER) TO service_role;

-- Trigger-only / maintenance functions: nobody calls these over the API.
REVOKE ALL ON FUNCTION public.sync_usage_on_membership_insert()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_usage_on_member_insert()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_usage_on_attendance_insert()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_whatsapp_messages_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_member_code()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_member_auth_user_link()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_gym_events()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_old_whatsapp_webhook_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_whatsapp_webhook_logs() TO service_role;

-- ── Table privileges: closed to anon, no TRUNCATE for API roles ──
-- anon never uses a table directly (RLS already returns nothing; this makes it
-- fail closed). TRUNCATE / REFERENCES / TRIGGER bypass RLS and no API role
-- needs them. Runs last in this section so it also covers the tables above;
-- the verb-by-verb grants earlier in the section are unaffected.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', r.relname);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', r.relname);
  END LOOP;
END $$;


-- ############################################################
-- 10 — REALTIME
-- ############################################################

-- Tables consumed directly by authenticated owner or member clients through
-- postgres_changes. RLS remains the authorization boundary for delivery.
--
-- `notifications` is deliberately NOT published: owner clients are RLS-denied
-- and admin clients use broadcast, so publishing a high-insert table would only
-- add WAL and realtime overhead.
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
    'whatsapp_send_queue',
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

-- Owners subscribe to their own gym's broadcast topics (gym:<id>:support and
-- gym:<id>:subscription). Admin topics carry no payload and are public hints
-- only, because the admin apps authenticate with their own session, not a
-- Supabase JWT, so they cannot be authorized by RLS here.
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


-- ############################################################
-- 11 — STORAGE
-- ############################################################

-- Private bucket for UPI payment screenshots, capped at 10 MB of JPG/PNG/PDF.
-- Only gym owners (not members, not anon) may write, and each owner may only
-- write and read inside a folder named after their own auth uid. There is no
-- UPDATE or DELETE policy: uploads are immutable to clients.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('payment-proofs', 'payment-proofs', false, 10485760,
          ARRAY['image/jpeg', 'image/png', 'application/pdf'])
  ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = 10485760,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];

DROP POLICY IF EXISTS "gym owner upload payment proof" ON storage.objects;
CREATE POLICY "gym owner upload payment proof"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.gyms WHERE owner_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "gym owner read own payment proofs" ON storage.objects;
CREATE POLICY "gym owner read own payment proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );


-- ############################################################
-- 12 — SEED ROWS
-- ############################################################

-- The singleton settings row. Set your real UPI details afterwards:
--   update platform_settings set upi_id = '...', upi_name = '...' where id = 1;
INSERT INTO platform_settings DEFAULT VALUES
  ON CONFLICT (id) DO NOTHING;

-- The singleton announcement row (inactive until the admin app publishes one).
INSERT INTO platform_announcement (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- Push dispatch config, read by dispatch_push_on_notification(). ON CONFLICT DO
-- NOTHING so re-running this file never clobbers values you have set.
-- BOTH MUST BE UPDATED after install, or the push trigger stays inert:
--   update app_config set value = '<CRON_SECRET>'  where key = 'push_cron_secret';
--   update app_config set value = '<dispatch URL>' where key = 'push_dispatch_url';
INSERT INTO app_config (key, value)
  VALUES ('push_dispatch_url', 'https://admin.gymflow.sbs/api/push/dispatch')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO app_config (key, value)
  VALUES ('push_cron_secret', 'REPLACE_WITH_CRON_SECRET')
  ON CONFLICT (key) DO NOTHING;

-- Make PostgREST pick up the whole schema immediately.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- END OF SCHEMA
-- ============================================================
