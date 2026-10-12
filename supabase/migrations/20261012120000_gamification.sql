-- ============================================================
-- Gamification: stored settings, permanent achievements, awards, and secure
-- live leaderboards.
--
-- Idempotent. Run once in the Supabase SQL editor (running it twice is safe).
-- Deploy the app change together with it: get_member_gamification and
-- get_gym_leaderboard change signature here, and the old signatures are DROPPED
-- because they were the leak (see below), so old app code calling them with an
-- id will get "function not found" until the new build is live.
--
-- What it fixes
--   * Both RPCs were SECURITY DEFINER and trusted the id passed in, so any
--     signed-in user could read another gym's members. They now take no id and
--     resolve the caller from auth.uid().
--   * A morning and an evening check-in on one day counted twice. XP, streaks
--     and boards now count distinct DAYS.
--   * Week/month/streak used the database's UTC date, wrong between 00:00 and
--     05:30 IST. Everything is Asia/Kolkata now.
--   * The leaderboard returned streak = 0 and ran four lateral subqueries per
--     member. It is one set-based pass now.
--   * Achievements re-locked after a missed day because they were re-derived
--     and never recorded. member_achievements makes an unlock permanent.
--
-- What it adds
--   gym_gamification_settings, member_achievements, gamification_awards,
--   members.show_on_leaderboard, and the functions get_member_gamification(),
--   get_gym_leaderboard(text, int), set_leaderboard_visibility(boolean),
--   record_member_achievements(text[]).
--
-- No backfill is needed: a missing settings row means the old hardcoded values,
-- the new column defaults to true, and nothing was stored before.
--
-- The end state is folded into supabase-schema.sql; keep the two in step.
-- ============================================================

-- ── 1. Tables ────────────────────────────────────────────────

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

-- ── 2. members.show_on_leaderboard ───────────────────────────
-- The member's own choice to appear on the gym leaderboard. Default true so
-- existing members are listed (by masked name) the moment the feature ships.
-- Owners cannot change it (trg_guard_member_leaderboard_visibility below);
-- members change it through set_leaderboard_visibility().
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN NOT NULL DEFAULT true;

-- ── 3. Same-tenant foreign keys ──────────────────────────────
-- Same pattern as fk_attendance_member_same_gym: a row's member must belong to
-- the row's gym, for every caller including the service role. The single-column
-- foreign keys above keep ON DELETE CASCADE; these only add the tenant check.
-- NOTE for PostgREST embeds: each of these tables now has TWO foreign keys to
-- members, so an embed must name the constraint, e.g.
-- members!fk_gamification_awards_member_same_gym(...).
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_id_gym ON public.members (id, gym_id);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('member_achievements', 'fk_member_achievements_member_same_gym'),
    ('gamification_awards', 'fk_gamification_awards_member_same_gym')
  ) AS t(child, conname)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.conname
         AND conrelid = format('public.%I', r.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (member_id, gym_id) REFERENCES public.members (id, gym_id)',
        r.child, r.conname
      );
    END IF;
  END LOOP;
END $$;

-- ── 4. Indexes ───────────────────────────────────────────────
-- No new attendance index: the board reads a whole gym (idx_attendance_gym_id /
-- idx_attendance_gym_date) and probes one member-day (idx_attendance_member_date).
-- (gym_id, date, member_id) would only duplicate idx_attendance_gym_date.
CREATE INDEX IF NOT EXISTS idx_member_achievements_gym_id ON member_achievements(gym_id);

-- The unique key leads with gym_id, so it already serves "awards of this gym";
-- this one serves the member-delete cascade.
CREATE INDEX IF NOT EXISTS idx_gamification_awards_member_id ON gamification_awards(member_id);

-- ── 5. Functions ─────────────────────────────────────────────

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

  v_xp := v_checkin_xp
        + v_xp_renewal * v_memberships
        + (CASE WHEN v_portal THEN v_xp_portal ELSE 0 END);

  RETURN jsonb_build_object(
    'xp',                   v_xp,
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
           )::int AS xp_total,
           (CASE WHEN c.last_day >= v_gym_today - 1 THEN c.len ELSE 0 END)::int AS cur_streak,
           COALESCE(c.last_day >= v_gym_today - 1 AND c.last_day < v_ist_today, false) AS pending
      FROM members m
      LEFT JOIN agg a ON a.mid = m.id
      LEFT JOIN cur c ON c.mid = m.id
      LEFT JOIN ms    ON ms.mid = m.id
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

-- ── 6. Triggers ──────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_guard_member_leaderboard_visibility ON public.members;
CREATE TRIGGER trg_guard_member_leaderboard_visibility
  BEFORE UPDATE OF show_on_leaderboard ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_leaderboard_visibility();

DROP TRIGGER IF EXISTS gym_gamification_settings_updated_at ON gym_gamification_settings;
CREATE TRIGGER gym_gamification_settings_updated_at
  BEFORE UPDATE ON gym_gamification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ── 7. Row level security ────────────────────────────────────

ALTER TABLE gym_gamification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_achievements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_awards       ENABLE ROW LEVEL SECURITY;

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

-- ── 8. Privileges ────────────────────────────────────────────

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

REVOKE ALL ON FUNCTION public.guard_member_leaderboard_visibility()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_member_gamification()             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_gamification()          TO authenticated;
REVOKE ALL ON FUNCTION public.set_leaderboard_visibility(BOOLEAN)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_leaderboard_visibility(BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.record_member_achievements(TEXT[])    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_achievements(TEXT[]) TO authenticated;
-- Gym leaderboard: callable by owners and members alike; the function decides
-- which gym and how much of each row the caller gets.
REVOKE ALL ON FUNCTION public.get_gym_leaderboard(TEXT, INT)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_leaderboard(TEXT, INT)     TO authenticated;
-- Pure helpers, only ever called from inside the definer functions above.
REVOKE ALL ON FUNCTION public.gamification_day_factor(JSONB, DATE)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gamification_mask_name(TEXT)          FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
