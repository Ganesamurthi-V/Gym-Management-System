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
         COUNT(c.day) AS transactions,
         COALESCE(SUM(c.units), 0) AS units
  FROM months m
  LEFT JOIN collected c ON c.day >= m.start_dt AND c.day < m.next_dt
  GROUP BY m.idx, m.start_dt
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
),
recent_sales AS (
  SELECT product_name, variant_name, quantity, total_price, payment_mode, sold_at
  FROM public.inventory_sales
  WHERE gym_id = p_gym_id
  ORDER BY sold_at DESC
  LIMIT 10
),
wa AS (
  SELECT template_name, status
  FROM public.whatsapp_automation_logs
  WHERE gym_id = p_gym_id AND sent_at >= (p_today - 30)::timestamp AT TIME ZONE 'Asia/Kolkata'
),
wa_templates AS (
  SELECT template_name, COUNT(*) AS n FROM wa WHERE status = 'sent' GROUP BY template_name ORDER BY n DESC, template_name LIMIT 6
)
SELECT json_build_object(
  'months', (
    SELECT COALESCE(json_agg(json_build_object(
      'label', label, 'total', total, 'memberships', memberships, 'dues', dues, 'inventory', inventory,
      'cash', cash, 'upi', upi, 'card', card, 'transactions', transactions, 'units', units
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
  'recentSales', (
    SELECT COALESCE(json_agg(json_build_object(
      'product', product_name, 'variant', variant_name, 'quantity', quantity,
      'total', total_price, 'mode', payment_mode, 'soldAt', sold_at
    ) ORDER BY sold_at DESC), '[]'::json) FROM recent_sales
  ),
  'whatsapp', json_build_object(
    'sent', (SELECT COUNT(*) FROM wa WHERE status = 'sent'),
    'failed', (SELECT COUNT(*) FROM wa WHERE status IN ('failed', 'error')),
    'templates', (
      SELECT COALESCE(json_agg(json_build_object('template', template_name, 'count', n)
        ORDER BY n DESC, template_name), '[]'::json) FROM wa_templates
    )
  )
);
$$;

REVOKE ALL ON FUNCTION public.get_gym_reports(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gym_reports(UUID, DATE) TO authenticated;
