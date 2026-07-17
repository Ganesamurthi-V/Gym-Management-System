-- ============================================================
-- Enable Realtime for gyms and subscription_requests
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

DO $$
BEGIN
  -- Add gyms table to supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'gyms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gyms;
  END IF;

  -- Add subscription_requests table to supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'subscription_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subscription_requests;
  END IF;
END $$;
