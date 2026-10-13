-- Gamification events: owner-defined challenges with XP / item rewards.
--
-- Run in the Supabase SQL editor. Idempotent. supabase-schema.sql carries the
-- same end state for fresh installs.
--
-- Creates gym_events + gym_event_completions (owner RLS, members read only
-- through get_member_events()), the progress / evaluation functions, the
-- attendance trigger, and folds completion XP into get_member_gamification()
-- and get_gym_leaderboard().

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


-- Composite targets and same-gym foreign keys (see supabase-schema.sql section 3).
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_id_gym ON members (id, gym_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_events_id_gym ON gym_events (id, gym_id);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('gym_event_completions', 'fk_gym_event_completions_member_same_gym', 'member_id', 'members'),
    ('gym_event_completions', 'fk_gym_event_completions_event_same_gym',  'event_id',  'gym_events')
  ) AS t(child, conname, child_col, parent)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.conname
         AND conrelid = format('public.%I', r.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, gym_id) REFERENCES public.%I (id, gym_id)',
        r.child, r.conname, r.child_col, r.parent
      );
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- indexes on gym_events / gym_event_completions
-- ────────────────────────────────────────────────────────────

-- Serves the attendance trigger ("active events of this gym") and the owner list.
CREATE INDEX IF NOT EXISTS idx_gym_events_gym_active ON gym_events(gym_id, is_active);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_gym_id    ON gym_event_completions(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_member_id ON gym_event_completions(member_id);
CREATE INDEX IF NOT EXISTS idx_gym_event_completions_event_id  ON gym_event_completions(event_id);

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

-- Completion XP is part of total XP. Same formulas as supabase-schema.sql.
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


DROP TRIGGER IF EXISTS trg_evaluate_events_on_attendance ON attendance;
CREATE TRIGGER trg_evaluate_events_on_attendance
AFTER INSERT OR UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_events_on_attendance();

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

ALTER TABLE gym_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_event_completions    ENABLE ROW LEVEL SECURITY;

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

-- ── Gamification events ──────────────────────────────────────
REVOKE ALL ON public.gym_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gym_events TO authenticated;
REVOKE ALL ON public.gym_event_completions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.gym_event_completions TO authenticated;
GRANT UPDATE (reward_given_at) ON public.gym_event_completions TO authenticated;

-- Gamification events. The member RPC takes no id; evaluate_gym_events checks
-- ownership itself. The rest are internal (trigger / definer callers only).
REVOKE ALL ON FUNCTION public.get_member_events()                    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_events()                 TO authenticated;
REVOKE ALL ON FUNCTION public.evaluate_gym_events(UUID)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_gym_events(UUID)           TO authenticated;
REVOKE ALL ON FUNCTION public.evaluate_member_events(UUID)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gym_event_progress(UUID, TEXT, DATE, DATE, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_evaluate_events_on_attendance()    FROM PUBLIC, anon, authenticated;

-- Re-assert grants of the two replaced functions (CREATE OR REPLACE keeps them,
-- this only guards a database where they were dropped and recreated).
REVOKE ALL ON FUNCTION public.get_member_gamification()         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_gamification()      TO authenticated;
REVOKE ALL ON FUNCTION public.get_gym_leaderboard(TEXT, INT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_leaderboard(TEXT, INT) TO authenticated;
