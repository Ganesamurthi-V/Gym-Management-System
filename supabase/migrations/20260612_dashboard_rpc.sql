-- Migration: Add dashboard RPC function

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
