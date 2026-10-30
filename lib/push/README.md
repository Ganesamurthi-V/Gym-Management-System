# Member Web Push

Pushes to the member PWA (`/m/*`) when the app is closed. Separate from the owner-side FCM in `gymflow-admin`.

## Flow

1. The member enables notifications; the client posts the browser subscription to
   `POST /api/member/push/subscribe` (`DELETE` removes it). The route validates it (`validate.ts`: https, host
   allowlist) and calls `register_push_subscription` / `unregister_push_subscription`. These SQL functions derive
   the member from `auth.uid()` and enforce the member-app plan gate.
2. A trigger calls `publishPushJob(job)` (`publish.ts`). It posts the job to QStash with deduplication id
   `push-{kind}-{ref}-{gymId}`; QStash calls `POST /api/push/send`. Without `QSTASH_TOKEN` (local dev) it sends
   inline in the background. It never throws and does nothing when push is not configured.
3. `/api/push/send` (QStash signature or `x-cron-secret`) runs `sendPushToMembers` (`send.ts`), which reads
   subscriptions with the service-role client scoped by `job.gymId`, builds the payload (`payload.ts`), dedupes per
   member with Redis `push:{kind}:{ref}:{memberId}` (48 h), sends with `web-push` and stops at a 40 s budget,
   returning `nextCursor`; the route re-publishes the job with that cursor.

`member_push_subscriptions` has RLS on with no policies and no grants: only the two functions and the service-role
sender touch it, so keys are never readable from a browser.

## Environment

`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or https). Generate with
`npx web-push generate-vapid-keys`. All three are required; otherwise `isPushConfigured()` is false and everything
is a no-op. Also `QSTASH_*`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, Upstash Redis. `PUSH_EVENING_ENABLED` gates the
evening streak nudge.

## Failure handling

- 404 / 410 from the push service: the subscription row is deleted.
- Other errors: `failure_count` is incremented; the row is deleted at `PUSH_LIMITS.failuresBeforeDelete`. A success
  resets it and sets `last_success_at`.
- The endpoint is re-checked with `isAllowedPushEndpoint` before every send (SSRF defence); a stored endpoint that
  fails is deleted.
- If nothing reached any device because of transient errors, the dedupe key is released so a retry can send.
- Redis down: dedupe fails open (the notification `tag` replaces a duplicate on the phone); `readPushHistory`
  returns `null`, and callers must then skip non-essential kinds.
- Only members the plan allows receive pushes: gym writable, plan includes the member app, and on a trial only the
  first `PLAN_MEMBER_LIMIT` members (same rule as `member_app_allowed()`).

## Anti-spam

Essential kinds (`notice`, `payment_decision`) always go. The rest share 1 per day and 4 per week per member, by
priority, between 07:00 and 21:00 IST: use `pickPushesForDay(candidates, history, now)` with `readPushHistory`
before publishing, and `sendPushToMembers` calls `recordPush` after a successful non-essential send.

## Adding an event kind

1. Add the kind to `PushKind`, `PUSH_PRIORITY`, `PUSH_TTL_SECONDS` in `types/push.ts` (and `ESSENTIAL_PUSH_KINDS`
   only if it must bypass the cap).
2. Add the kind to the enum in `app/api/push/send/route.ts`.
3. Add copy to `PUSH_COPY` in `payload.ts`: short, positive, no emojis, no amounts or weights (lock screens are public).
4. At the trigger, call `publishPushJob({ gymId, kind, ref, memberIds?, body, url })` with a `ref` that is stable for
   the event (it is the dedupe key), and a `url` starting with `/m/`.
5. Add a test in `__tests__/push/`.

## Scheduled pushes

- **Daily** (`daily.ts` `runDailyPushStep`, rules in `rules.ts`): a step at the end of `runDailyWhatsAppAutomation()`
  (09:00 IST cron), only when `isPushConfigured()`. Failures are logged and never affect the WhatsApp run. Per gym with
  subscribers it builds `expiring` (3 and 1 day before the latest `end_date`), `weigh_in`, `measurements`, `goal`
  (7 days before the target date, or target weight reached), `miss_you` (last attendance 3+ days ago, once per 5-day
  bucket; attendance is read 45 days back, never attended = skip) and `weekly_quote` (Mondays IST). Members who opened
  the app today (`members.last_portal_login`) are skipped. Then `pickPushesForDay` and one job per
  (kind, ref, body), at most 200 members each. If `readPushHistory` returns null (no Redis) nothing is sent.
- **Evening streak nudge** (`POST /api/cron/push-evening`): off unless `PUSH_EVENING_ENABLED=true`; runs only
  17:00-20:30 IST; uses the service-role-only SQL function `members_streak_at_risk(gym_id)` (migration
  `20261030140000_streak_at_risk.sql`, run it in the Supabase SQL editor first). It mirrors the streak rules of
  `get_member_gamification()` and `lib/gamification/streak.ts`; change them together.

### Creating the evening QStash schedule (not created by code)

In the Upstash console (QStash > Schedules) or via the API create:

- Destination: `{NEXT_PUBLIC_APP_URL}/api/cron/push-evening`, method `POST`
- Cron: `30 13 * * *` (UTC) = 19:00 IST
- Header `x-cron-secret: <CRON_SECRET>` (or rely on the QStash signature: the route verifies `upstash-signature`
  with `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`)

Then set `PUSH_EVENING_ENABLED=true` on Vercel.
