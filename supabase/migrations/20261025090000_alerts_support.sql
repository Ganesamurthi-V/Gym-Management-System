-- Failure alerting: allow notifications.type = 'alert'.
-- Written by lib/monitoring/alert.ts (service role). Pushed by the existing
-- dispatch_push_on_notification trigger like every other type.
-- (whatsapp_send_queue.status / whatsapp_automation_logs.status are unconstrained TEXT,
--  so 'delivery_failed' needs no schema change.)
-- Idempotent: drop-by-name then re-add. Run in the Supabase SQL editor; safe to deploy before or after the code.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('ticket', 'feedback', 'payment_request', 'new_gym', 'email', 'alert'));
