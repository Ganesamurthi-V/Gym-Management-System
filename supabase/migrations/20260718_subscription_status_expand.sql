-- Expand subscription_status to include cancelled and suspended
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_subscription_status_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled', 'suspended'));

-- Also expand plan_type if needed
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_plan_type_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_plan_type_check
  CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'yearly', 'lifetime'));
