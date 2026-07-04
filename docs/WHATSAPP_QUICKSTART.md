# WhatsApp Webhook - Quick Start Guide

Get up and running with WhatsApp integration in 15 minutes.

## 🚀 Quick Setup (15 minutes)

### Step 1: Install Dependencies (2 min)

```bash
cd gymflow
npm install
```

Dependencies installed: `zod`, `pino`, `pino-pretty`

### Step 2: Get Meta Credentials (5 min)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create/select your app
3. Add WhatsApp product
4. Get these credentials:
   - **Phone Number ID**: WhatsApp → API Setup
   - **Access Token**: WhatsApp → API Setup → Generate Token
   - **App Secret**: App Settings → Basic

### Step 3: Configure Environment (2 min)

Create/update `.env.local`:

```bash
# Generate verify token
openssl rand -hex 32
```

```env
# WhatsApp Configuration
WHATSAPP_VERIFY_TOKEN=<paste generated token>
WHATSAPP_APP_SECRET=<from Meta dashboard>
WHATSAPP_PHONE_NUMBER_ID=<from Meta dashboard>
WHATSAPP_ACCESS_TOKEN=<from Meta dashboard>

# Existing required vars
NEXT_PUBLIC_SUPABASE_URL=<your supabase url>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
UPSTASH_REDIS_REST_URL=<your redis url>
UPSTASH_REDIS_REST_TOKEN=<your redis token>
```

### Step 4: Verify Configuration (1 min)

```bash
npm run verify:whatsapp
```

Expected output: All checks pass ✅

### Step 5: Database Setup (2 min)

```bash
# Apply migration
supabase db push
```

Verifies these tables are created:
- `whatsapp_messages`
- `whatsapp_webhook_logs`
- `gym_whatsapp_config`

### Step 6: Test Locally (2 min)

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Test verification endpoint
curl "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=TEST123"
```

Expected output: `TEST123`

### Step 7: Deploy (1 min)

```bash
git add .
git commit -m "Add WhatsApp webhook integration"
git push
```

Vercel will automatically deploy.

### Step 8: Configure Meta Webhook (2 min)

1. Go to Meta Developer Dashboard
2. WhatsApp → Configuration → Webhook
3. Click "Edit"
4. Enter:
   - **Callback URL**: `https://your-app.vercel.app/api/whatsapp/webhook`
   - **Verify Token**: Value from `WHATSAPP_VERIFY_TOKEN`
5. Click "Verify and Save"
6. Subscribe to:
   - ✅ messages
   - ✅ message_status_updates

---

## ✅ You're Done!

Send a test message:

```bash
curl -X POST "https://graph.facebook.com/v21.0/YOUR_PHONE_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "YOUR_PHONE_NUMBER",
    "type": "text",
    "text": {
      "body": "Hello from GymFlow!"
    }
  }'
```

Check Supabase database:
```sql
SELECT * FROM whatsapp_messages ORDER BY created_at DESC LIMIT 5;
```

---

## 📚 Next Steps

### Customize Business Logic

Edit `services/whatsapp/messageProcessor.ts`:

```typescript
async function handleTextMessage(message: ProcessedMessage, gymId: string) {
  // Add your custom logic here
  // - Auto-replies
  // - Member lookup
  // - Booking integration
  // - etc.
}
```

### Add Auto-Replies

```typescript
// In messageProcessor.ts
if (message.text?.toLowerCase().includes('hours')) {
  // Send auto-reply with gym hours
  await sendTextMessage(message.from, 'We are open 6am-10pm daily!')
}
```

### Track Conversations

```sql
-- View conversations
SELECT * FROM whatsapp_conversations;

-- Messages from specific contact
SELECT * FROM whatsapp_messages
WHERE from_number = '1234567890'
ORDER BY created_at DESC;
```

---

## 🔍 Monitoring

### Check Recent Messages

```sql
SELECT 
  message_type,
  COUNT(*) as count
FROM whatsapp_messages
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY message_type;
```

### Check Processing Performance

```sql
SELECT 
  AVG(processing_time_ms) as avg_ms,
  MAX(processing_time_ms) as max_ms
FROM whatsapp_webhook_logs
WHERE created_at > NOW() - INTERVAL '1 hour';
```

### Check Errors

```sql
SELECT * FROM whatsapp_webhook_logs
WHERE processed = false
ORDER BY created_at DESC;
```

---

## 🆘 Troubleshooting

### Webhook verification fails
- Double-check `WHATSAPP_VERIFY_TOKEN` matches exactly
- No extra spaces or quotes
- Test locally first

### Messages not saving
- Check `SUPABASE_SERVICE_ROLE_KEY` is set
- Verify database migration was applied
- Check Supabase logs

### Signature errors
- Check `WHATSAPP_APP_SECRET` is correct
- Verify from Meta dashboard → App Settings → Basic

### Need Help?
- [Complete Documentation](./WHATSAPP_WEBHOOK.md)
- [Example Payloads](./WHATSAPP_EXAMPLES.md)
- [Deployment Guide](./WHATSAPP_DEPLOYMENT.md)

---

**Time to complete:** ~15 minutes  
**Difficulty:** Beginner  
**Prerequisites:** Meta Developer account, Vercel account, Supabase project
