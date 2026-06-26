-- Add clear/soft-delete flags to admin_messages and support_tickets

-- Admin messages
ALTER TABLE admin_messages 
ADD COLUMN IF NOT EXISTS is_cleared_by_owner BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_cleared_by_admin BOOLEAN DEFAULT false;

-- Support tickets
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS is_cleared_by_owner BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_cleared_by_admin BOOLEAN DEFAULT false;
