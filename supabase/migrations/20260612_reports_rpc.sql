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
