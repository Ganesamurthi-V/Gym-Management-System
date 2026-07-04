# WhatsApp Cloud API Webhook - Production Guide

Complete guide for the WhatsApp Cloud API webhook integration in GymFlow.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Setup Guide](#setup-guide)
- [Configuration](#configuration)
- [Security](#security)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Flow

```
┌─────────────┐
│   Meta      │
│  WhatsApp   │
│  Platform   │
└──────┬──────┘
       │ POST /api/whatsapp/webhook
       │ (with X-Hub-Signature-256)
       ▼
┌─────────────────────────────────────────────┐
│          Next.js API Route                  │
│  /app/api/whatsapp/webhook/route.ts         │
├─────────────────────────────────────────────┤
│  1. Verify Signature                        │
│  2. Validate Schema (Zod)                   │
│  3. Parse Events                            │
│  4. Check Idempotency (Redis)               │
│  5. Process Events                          │
│  6. Return 200 OK (< 500ms)                 │
└─────────────────┬───────────────────────────┘
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│   Messages   │      │   Statuses   │
│  Processor   │      │  Processor   │
└──────┬───────┘      └──────┬───────┘
       │                     │
       └──────────┬──────────┘
                  ▼
         ┌─────────────────┐
         │   Supabase DB   │
         │    (Postgres)   │
         └─────────────────┘
```

### Components

1. **Webhook Route** (`app/api/whatsapp/webhook/route.ts`)
   - Entry point for all webhooks
   - Handles GET (verification) and POST (events)
   - Responds within 500ms target

2. **Verification Module** (`lib/whatsapp/verifyWebhook.ts`)
   - Validates Meta's webhook challenge
   - Returns challenge token

3. **Signature Verification** (`lib/whatsapp/verifySignature.ts`)
   - HMAC SHA-256 verification
   - Prevents unauthorized requests

4. **Schema Validation** (`lib/whatsapp/webhookSchemas.ts`)
   - Zod schemas for type safety
   - Validates all webhook payloads

5. **Idempotency** (`lib/whatsapp/idempotency.ts`)
   - Redis-based deduplication
   - 24-hour TTL

6. **Message Processor** (`services/whatsapp/messageProcessor.ts`)
   - Handles incoming messages
   - Stores in database
   - Queues for business logic

7. **Status Processor** (`services/whatsapp/statusProcessor.ts`)
   - Updates message delivery status
   - Tracks read receipts

8. **Repository Layer** (`repositories/whatsapp/whatsappRepository.ts`)
   - Database operations
   - Supabase client

---

## Setup Guide

### 1. Prerequisites

- WhatsApp Business Account
- Meta Business Suite access
- Vercel account (for deployment)
- Supabase project
- Upstash Redis instance

### 2. Meta Developer Setup

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app or select existing app
3. Add WhatsApp product
4. Configure WhatsApp Business Account
5. Get credentials:
   - **Phone Number ID**: Found in WhatsApp > API Setup
   - **Access Token**: Generate permanent token in WhatsApp > API Setup
   - **App Secret**: Found in App Settings > Basic

### 3. Generate Verify Token

Generate a secure random token (32+ characters):

```bash
# Option 1: OpenSSL
openssl rand -hex 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 3: Python
python -c "import secrets; print(secrets.token_hex(32))"
```

### 4. Configure Environment Variables

Add to `.env.local`:

```env
# WhatsApp Cloud API Configuration
WHATSAPP_VERIFY_TOKEN=your_generated_token_min_32_chars
WHATSAPP_APP_SECRET=your_app_secret_from_meta_dashboard
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_API_VERSION=v21.0
WHATSAPP_BASE_URL=https://graph.facebook.com

# Required dependencies
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

### 5. Database Migration

Run the SQL migration to create required tables:

```bash
# Using Supabase CLI
supabase db push

# Or manually run the migration file:
# supabase/migrations/20250704_create_whatsapp_tables.sql
```

### 6. Configure Webhook in Meta

1. Go to WhatsApp > Configuration in Meta Developer Dashboard
2. Click "Edit" on Webhook section
3. Enter:
   - **Callback URL**: `https://your-domain.vercel.app/api/whatsapp/webhook`
   - **Verify Token**: The token from `WHATSAPP_VERIFY_TOKEN`
4. Click "Verify and Save"
5. Subscribe to webhook fields:
   - ✅ messages
   - ✅ message_status_updates
   - ✅ message_template_status_update (optional)

---

## Configuration

### Environment Validation

Configuration is validated on startup using Zod:

```typescript
import { validateWhatsAppConfig } from '@/config/whatsapp'

// In your app startup or middleware
validateWhatsAppConfig()
```

### Required Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Webhook verification token (32+ chars) | `abc123...` |
| `WHATSAPP_APP_SECRET` | ✅ | App secret for signature verification | `def456...` |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | WhatsApp Business Phone Number ID | `123456789012345` |
| `WHATSAPP_ACCESS_TOKEN` | ✅ | Permanent access token | `EAAx...` |
| `WHATSAPP_API_VERSION` | ❌ | Graph API version | `v21.0` (default) |
| `WHATSAPP_BASE_URL` | ❌ | Graph API base URL | `https://graph.facebook.com` |

---

## Security

### Signature Verification

Every webhook request is verified using HMAC SHA-256:

```typescript
const signature = req.headers.get('x-hub-signature-256')
// Format: sha256=<hex>

const expectedHash = crypto
  .createHmac('sha256', APP_SECRET)
  .update(rawBody)
  .digest('hex')

const isValid = crypto.timingSafeEqual(
  Buffer.from(signatureHash, 'hex'),
  Buffer.from(expectedHash, 'hex')
)
```

**Security Features:**
- ✅ Constant-time comparison (prevents timing attacks)
- ✅ Raw body verification (exact bytes)
- ✅ Automatic rejection of invalid signatures
- ✅ No secret exposure in logs

### Idempotency

Prevents duplicate processing when Meta retries:

```typescript
// Check if message was already processed
const isNew = await checkAndMarkEvent(messageId, 'message')
if (!isNew) {
  return // Skip duplicate
}
```

**Implementation:**
- Redis SET NX EX (atomic check-and-set)
- 24-hour TTL
- Separate namespaces for messages and statuses

### Rate Limiting

Consider adding rate limiting:

```typescript
import { checkRateLimit } from '@/lib/rateLimit'

const { allowed } = await checkRateLimit(
  phoneNumberId,
  'whatsapp_webhook',
  100 // 100 requests per minute
)
```

---

## Database Schema

### Tables

#### `whatsapp_messages`
Stores all WhatsApp messages (inbound and outbound).

```sql
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  gym_id UUID NOT NULL,
  phone_number_id TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  direction TEXT NOT NULL, -- 'inbound' | 'outbound'
  message_type TEXT NOT NULL, -- 'text' | 'image' | etc.
  content TEXT,
  media_id TEXT,
  status TEXT, -- 'sent' | 'delivered' | 'read' | 'failed'
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `whatsapp_webhook_logs`
Logs all webhook events for debugging.

```sql
CREATE TABLE whatsapp_webhook_logs (
  id UUID PRIMARY KEY,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN,
  processed BOOLEAN,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ
);
```

#### `gym_whatsapp_config`
Configuration per gym.

```sql
CREATE TABLE gym_whatsapp_config (
  id UUID PRIMARY KEY,
  gym_id UUID UNIQUE NOT NULL,
  phone_number_id TEXT UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ
);
```

### Indexes

Optimized for high-throughput queries:

- `idx_whatsapp_messages_message_id` (unique lookups)
- `idx_whatsapp_messages_gym_id` (per-gym queries)
- `idx_whatsapp_messages_created_at` (time-based queries)
- `idx_whatsapp_messages_gym_created` (composite for conversations)

---

## API Reference

### GET /api/whatsapp/webhook

Webhook verification endpoint.

**Query Parameters:**
- `hub.mode` - Must be "subscribe"
- `hub.verify_token` - Your verify token
- `hub.challenge` - Challenge string to echo back

**Response:**
```
200 OK
Content-Type: text/plain

<challenge string>
```

### POST /api/whatsapp/webhook

Receive webhook events.

**Headers:**
```
Content-Type: application/json
X-Hub-Signature-256: sha256=<hex>
```

**Body:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+1234567890",
          "phone_number_id": "123456789"
        },
        "messages": [{
          "from": "1234567890",
          "id": "wamid.xxx",
          "timestamp": "1234567890",
          "type": "text",
          "text": {
            "body": "Hello!"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Testing

### Local Testing with ngrok

1. Install ngrok:
```bash
npm install -g ngrok
```

2. Start your dev server:
```bash
npm run dev
```

3. Expose via ngrok:
```bash
ngrok http 3000
```

4. Update webhook URL in Meta dashboard to ngrok URL

### Test Webhook Verification

```bash
curl "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE_123"
```

Expected: Returns `CHALLENGE_123`

### Test Signature Verification

```bash
# Generate signature
BODY='{"test": "payload"}'
SECRET="your_app_secret"
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$BODY"
```

### Test with Real Message

Send a test message via WhatsApp Business API:

```bash
curl -X POST "https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "1234567890",
    "type": "text",
    "text": {
      "body": "Test message"
    }
  }'
```

---

## Deployment

### Vercel Deployment

1. **Push to Git:**
```bash
git add .
git commit -m "Add WhatsApp webhook"
git push
```

2. **Configure Environment Variables in Vercel:**
   - Go to Project Settings > Environment Variables
   - Add all `WHATSAPP_*` variables
   - Deploy

3. **Update Webhook URL in Meta:**
   - Change callback URL to: `https://your-app.vercel.app/api/whatsapp/webhook`
   - Verify and save

### Production Checklist

- ✅ All environment variables configured
- ✅ Database migration applied
- ✅ Redis configured
- ✅ Sentry configured
- ✅ Webhook verified in Meta dashboard
- ✅ Test message sent and received
- ✅ Monitoring dashboards set up

---

## Monitoring

### Metrics to Track

1. **Webhook Performance**
   - Processing time (target: <500ms)
   - Success rate
   - Failure rate

2. **Message Volume**
   - Messages per minute
   - Status updates per minute

3. **Error Rates**
   - Signature verification failures
   - Schema validation failures
   - Database errors

### Sentry Integration

Errors are automatically reported to Sentry with context:

```typescript
Sentry.captureException(error, {
  tags: {
    component: 'whatsapp_webhook',
    message_id: messageId,
  },
  extra: {
    message,
  },
})
```

### Logging

All requests are logged with structured JSON:

```json
{
  "requestId": "abc123",
  "context": "WHATSAPP_WEBHOOK",
  "totalMs": 234,
  "messages": 1,
  "statuses": 0,
  "processed": true
}
```

### Database Queries for Monitoring

```sql
-- Messages received in last hour
SELECT COUNT(*) FROM whatsapp_messages
WHERE created_at > NOW() - INTERVAL '1 hour'
AND direction = 'inbound';

-- Failed messages
SELECT * FROM whatsapp_messages
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Webhook processing times
SELECT 
  AVG(processing_time_ms) as avg_ms,
  MAX(processing_time_ms) as max_ms,
  MIN(processing_time_ms) as min_ms
FROM whatsapp_webhook_logs
WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

## Troubleshooting

### Webhook Verification Fails

**Symptom:** "Invalid verify token" error in Meta dashboard

**Solutions:**
1. Check `WHATSAPP_VERIFY_TOKEN` matches exactly
2. No extra spaces or quotes
3. Token is at least 32 characters
4. Verify locally first with curl

### Signature Verification Fails

**Symptom:** 401 Unauthorized responses

**Solutions:**
1. Check `WHATSAPP_APP_SECRET` is correct
2. Verify raw body is used (not parsed JSON)
3. Check for middleware that modifies body
4. Test signature generation locally

### Messages Not Saving

**Symptom:** Webhook returns 200 but no data in database

**Solutions:**
1. Check `SUPABASE_SERVICE_ROLE_KEY` is set
2. Verify database migration was applied
3. Check RLS policies
4. Look for errors in Supabase logs

### Duplicate Messages

**Symptom:** Same message appears multiple times

**Solutions:**
1. Verify Redis is configured (`UPSTASH_REDIS_REST_URL`)
2. Check idempotency logs
3. Ensure message ID is unique
4. Check database constraints

### Performance Issues

**Symptom:** Webhook processing takes >500ms

**Solutions:**
1. Check database query performance
2. Verify Redis latency
3. Review Sentry performance monitoring
4. Consider async processing for heavy operations
5. Add database indexes

---

## Next Steps

### Feature Additions

1. **Media Downloads**
   - Download images/videos from WhatsApp
   - Store in Supabase Storage or S3

2. **Auto-Replies**
   - Configure per-gym auto-reply messages
   - Business hours detection

3. **Member Matching**
   - Link WhatsApp numbers to gym members
   - Conversation history per member

4. **Notifications**
   - Real-time notifications to gym staff
   - WebSocket or Server-Sent Events

5. **Message Templates**
   - Send structured template messages
   - Appointment reminders
   - Payment notifications

### Scaling Considerations

- **Database:** Add read replicas for high traffic
- **Redis:** Use Redis Cluster for high availability
- **Queue:** Add message queue (SQS, RabbitMQ) for async processing
- **Rate Limiting:** Per-gym rate limits
- **Caching:** Cache gym configurations in Redis

---

## Support

For issues or questions:
- Check [Meta WhatsApp Business Platform Docs](https://developers.facebook.com/docs/whatsapp)
- Review [Troubleshooting](#troubleshooting) section
- Check application logs in Vercel
- Review Sentry error reports
- Check database logs in Supabase

---

**Last Updated:** July 4, 2026
**Version:** 1.0.0
