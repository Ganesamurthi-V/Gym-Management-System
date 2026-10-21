# WhatsApp Cloud API Integration

Production-ready WhatsApp Business Platform webhook handler for GymFlow.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install zod pino pino-pretty
```

### 2. Configure Environment

Add to `.env.local`:

```env
WHATSAPP_VERIFY_TOKEN=your_32_char_token
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_ACCESS_TOKEN=your_access_token
```

### 3. Run Database Migration

```bash
# Apply migration to create tables
supabase db push
```

### 4. Configure Meta Webhook

1. Go to Meta Developer Dashboard
2. WhatsApp > Configuration > Webhook
3. Set callback URL: `https://your-domain.vercel.app/api/whatsapp/webhook`
4. Set verify token (from `WHATSAPP_VERIFY_TOKEN`)
5. Subscribe to: `messages`, `message_status_updates`

## 📁 Module Structure

```
lib/whatsapp/
├── webhookTypes.ts          # TypeScript type definitions
├── webhookSchemas.ts        # Zod validation schemas
├── verifyWebhook.ts         # GET verification handler
├── verifySignature.ts       # HMAC SHA-256 signature verification
├── parseWebhook.ts          # Payload parsing & normalization
├── idempotency.ts           # Redis-based deduplication
└── README.md                # This file

services/whatsapp/
├── messageProcessor.ts      # Incoming message handler
└── statusProcessor.ts       # Status update handler

repositories/whatsapp/
└── whatsappRepository.ts    # Database operations

config/
└── whatsapp.ts              # Environment validation & config

app/api/whatsapp/webhook/
└── route.ts                 # Main webhook route handler
```

## 🔒 Security Features

### ✅ Signature Verification
Every webhook request is verified using HMAC SHA-256 with your App Secret.

```typescript
import { verifySignature } from '@/lib/whatsapp/verifySignature'

const isValid = await verifySignature(req, rawBody)
if (!isValid) {
  return 401 // Reject
}
```

### ✅ Idempotency
Prevents duplicate processing using Redis with 24-hour TTL.

```typescript
import { checkAndMarkEvent } from '@/lib/whatsapp/idempotency'

const isNew = await checkAndMarkEvent(messageId, 'message')
if (!isNew) {
  return // Skip duplicate
}
```

### ✅ Schema Validation
All payloads validated with Zod schemas.

```typescript
import { webhookPayloadSchema } from '@/lib/whatsapp/webhookSchemas'

const result = webhookPayloadSchema.safeParse(payload)
if (!result.success) {
  return 400 // Invalid payload
}
```

### ✅ Input Sanitization
- No SQL injection (parameterized queries)
- No XSS (JSON responses only)
- No secrets in logs

## 📊 Database Schema

### `whatsapp_messages`
All messages (inbound & outbound) with full content and status tracking.

### `whatsapp_webhook_logs`
Debug logs for all webhook events (auto-deleted after 7 days).

### `gym_whatsapp_config`
Per-gym WhatsApp configuration and phone number mapping.

## 🔄 Message Flow

```
Meta → POST /webhook → Verify Signature → Validate Schema
  → Parse Events → Check Idempotency → Process Messages
  → Save to DB → Return 200 (< 500ms)
```

## Gamification messages

Four extra templates support the leaderboards: `gym_streak_at_risk`, `gym_weekly_goal_reached`, `gym_leaderboard_rank_up` (scheduled) and `gym_prize_awarded` (event).

- **No new cron or route.** The three scheduled nudges are one more step of `runDailyWhatsAppAutomation()` (`automation.ts` → `runGamificationNudges()`), run per gym after the reminders. They claim a slot in `whatsapp_automation_logs` and are delivered through `whatsapp_send_queue` like every other scheduled send. Counts are returned in `stats.gamification`.
- **Off by default.** The templates do not exist in Meta until they are created by hand, so a template is sent only when its name is in `ENABLED_GAMIFICATION_TEMPLATES` in `config/whatsapp.ts` (empty by default). The check runs before anything is read, claimed or queued, and again in `sendTemplate`.
- **Gates.** A gym is skipped when `gyms.whatsapp_enabled` is off or when its Leaderboards switch (`gym_gamification_settings.leaderboards_enabled`) is off.
- **Caps.** One gamification message per member per day (priority: streak, weekly goal, rank). Streak: once per streak-day. Weekly goal: once per ISO week. Rank: once per 7 days.
- **Who gets what** is decided by the pure `selectNudges()` in `gamificationNudges.ts`, using the streak and day rules in `lib/gamification/`.
- **Prize message.** `sendPrizeAwardedMessage({ gymId, memberId, prize, periodLabel, board })` in `automation.ts` is an inline claim-then-send, to be called from the owner's "Mark prize awarded" server action with a server-resolved gym.
- **Copy for Meta** (names, categories, body text, variables, how to enable): [`GAMIFICATION_TEMPLATES.md`](./GAMIFICATION_TEMPLATES.md). It is checked against `services/whatsapp/templateSpec.ts` by `__tests__/whatsapp/gamificationTemplatesDoc.test.ts`.

## Bulk member-app invites

`POST /api/member-app/invite-all` queues a `member_app_invitation` row per eligible member (has a phone, not
`activated`) on the same throttled `whatsapp_send_queue`, so even 10 invites drain at 5 per 5 minutes.
Enqueue stores only the member id and `{ phone, gymName, memberName, gymId }`. The invitation token is minted
just-in-time inside `drainSendQueue` (the `prepare` step, default `prepareMemberInvitation` in
`lib/member-invitation-server.ts`), because tokens expire after 24 hours and a large gym can sit in the queue
longer than that. A permanent prepare failure (already activated, no phone, email conflict) marks the row
`failed` without sending; a transient one retries like any other failure. After a successful send the worker
logs `invitation_resent` in `member_portal_activity`.

## 🛠️ Development

### Local Testing with ngrok

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Expose via ngrok
ngrok http 3000

# Update Meta webhook URL to ngrok URL
```

### Run Tests

```bash
npm test __tests__/whatsapp/webhook.test.ts
```

### Test Signature Verification

```bash
```

## 📚 Documentation

- [Meta WhatsApp Docs](https://developers.facebook.com/docs/whatsapp)

## 🐛 Troubleshooting

### Webhook Verification Fails
- Verify `WHATSAPP_VERIFY_TOKEN` matches exactly
- Check for typos or extra spaces
- Test locally with curl first

### Invalid Signature
- Check `WHATSAPP_APP_SECRET` is correct
- Ensure raw body is used (not parsed JSON)
- Verify no middleware modifies body

### Messages Not Saving
- Check `SUPABASE_SERVICE_ROLE_KEY` is set
- Verify migration was applied
- Check Supabase logs

### Duplicates
- Verify `UPSTASH_REDIS_REST_URL` is configured
- Check Redis connectivity
- Review idempotency logs

## 📈 Monitoring

### Key Metrics
- Processing time (target: <500ms)
- Success rate
- Duplicate rate
- Error rate by type

### Queries

```sql
-- Messages received today
SELECT COUNT(*) FROM whatsapp_messages
WHERE created_at > CURRENT_DATE
AND direction = 'inbound';

-- Average processing time
SELECT AVG(processing_time_ms) FROM whatsapp_webhook_logs
WHERE created_at > NOW() - INTERVAL '1 hour';
```

## 🚢 Deployment

### Vercel

1. Push to Git
2. Add environment variables in Vercel dashboard
3. Deploy
4. Update Meta webhook URL

### Checklist

- ✅ Environment variables configured
- ✅ Database migration applied
- ✅ Redis configured
- ✅ Sentry configured
- ✅ Webhook verified in Meta
- ✅ Test message sent

## 🔮 Future Enhancements

- [ ] Media download & storage
- [ ] Auto-reply system
- [ ] Member phone number matching
- [ ] Real-time notifications
- [ ] Template message sending
- [ ] Conversation analytics

## 📝 License

Part of GymFlow SaaS platform.

---

**Version:** 1.0.0  
**Last Updated:** July 4, 2026
