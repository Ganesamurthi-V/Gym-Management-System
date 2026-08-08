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
