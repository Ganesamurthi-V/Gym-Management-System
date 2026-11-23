# WhatsApp module

This module sends WhatsApp messages to gym members and receives Meta's webhook events. It uses the WhatsApp Cloud API.

All gyms share one WhatsApp number. Because of that, the module has strict rules about queues, limits and duplicates. Read the Gotchas section before you change anything.

## What it does

- **Event sends** go out right away: welcome, renewal and prize awarded.
- **Scheduled sends** (reminders, gamification nudges, member-app invites) go into a queue and are sent slowly.
- **Webhook** receives incoming messages and delivery status updates from Meta.
- **Safety rules** stop sends when a gym switches WhatsApp off, when Meta's daily limit is reached, or when a send might be a duplicate.

## How it works

### Event sends

Welcome, renewal and prize messages fire inline. The code first claims a slot (so it cannot send twice), then calls `sendTemplate`.

### Scheduled sends

```
Daily cron 09:00 IST  ->  runDailyWhatsAppAutomation()  ->  whatsapp_send_queue
QStash, every 5 min   ->  POST /api/whatsapp/queue/drain ->  sendTemplate  ->  Meta
```

- The daily job is `POST /api/cron/whatsapp` (`03:30 UTC`, which is 09:00 IST). It is a QStash schedule, not a Vercel cron. See `infra/set-qstash-schedules.sh`.
- New scheduled work becomes one more step inside `runDailyWhatsAppAutomation()` in `automation.ts`. Do not add new crons.
- The drain sends up to `BATCH_SIZE` = 100 messages per run (`queue.ts`). Each run stops claiming rows after `DRAIN_TIME_BUDGET_MS` = 40 s. If work is left, it schedules the next run for one minute later.

### Incoming webhook

```
Meta -> POST /api/whatsapp/webhook
  -> verify signature -> validate schema -> parse events
  -> check idempotency -> process messages and statuses
  -> save to DB -> return 200
```

The route returns 200 quickly so Meta does not retry. It only processes changes in the `messages` field and ignores the other field types Meta sends.

### Every send goes through `sendTemplate`

`sendTemplate` is in `services/whatsapp/graph.ts`. Callers must set `TemplateContext.gymId` from a server-resolved gym. It runs these checks in order:

1. Per-gym switch (see below).
2. Template validation.
3. Meta 250-customer reservation (see below).
4. The Graph API call.

## Setup

### 1. Environment variables

Copy `.env.example` to `.env.local`. Without these four the module is not configured (`config/whatsapp.ts` validates them with zod).

| Variable | Required | Notes |
|----------|----------|-------|
| `WHATSAPP_VERIFY_TOKEN` | Yes | Any string you choose, at least 32 characters. You enter the same value in Meta. |
| `WHATSAPP_APP_SECRET` | Yes | Meta app dashboard, App settings, Basic. At least 32 characters. Used to verify webhook signatures. |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | The ID of your registered WhatsApp number. |
| `WHATSAPP_ACCESS_TOKEN` | Yes | Access token for the WhatsApp Business Platform. |
| `WHATSAPP_API_VERSION` | No | Graph API version. Default `v21.0`. |
| `WHATSAPP_BASE_URL` | No | Where Graph calls are sent. `.env.example` uses `https://graph.facebook.com`. The code default is the hosted GymFlow proxy, so set this yourself if you self-host. |
| `WHATSAPP_DAILY_RECIPIENT_LIMIT` | No | Unique customers per rolling 24 h. Default 250. |
| `WHATSAPP_QUEUE_RECIPIENT_RESERVE` | No | Slots kept free for inline sends. Default 30. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | The webhook and queue write with the service role. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Recommended | Webhook idempotency and the queue rate limit. |
| `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | For the queue | QStash calls the drain route and verifies its signature. |
| `CRON_SECRET` | For crons | Sent as the `x-cron-secret` header by the daily cron. |

### 2. Database

The tables are in `supabase-schema.sql`. Run that file (fresh install) or the matching files in `supabase/migrations/` (existing database) in the Supabase SQL editor. Do not use `supabase db push`; migrations are applied by hand in this repo.

Main tables:

| Table | Purpose |
|-------|---------|
| `whatsapp_messages` | All inbound and outbound messages with status. |
| `whatsapp_webhook_logs` | Webhook debug logs, deleted after 7 days. |
| `gym_whatsapp_config` | Per-gym WhatsApp settings. |
| `whatsapp_send_queue` | Scheduled sends waiting to go out. |
| `whatsapp_automation_logs` | One row per scheduled send slot, so the cron never sends twice. |
| `whatsapp_recipient_window` | The rolling 24 h recipient window (service role only). |

### 3. Meta webhook

1. In the Meta developer dashboard, open WhatsApp, Configuration, Webhook.
2. Set the callback URL to `https://<your-app-host>/api/whatsapp/webhook`.
3. Set the verify token to the value of `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to the `messages` field. Delivery status updates arrive through this same field.

### 4. Schedules

Create the QStash schedules with `infra/set-qstash-schedules.sh`. The queue drain is triggered by QStash through `/api/whatsapp/queue/drain`. It accepts the QStash signature or the `x-cron-secret` header.

### 5. Check your setup

```bash
npm run verify:whatsapp
```

This runs `scripts/verify-whatsapp-setup.ts`, which checks the environment variables and points back to this file.

### Hosting note

Production runs on AWS with SST (`infra/sst.config.ts`). `vercel.json` stays in the repo for people who self-host on Vercel. Do not run the QStash schedules and the Vercel crons together, or the automation runs twice.

## Files

```
lib/whatsapp/                  engine: automation, queue, sender, gym gate, limits, webhook helpers
  automation.ts                runDailyWhatsAppAutomation(), prize message
  queue.ts                     whatsapp_send_queue drain
  gymGate.ts                   per-gym on/off switch
  recipientLimit.ts            Meta 250 / 24 h limit
  reminderWindow.ts            3-month reminder rule
  gamificationNudges.ts        pure selectNudges()
  verifySignature.ts, verifyWebhook.ts, parseWebhook.ts, webhookSchemas.ts, idempotency.ts
services/whatsapp/             Graph client (graph.ts), templateSpec.ts, validateTemplate.ts, message/status processors
repositories/whatsapp/         whatsappRepository.ts (DB access)
config/whatsapp.ts             env validation and ENABLED_GAMIFICATION_TEMPLATES
app/api/whatsapp/              webhook, send, queue/drain, automation/*
```

## Security

- **Signature.** Every webhook POST is checked with HMAC SHA-256 and `WHATSAPP_APP_SECRET` (`X-Hub-Signature-256` header). Use the raw body, not parsed JSON.
- **Idempotency.** Redis remembers processed event ids for 24 hours (`checkAndMarkEvent` in `idempotency.ts`).
- **Validation.** Payloads are checked with zod (`webhookSchemas.ts`).
- **Logs.** Secrets are never logged.

## Per-gym switch

`gyms.whatsapp_enabled` stops all sends for one gym. The admin app sets it (Manage Subscription, WhatsApp Enabled).

- It is read fresh on every send, never cached, in `sendTemplate` (`lib/whatsapp/gymGate.ts`).
- The daily cron also skips such gyms.
- A skipped send is recorded as `error`, not `cancelled`. This is on purpose: reminders resume when the switch is turned back on.

## Meta 250 customers / 24 h limit

Meta lets our one shared number message **250 unique customers per rolling 24 hours** (business-initiated). A customer messaged several times in the window counts once. They leave the count 24 h after their first message in it. Going over blocks messaging and hurts the number's quality.

- **Global, not per gym.** All gyms share one table, `whatsapp_recipient_window(phone_e164, first_sent_at)`.
- **Where it is enforced.** `sendTemplate` calls `reserve_whatsapp_recipient(phone, limit)` (through `reserveRecipient` in `recipientLimit.ts`). This happens after the gym switch and validation, and before the Graph call. Queue, welcome, renewal, prize and owner manual sends all pass through it. An advisory lock stops two senders taking the last slot.
- **Reserve.** The queue may only use `LIMIT - RESERVE` recipients. This keeps room for OTPs and inline welcome or renewal messages.
- **Defer, not fail.** A denied send returns `deferred` with `retryAt`. The queue puts the row back to `pending` at `retryAt` and does not count an attempt. Automation log rows are released like `skipped`. The owner manual send gets a 429.
- **Slot hand-back.** A definite Meta rejection frees a slot that this attempt created. A success or an unknown outcome keeps it.
- **Fail closed.** If the RPC errors or is missing (migration not applied), nothing is sent. Callers are told to retry in about 2 minutes.
- **Higher tier.** When Meta raises the number's tier, set `WHATSAPP_DAILY_RECIPIENT_LIMIT` to the new value. No code change is needed.
- **Check usage.** `select public.whatsapp_recipient_window_usage()` returns `{in_window, oldest}`.

## Exactly-once sends

Meta's Cloud API has no idempotency key. So the code never resends when it does not know the outcome:

- **Stable id.** Every queue send carries `dedupeKey = whatsapp_send_queue.id` in `TemplateContext`. `sendTemplate` adds it to the request as `biz_opaque_callback_data` (after template validation). Meta echoes it in status webhooks.
- **Unknown outcomes.** `sendMessage` does not retry timeouts, network errors or 5xx (`retryAmbiguous: false` in `lib/fetch.ts`; 429 still retries) and returns `ambiguous: true`. The queue then leaves the row `sending`. `finalizeSendRow` keeps the automation log slot `sent`, so the daily cron cannot resend it.
- **Webhook confirmation.** A `sent`, `delivered` or `read` status with the id calls `confirmQueuedSend`, which marks the row `sent`. A re-queued `pending` retry is cancelled this way. A `failed` status never confirms.
- **Lease.** Each drain first reaps rows stuck in `sending` for more than `LEASE_MINUTES` (10). They go back to `pending`, or to `failed` once `attempts >= max_attempts`.
- **Residual risk.** If Meta accepts a send, the worker dies, and no status webhook arrives within 10 minutes, the retry can duplicate the message. `max_attempts` limits how often.

## Reminder window

`membership_expiry_reminder` and `membership_expired` are never sent to a member whose latest `end_date` (the latest across all their memberships) is more than 3 calendar months before today (IST).

- The rule is `isExpiredBeyondReminderWindow` in `reminderWindow.ts`. An end date exactly 3 months back is still allowed. One day earlier is not.
- It is applied when scheduling (daily cron and import batch) and again in the queue drain right before sending, so rows queued earlier are dropped.
- A drain skip is recorded as `cancelled` (queue row and log row). This is a permanent business rule that closes the cycle. The per-gym switch uses `error` instead, so sends resume.
- Other templates are not affected.

## Gamification messages

Four extra templates support the leaderboards: `gym_streak_at_risk`, `gym_weekly_goal_reached`, `gym_leaderboard_rank_up` (scheduled) and `gym_prize_awarded` (event).

- **No new cron or route.** The three scheduled nudges are one more step of `runDailyWhatsAppAutomation()` (`automation.ts` calls `runGamificationNudges()`), run per gym after the reminders. They claim a slot in `whatsapp_automation_logs` and go through `whatsapp_send_queue` like every other scheduled send. Counts are returned in `stats.gamification`.
- **Off by default.** The templates do not exist in Meta until someone creates them by hand. A template is sent only when its name is in `ENABLED_GAMIFICATION_TEMPLATES` in `config/whatsapp.ts` (empty by default). The check runs before anything is read, claimed or queued, and again in `sendTemplate`.
- **Gates.** A gym is skipped when `gyms.whatsapp_enabled` is off or when its Leaderboards switch (`gym_gamification_settings.leaderboards_enabled`) is off.
- **Caps.** One gamification message per member per day (priority: streak, weekly goal, rank). Streak: once per streak-day. Weekly goal: once per ISO week. Rank: once per 7 days.
- **Who gets what** is decided by the pure function `selectNudges()` in `gamificationNudges.ts`, using the streak and day rules in `lib/gamification/`.
- **Prize message.** `sendPrizeAwardedMessage({ gymId, memberId, prize, periodLabel, board })` in `automation.ts` is an inline claim-then-send. Call it from the owner's "Mark prize awarded" server action with a server-resolved gym.
- **Copy for Meta** (names, categories, body text, variables, how to enable): [`GAMIFICATION_TEMPLATES.md`](./GAMIFICATION_TEMPLATES.md). `__tests__/whatsapp/gamificationTemplatesDoc.test.ts` checks it against `services/whatsapp/templateSpec.ts`.

## Bulk member-app invites

`POST /api/member-app/invite-all` queues a `member_app_invitation` row for each eligible member (has a phone, not `activated`). It uses the same throttled `whatsapp_send_queue`, so even 10 invites drain at up to 100 per 5 minutes.

- Enqueue stores only the member id and `{ phone, gymName, memberName, gymId }`.
- The invitation token is created just before sending, inside `drainSendQueue` (the `prepare` step, default `prepareMemberInvitation` in `lib/member-invitation-server.ts`). Tokens expire after 24 hours, and a large gym can wait in the queue longer than that.
- A permanent prepare failure (already activated, no phone, email conflict) marks the row `failed` without sending. A temporary one retries like any other failure.
- After a successful send the worker logs `invitation_resent` in `member_portal_activity`.

## Adding a new template

1. Add it to `services/whatsapp/templateSpec.ts` and to the union in `types/whatsapp.ts`. Names and parameters must match the Meta-approved template exactly.
2. Document it for Meta in `GAMIFICATION_TEMPLATES.md` (a test keeps this file in sync).
3. Keep it disabled until Meta approves it (`ENABLED_GAMIFICATION_TEMPLATES` in `config/whatsapp.ts`).
4. Run the tests (below).

## Test

```bash
npx vitest run __tests__/whatsapp/                      # whole module
npx vitest run __tests__/whatsapp/scheduling.test.ts    # one file
npm run verify:whatsapp                                 # env and setup check
```

To receive real webhooks on your machine, expose the dev server (`http://localhost:3004`) with a tunnel such as ngrok and set that URL in the Meta webhook settings. QStash cannot reach localhost, so call the drain route yourself with the `x-cron-secret` header.

## Gotchas

- **Webhook verification fails.** `WHATSAPP_VERIFY_TOKEN` must match Meta's value exactly. Check for extra spaces.
- **Invalid signature.** Check `WHATSAPP_APP_SECRET`. The raw body must be used, so no middleware may change it.
- **Messages not saving.** Check `SUPABASE_SERVICE_ROLE_KEY`, that the schema is applied, and the Supabase logs.
- **Duplicates.** Check that the Upstash Redis variables are set and Redis is reachable.
- **Nothing is sent for one gym.** Check `gyms.whatsapp_enabled`. Rows show `error`, not `cancelled`.
- **Sends are `deferred`.** The 250 / 24 h window is full. Check `whatsapp_recipient_window_usage()`.
- **Signup OTP is gone.** The WhatsApp OTP for signup phone verification was dropped (Meta rejected the code templates). Its code and template contract are in `_archived/phone-otp-verification/`.

## Monitoring queries

```sql
-- Messages received today
SELECT COUNT(*) FROM whatsapp_messages
WHERE created_at > CURRENT_DATE AND direction = 'inbound';

-- Average webhook processing time, last hour
SELECT AVG(processing_time_ms) FROM whatsapp_webhook_logs
WHERE created_at > NOW() - INTERVAL '1 hour';
```

For the full health check use `GET /api/health/deep` (needs the `x-health-secret` header).

## Owner signup phone list

Every number typed on the signup phone step is kept in `owner_phone_leads` (service role only, no foreign key, so it survives account deletion). Marketing may only target rows with `marketing_consent = true` and `unsubscribed_at is null`. The other rows are just remembered. WhatsApp marketing templates also need Meta MARKETING-category approval.

## Links

- [Meta WhatsApp docs](https://developers.facebook.com/docs/whatsapp)
- [`GAMIFICATION_TEMPLATES.md`](./GAMIFICATION_TEMPLATES.md)
