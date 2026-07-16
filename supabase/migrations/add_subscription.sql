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
    id             int PRIMARY KEY DEFAULT 1,
    upi_id         text NOT NULL DEFAULT '',
    upi_name       text NOT NULL DEFAULT 'GymFlow',
    price_monthly  int  NOT NULL DEFAULT 2999,
    price_yearly   int  NOT NULL DEFAULT 29999,
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
  -- Returns false for admin-deactivated AND expired accounts.
  -- (The app code now checks subscription_status to tell them apart.)
  CREATE OR REPLACE FUNCTION check_gym_active(p_email text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
      CASE
        WHEN g.is_active = false                   THEN false
        WHEN g.subscription_status = 'expired'     THEN false
        WHEN g.subscription_status = 'trial'
             AND g.trial_ends_at < now()           THEN false
        ELSE true
      END
    FROM auth.users u
    JOIN gyms g ON g.owner_id = u.id
    WHERE u.email = p_email
    LIMIT 1;
  $$;