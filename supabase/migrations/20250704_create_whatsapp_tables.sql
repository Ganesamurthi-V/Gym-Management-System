-- WhatsApp Cloud API Database Schema
-- 
-- Tables for storing WhatsApp messages, statuses, and webhook logs.
-- Optimized for high-throughput webhook processing.

-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp Messages Table
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Message identification
  message_id TEXT NOT NULL UNIQUE, -- WhatsApp message ID
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  
  -- Phone numbers
  phone_number_id TEXT NOT NULL, -- WhatsApp Business Phone Number ID
  from_number TEXT NOT NULL, -- Sender phone number (E.164 format)
  to_number TEXT NOT NULL, -- Recipient phone number (E.164 format)
  
  -- Message metadata
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL, -- text, image, video, audio, document, etc.
  
  -- Content
  content TEXT, -- Text content or caption
  media_id TEXT, -- WhatsApp media ID
  media_type TEXT, -- MIME type
  media_url TEXT, -- Downloaded media URL (S3, Supabase Storage, etc.)
  caption TEXT, -- Media caption
  
  -- Status tracking
  status TEXT CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'deleted')),
  conversation_id TEXT, -- WhatsApp conversation ID
  context_message_id TEXT, -- ID of message being replied to
  
  -- Additional data
  metadata JSONB DEFAULT '{}'::JSONB, -- Flexible storage for message-specific data
  
  -- Error tracking
  error_code INTEGER,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_id ON whatsapp_messages(gym_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number_id ON whatsapp_messages(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_number ON whatsapp_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_id ON whatsapp_messages(conversation_id) WHERE conversation_id IS NOT NULL;

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_created ON whatsapp_messages(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_gym_from ON whatsapp_messages(gym_id, from_number, created_at DESC);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_whatsapp_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_messages_updated_at
  BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp Webhook Logs Table
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request identification
  request_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  
  -- Event metadata
  event_type TEXT NOT NULL CHECK (event_type IN ('message', 'status', 'error', 'unknown')),
  payload JSONB NOT NULL, -- Full webhook payload for debugging
  
  -- Processing metadata
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  processing_time_ms INTEGER,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for webhook logs
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_request_id ON whatsapp_webhook_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_phone_number_id ON whatsapp_webhook_logs(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_event_type ON whatsapp_webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_created_at ON whatsapp_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_processed ON whatsapp_webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_signature_valid ON whatsapp_webhook_logs(signature_valid);

-- Auto-delete old webhook logs (keep last 7 days)
CREATE OR REPLACE FUNCTION delete_old_whatsapp_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_webhook_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════════════════
-- Gym WhatsApp Configuration Table
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gym_whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  gym_id UUID NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,
  
  -- WhatsApp Business Account configuration
  phone_number_id TEXT NOT NULL UNIQUE, -- WhatsApp Business Phone Number ID
  phone_number TEXT NOT NULL, -- Display phone number (E.164 format)
  business_account_id TEXT NOT NULL, -- WhatsApp Business Account ID
  
  -- Configuration
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_reply_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_gym_id ON gym_whatsapp_config(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_phone_number_id ON gym_whatsapp_config(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_gym_whatsapp_config_enabled ON gym_whatsapp_config(enabled);

-- Updated timestamp trigger
CREATE TRIGGER gym_whatsapp_config_updated_at
  BEFORE UPDATE ON gym_whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_messages_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ════════════════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Messages: Gym owners can only see their own messages
CREATE POLICY whatsapp_messages_select_policy ON whatsapp_messages
  FOR SELECT
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY whatsapp_messages_insert_policy ON whatsapp_messages
  FOR INSERT
  WITH CHECK (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY whatsapp_messages_update_policy ON whatsapp_messages
  FOR UPDATE
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

-- Webhook logs: Only accessible via service role (admin only)
CREATE POLICY whatsapp_webhook_logs_admin_policy ON whatsapp_webhook_logs
  FOR ALL
  USING (auth.uid() IS NOT NULL AND auth.jwt() ->> 'role' = 'service_role');

-- Config: Gym owners can manage their own config
CREATE POLICY gym_whatsapp_config_select_policy ON gym_whatsapp_config
  FOR SELECT
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY gym_whatsapp_config_update_policy ON gym_whatsapp_config
  FOR UPDATE
  USING (
    gym_id IN (
      SELECT id FROM gyms WHERE owner_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Helpful Views
-- ════════════════════════════════════════════════════════════════════════════

-- View for conversation threads
CREATE OR REPLACE VIEW whatsapp_conversations AS
SELECT 
  gym_id,
  from_number AS contact_number,
  MAX(created_at) AS last_message_at,
  COUNT(*) AS message_count,
  COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound_count,
  COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound_count,
  COUNT(*) FILTER (WHERE status = 'read') AS read_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM whatsapp_messages
WHERE direction = 'inbound'
GROUP BY gym_id, from_number
ORDER BY last_message_at DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- Comments for documentation
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE whatsapp_messages IS 'Stores all WhatsApp messages (inbound and outbound)';
COMMENT ON TABLE whatsapp_webhook_logs IS 'Logs all webhook events for debugging and monitoring';
COMMENT ON TABLE gym_whatsapp_config IS 'WhatsApp Business configuration per gym';
COMMENT ON VIEW whatsapp_conversations IS 'Aggregated view of conversations by contact';
