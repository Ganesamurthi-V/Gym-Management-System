-- ============================================================
-- Verify all tables required for Realtime are in the publication.
--
-- This is a comprehensive safety-net migration that ensures every table
-- used by the app's Realtime subscriptions is present in
-- supabase_realtime. Idempotent — safe to run repeatedly.
--
-- Tables required:
--   gyms                  → ShellGuard, AccountClient, AdminDashboardRealtime
--   subscription_requests → SubscriptionClient, AdminSubscriptionList, AdminDashboardRealtime
--   admin_messages        → SupportTabsClient, AccountMenu
--   support_tickets       → SupportTabsClient, Admin Support Page
-- ============================================================

DO $$
BEGIN
  -- gyms: subscription status, account activation, name changes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gyms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gyms;
  END IF;

  -- subscription_requests: payment proof submissions, approval/rejection
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'subscription_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subscription_requests;
  END IF;

  -- admin_messages: messages from admin to gym owners
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_messages;
  END IF;

  -- support_tickets: gym owner tickets and resolution updates
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;
  END IF;
END $$;
