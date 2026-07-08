-- Allow duplicate phone numbers across members within the same gym.
-- Family members, shared phones, and walk-in registrations are common scenarios.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_gym_id_phone_key;
