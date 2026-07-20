# WhatsApp Webhook - Deployment Checklist

Complete pre-deployment and post-deployment checklist for WhatsApp Cloud API integration.

## 📋 Pre-Deployment Checklist

### 1. Environment Configuration

- [ ] **Generate Verify Token** (32+ characters)
  ```bash
  openssl rand -hex 32
  ```

- [ ] **Get Meta Credentials**
  - [ ] WhatsApp Phone Number ID
  - [ ] Access Token (permanent)
  - [ ] App Secret
  - [ ] Business Account ID

- [ ] **Configure `.env.local`**
  ```env
  WHATSAPP_VERIFY_TOKEN=
  WHATSAPP_APP_SECRET=
  WHATSAPP_PHONE_NUMBER_ID=
  WHATSAPP_ACCESS_TOKEN=
  ```

- [ ] **Verify Supabase Configuration**
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Verify Redis Configuration**
  - [ ] `UPSTASH_REDIS_REST_URL`
  - [ ] `UPSTASH_REDIS_REST_TOKEN`

- [ ] **Configure Sentry** (recommended)
  - [ ] `NEXT_PUBLIC_SENTRY_DSN`

### 2. Run Verification Script

```bash
npx tsx scripts/verify-whatsapp-setup.ts
```

Expected output: All checks pass ✅

### 3. Database Setup

- [ ] **Run Migration**
  ```bash
  supabase db push
  ```

- [ ] **Verify Tables Created**
  - [ ] `whatsapp_messages`
  - [ ] `whatsapp_webhook_logs`
  - [ ] `gym_whatsapp_config`

- [ ] **Check Indexes**
  ```sql
  SELECT indexname FROM pg_indexes
  WHERE tablename = 'whatsapp_messages';
  ```

- [ ] **Verify RLS Policies**
  ```sql
  SELECT policyname, tablename FROM pg_policies
  WHERE tablename IN ('whatsapp_messages', 'whatsapp_webhook_logs', 'gym_whatsapp_config');
  ```

### 4. Code Review

- [ ] **Review Security**
  - [ ] No secrets hardcoded
  - [ ] No secrets in logs
  - [ ] Signature verification enabled
  - [ ] Idempotency enabled

- [ ] **Review Error Handling**
  - [ ] All errors caught
  - [ ] Sentry integration working
  - [ ] Graceful degradation

- [ ] **Review Performance**
  - [ ] Response time target: <500ms
  - [ ] Database queries optimized
  - [ ] Redis configured

### 5. Local Testing

- [ ] **Test Webhook Verification**
  ```bash
  curl "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=TEST"
  ```

- [ ] **Test Signature Verification**
  - [ ] Valid signature accepted
  - [ ] Invalid signature rejected
  - [ ] Missing signature rejected

- [ ] **Test Message Processing**
  - [ ] Text messages
  - [ ] Media messages
  - [ ] Interactive messages
  - [ ] Unknown message types

- [ ] **Test Status Updates**
  - [ ] Sent
  - [ ] Delivered
  - [ ] Read
  - [ ] Failed

- [ ] **Test Idempotency**
  - [ ] Duplicate messages ignored
  - [ ] Duplicate statuses ignored

### 6. Documentation Review

- [ ] Read [WHATSAPP_WEBHOOK.md](./WHATSAPP_WEBHOOK.md)
- [ ] Review [WHATSAPP_EXAMPLES.md](./WHATSAPP_EXAMPLES.md)
- [ ] Understand troubleshooting steps
- [ ] Know monitoring queries

---

## 🚀 Deployment Steps

### 1. Vercel Deployment

- [ ] **Push to Git**
  ```bash
  git add .
  git commit -m "Add WhatsApp webhook integration"
  git push origin main
  ```

- [ ] **Configure Environment Variables in Vercel**
  - Go to Project Settings → Environment Variables
  - Add all `WHATSAPP_*` variables
  - Add `SUPABASE_SERVICE_ROLE_KEY`
  - Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
  - Add `NEXT_PUBLIC_SENTRY_DSN`

- [ ] **Deploy**
  - Automatic deployment on push
  - Or manually trigger from Vercel dashboard

- [ ] **Wait for Build**
  - Check build logs for errors
  - Verify no configuration errors

> ⚠️ **Proxy subdomain binding — `graph.gymflow.sbs`**
>
> All outbound WhatsApp calls route through `WHATSAPP_BASE_URL` =
> `https://graph.gymflow.sbs/api/graph`, which is served by the transparent proxy
> at `app/api/graph/[...path]/route.ts`. That route **only exists in the main
> `gym-management-system` project** — NOT in `super-admin` or the landing page.
>
> The subdomain therefore MUST be attached to `gym-management-system` in Vercel
> (Settings → Domains). If it drifts to another project (e.g. `super-admin`), that
> project's middleware answers instead and every send fails with a `401
> Unauthorized` / `404 Non-JSON response` — the Meta credentials are fine, the
> request never reaches Meta.
>
> - [ ] Confirm binding: `vercel domains inspect graph.gymflow.sbs` → **Projects**
>       lists `gym-management-system`.
> - [ ] Smoke-test the proxy after any domain change (should return HTTP 200):
>       ```bash
>       curl -s -o /dev/null -w "%{http_code}\n" \
>         "https://graph.gymflow.sbs/api/graph/v25.0/$WHATSAPP_PHONE_NUMBER_ID" \
>         -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
>       ```
> - [ ] Prefer attaching the domain to the project in the **dashboard** (durable —
>       auto-aliased on every prod deploy). A `vercel alias set <deployment> graph.gymflow.sbs`
>       is a stop-gap only: it pins to one deployment and goes stale on the next deploy.

### 2. Database Migration (Production)

- [ ] **Connect to Production Database**
  ```bash
  supabase link --project-ref your-project-ref
  ```

- [ ] **Apply Migration**
  ```bash
  supabase db push
  ```

- [ ] **Verify in Supabase Dashboard**
  - Check Table Editor for new tables
  - Verify RLS policies applied

### 3. Meta Webhook Configuration

- [ ] **Go to Meta Developer Dashboard**
  - Navigate to your app
  - Go to WhatsApp → Configuration

- [ ] **Configure Webhook**
  - Click "Edit" on Webhook section
  - Callback URL: `https://your-domain.vercel.app/api/whatsapp/webhook`
  - Verify Token: Value from `WHATSAPP_VERIFY_TOKEN`
  - Click "Verify and Save"

- [ ] **Subscribe to Fields**
  - ✅ messages
  - ✅ message_status_updates
  - ✅ message_template_status_update (optional)

- [ ] **Verify Status**
  - Status should show "Verified" with green checkmark

### 4. Test in Production

- [ ] **Send Test Message**
  ```bash
  curl -X POST "https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages" \
    -H "Authorization: Bearer ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "messaging_product": "whatsapp",
      "to": "YOUR_TEST_NUMBER",
      "type": "text",
      "text": { "body": "Test from production" }
    }'
  ```

- [ ] **Verify Webhook Received**
  - Check Vercel logs
  - Check Supabase `whatsapp_webhook_logs` table
  - Check `whatsapp_messages` table for new message

- [ ] **Send Test Reply**
  - Reply to the test message from your phone
  - Verify webhook received
  - Verify message saved in database

### 5. Monitoring Setup

- [ ] **Configure Sentry Alerts**
  - Set up alerts for error rate
  - Set up alerts for performance degradation

- [ ] **Set Up Vercel Alerts**
  - Configure function timeout alerts
  - Configure error rate alerts

- [ ] **Create Dashboard Queries**
  ```sql
  -- Messages today
  SELECT COUNT(*) FROM whatsapp_messages
  WHERE created_at > CURRENT_DATE;
  
  -- Average processing time
  SELECT AVG(processing_time_ms) FROM whatsapp_webhook_logs
  WHERE created_at > NOW() - INTERVAL '1 hour';
  
  -- Failed webhooks
  SELECT * FROM whatsapp_webhook_logs
  WHERE processed = false
  ORDER BY created_at DESC;
  ```

- [ ] **Set Up Uptime Monitoring**
  - Use UptimeRobot, Better Stack, or similar
  - Monitor `/api/health` endpoint
  - Alert on downtime

---

## ✅ Post-Deployment Checklist

### Immediate Verification (0-1 hour)

- [ ] **Verify Webhook Active**
  - Status shows "Verified" in Meta dashboard
  - No errors in Vercel logs

- [ ] **Test All Message Types**
  - [ ] Text
  - [ ] Image
  - [ ] Video
  - [ ] Audio
  - [ ] Document
  - [ ] Location
  - [ ] Interactive

- [ ] **Test Status Updates**
  - [ ] Message sent → status updated
  - [ ] Message delivered → status updated
  - [ ] Message read → status updated

- [ ] **Verify Database**
  - [ ] Messages saving correctly
  - [ ] Statuses updating correctly
  - [ ] Webhook logs being created

- [ ] **Verify Idempotency**
  - [ ] Send same message twice (simulate retry)
  - [ ] Verify only one record in database

### Short-term Monitoring (1-24 hours)

- [ ] **Monitor Error Rate**
  - Check Sentry dashboard
  - Check Vercel error logs
  - Target: <1% error rate

- [ ] **Monitor Performance**
  - Average processing time <500ms
  - P95 processing time <1000ms
  - No timeouts

- [ ] **Monitor Volume**
  - Track messages per hour
  - Track statuses per hour
  - Verify capacity

- [ ] **Check Redis**
  - Verify idempotency working
  - Check Redis memory usage
  - Verify TTL working (24 hours)

### Medium-term Review (24 hours - 1 week)

- [ ] **Review Logs**
  - Any recurring errors?
  - Any patterns in failures?
  - Any performance bottlenecks?

- [ ] **Database Performance**
  - Query performance
  - Index usage
  - Storage growth rate

- [ ] **Cost Review**
  - Vercel function invocations
  - Supabase database usage
  - Upstash Redis usage
  - WhatsApp messaging costs

- [ ] **User Feedback**
  - Are messages arriving?
  - Any delivery issues?
  - Any missing features?

---

## 🔧 Rollback Plan

If issues occur, follow this rollback procedure:

### 1. Immediate Rollback

- [ ] **Disable Webhook in Meta**
  - Go to Meta Developer Dashboard
  - WhatsApp → Configuration → Webhook
  - Click "Edit" and unsubscribe from all fields

### 2. Revert Code Changes

- [ ] **Revert Git Commit**
  ```bash
  git revert HEAD
  git push origin main
  ```

- [ ] **Or Rollback in Vercel**
  - Go to Deployments
  - Find previous working deployment
  - Click "Promote to Production"

### 3. Database Rollback (if needed)

- [ ] **Drop New Tables** (CAREFUL!)
  ```sql
  DROP TABLE IF EXISTS whatsapp_webhook_logs;
  DROP TABLE IF EXISTS whatsapp_messages;
  DROP TABLE IF EXISTS gym_whatsapp_config;
  ```

### 4. Investigate Issues

- [ ] Review Vercel logs
- [ ] Review Sentry errors
- [ ] Review Supabase logs
- [ ] Identify root cause

### 5. Fix and Redeploy

- [ ] Fix identified issues
- [ ] Test locally
- [ ] Deploy again
- [ ] Follow deployment checklist again

---

## 📊 Success Metrics

Track these metrics to measure success:

### Performance
- ✅ Average response time <500ms
- ✅ P95 response time <1000ms
- ✅ P99 response time <2000ms
- ✅ Zero timeouts

### Reliability
- ✅ 99.9% uptime
- ✅ <0.1% error rate
- ✅ Zero data loss
- ✅ Zero duplicate messages

### Volume
- Messages processed per day
- Status updates per day
- Peak messages per minute

### Business
- User engagement rate
- Response time to customers
- Support ticket reduction

---

## 🆘 Emergency Contacts

### Internal
- **DevOps Team**: [contact]
- **Backend Team**: [contact]
- **On-call Engineer**: [rotation]

### External
- **Meta Support**: https://developers.facebook.com/support
- **Vercel Support**: support@vercel.com
- **Supabase Support**: support@supabase.io

---

## 📚 Additional Resources

- [WhatsApp Business Platform Docs](https://developers.facebook.com/docs/whatsapp)
- [Vercel Deployment Docs](https://vercel.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Next.js 15 Docs](https://nextjs.org/docs)

---

**Deployment Date**: _____________  
**Deployed By**: _____________  
**Production URL**: _____________  
**Webhook URL**: _____________  

---

**Last Updated:** July 4, 2026  
**Version:** 1.0.0
