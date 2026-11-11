-- Supabase performance advisor fixes (2026-11-11).
--
-- 1. auth_rls_initplan (84 policies): a bare auth.uid() in a policy is re-evaluated
--    for every row the query touches. Wrapped as (SELECT auth.uid()) Postgres runs it
--    once per statement (an InitPlan) and reuses the value. Same result, no per-row
--    function call. Done generically from pg_policies so every policy in public is
--    covered, including ones created by hand on this database.
--
-- 2. multiple_permissive_policies: due_payments carried two UPDATE policies for the
--    same rule ("…update due payments" with USING + WITH CHECK, and a hand-made
--    "…update due_payments" with USING only). The second is dropped; the first is
--    the one supabase-schema.sql defines.
--    The other warnings are an owner policy and a member policy on the same table.
--    Postgres ORs permissive policies anyway, so merging them would run the same
--    checks; they stay separate on purpose (one rule per audience is easier to audit).
--
-- 3. unindexed_foreign_keys (31): a covering index per foreign key, so deletes on the
--    parent (a member, device, gym, …) and the tenant-check joins do not scan the
--    child table. Column order matches the FK.
--
-- 4. unused_index: drops only indexes that are provably redundant or useless:
--    duplicates of a unique key, prefixes of another index, a boolean column, and
--    webhook-log / automation-log columns no query filters on (they only cost a write
--    per row). Indexes on still-empty tables (whatsapp_messages, email_*) and those
--    behind known query patterns are kept: "never scanned" there only means "no
--    traffic yet".
--
-- Idempotent. All tables are small (largest ~600 rows), so plain CREATE INDEX is fine.

-- ── 1. Evaluate auth.uid() once per statement in every policy ──
DO $mig$
DECLARE
  p RECORD;
  v_qual  TEXT;
  v_check TEXT;
  v_sql   TEXT;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual, '') ~ '(?<!SELECT )auth\.uid\(\)'
         OR coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)')
  LOOP
    v_qual  := regexp_replace(p.qual,       '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    v_check := regexp_replace(p.with_check, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_qual  IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual);       END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
  END LOOP;
END
$mig$;

-- ── 2. Duplicate due_payments UPDATE policy ──
DROP POLICY IF EXISTS "Gym owners can update due_payments" ON public.due_payments;

-- ── 3. Covering indexes for foreign keys ──
CREATE INDEX IF NOT EXISTS idx_attendance_member_gym                 ON public.attendance (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_devices_gym_id             ON public.attendance_devices (gym_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_device_gym            ON public.device_commands (device_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_member_gym            ON public.device_commands (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_device_punches_device_gym             ON public.device_punches (device_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_device_user_map_device_gym            ON public.device_user_map (device_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_device_user_map_member_gym            ON public.device_user_map (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_due_payments_member_gym               ON public.due_payments (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_ai_draft_message_id     ON public.email_threads (ai_draft_message_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_gym_id                  ON public.email_threads (gym_id);
CREATE INDEX IF NOT EXISTS idx_gamification_awards_member_gym        ON public.gamification_awards (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_event_gym       ON public.gym_event_completions (event_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_member_gym      ON public.gym_event_completions (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sales_item_gym              ON public.inventory_sales (inventory_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_member_achievements_member_gym        ON public.member_achievements (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_member_body_logs_gym_id               ON public.member_body_logs (gym_id);
CREATE INDEX IF NOT EXISTS idx_member_body_logs_member_gym           ON public.member_body_logs (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_member_body_profile_gym_id            ON public.member_body_profile (gym_id);
CREATE INDEX IF NOT EXISTS idx_member_body_profile_member_gym        ON public.member_body_profile (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_member_portal_activity_member_gym     ON public.member_portal_activity (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_member_push_subscriptions_member_gym  ON public.member_push_subscriptions (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_member_renewal_requests_due_payment   ON public.member_renewal_requests (due_payment_id);
CREATE INDEX IF NOT EXISTS idx_member_renewal_requests_member_gym    ON public.member_renewal_requests (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_member_renewal_requests_membership    ON public.member_renewal_requests (membership_id);
CREATE INDEX IF NOT EXISTS idx_member_workout_sessions_gym_id        ON public.member_workout_sessions (gym_id);
CREATE INDEX IF NOT EXISTS idx_member_workout_sessions_member_gym    ON public.member_workout_sessions (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member_gym                ON public.memberships (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_notifications_gym_id                  ON public.notifications (gym_id);
CREATE INDEX IF NOT EXISTS idx_program_assignments_assigned_by       ON public.program_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_program_assignments_member_gym        ON public.program_assignments (member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_program_assignments_program_gym       ON public.program_assignments (program_id, gym_id);

-- ── 4. Redundant / useless indexes ──
-- Duplicates of a unique key on the same column.
DROP INDEX IF EXISTS public.idx_geo_ai_cache_input;                    -- = geo_ai_cache_raw_input_normalized_key
DROP INDEX IF EXISTS public.idx_gym_whatsapp_config_phone_number_id;   -- = gym_whatsapp_config_phone_number_id_key
-- Prefixes of a wider index that serves the same lookups.
DROP INDEX IF EXISTS public.idx_gym_event_completions_event_id;        -- ⊂ (event_id, member_id) unique
DROP INDEX IF EXISTS public.idx_inventory_gym_id;                      -- ⊂ idx_inventory_category (gym_id, category)
DROP INDEX IF EXISTS public.idx_wa_auto_logs_member_id;                -- ⊂ idx_wa_auto_logs_member_template_sent
-- Boolean on a one-row-per-gym table: never selective.
DROP INDEX IF EXISTS public.idx_gym_whatsapp_config_enabled;
-- Every automation-log query filters member_id + template_name (+ cycle_key) or
-- gym_id first, which the composite / gym_id indexes serve.
DROP INDEX IF EXISTS public.idx_wa_auto_logs_template;
DROP INDEX IF EXISTS public.idx_wa_auto_logs_cycle_key;
-- Webhook logs are insert-only debug rows; reads filter on processed + created_at.
DROP INDEX IF EXISTS public.idx_whatsapp_webhook_logs_request_id;
DROP INDEX IF EXISTS public.idx_whatsapp_webhook_logs_phone_number_id;
DROP INDEX IF EXISTS public.idx_whatsapp_webhook_logs_event_type;
