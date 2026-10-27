-- Evening streak nudge helper. Run in the Supabase SQL editor; idempotent. Safe to run before or after the deploy.

-- Members of one gym whose streak is alive (>= 2 days) but who have not checked in today (IST). Used by the evening
-- push nudge (/api/cron/push-evening). Mirrors get_gym_leaderboard() / get_member_gamification() and lib/gamification/streak.ts
-- streakFromDays: effective day with the 05:00 IST rollover, days after the IST today ignored, alive while
-- last day >= (IST date of now - 5 h) - 1, pending while last day < IST today. Only members with a push subscription.
-- Service-role only: it takes a gym id, so it must never be callable by clients.
DROP FUNCTION IF EXISTS public.members_streak_at_risk(UUID);
CREATE FUNCTION public.members_streak_at_risk(p_gym_id UUID)
RETURNS TABLE (member_id UUID)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH t AS (
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS ist_today,
           ((now() - INTERVAL '5 hours') AT TIME ZONE 'Asia/Kolkata')::date AS gym_today
  ),
  days AS (
    SELECT DISTINCT
           a.member_id AS mid,
           CASE
             WHEN (a.created_at AT TIME ZONE 'Asia/Kolkata')::date = a.date
                  AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::time < TIME '05:00'
             THEN CASE
                    WHEN NOT EXISTS (
                      SELECT 1 FROM public.attendance p
                       WHERE p.member_id = a.member_id
                         AND p.date = a.date - 1
                    )
                    THEN a.date - 1
                    ELSE a.date
                  END
             ELSE a.date
           END AS day
      FROM public.attendance a
     WHERE a.gym_id = p_gym_id
       AND EXISTS (SELECT 1 FROM public.member_push_subscriptions s WHERE s.member_id = a.member_id AND s.gym_id = p_gym_id)
  ),
  runs AS (
    SELECT d.mid, d.day,
           d.day - (ROW_NUMBER() OVER (PARTITION BY d.mid ORDER BY d.day))::int AS grp
      FROM days d, t
     WHERE d.day <= t.ist_today
  ),
  islands AS (
    SELECT r.mid, COUNT(*)::int AS len, MAX(r.day) AS last_day
      FROM runs r
     GROUP BY r.mid, r.grp
  ),
  cur AS (
    SELECT DISTINCT ON (i.mid) i.mid, i.len, i.last_day
      FROM islands i
     ORDER BY i.mid, i.last_day DESC
  )
  SELECT c.mid
    FROM cur c, t
   WHERE c.last_day >= t.gym_today - 1
     AND c.last_day < t.ist_today
     AND c.len >= 2;
$$;

REVOKE ALL ON FUNCTION public.members_streak_at_risk(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.members_streak_at_risk(UUID) TO service_role;
