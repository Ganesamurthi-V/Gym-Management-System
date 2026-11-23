# Member web push

This module sends push notifications to the member PWA (`/m/*`) when the app is closed. It is separate from the owner-side FCM push in `gymflow-admin`.

## How it works

```
Member allows notifications
  -> POST /api/member/push/subscribe   (stores the browser subscription)
Something happens (trigger or daily job)
  -> publishPushJob(job)               (publish.ts)
  -> QStash
  -> POST /api/push/send               (sends in batches)
  -> web-push -> member's phone
```

1. **Subscribe.** The client posts the browser subscription to `POST /api/member/push/subscribe` (`DELETE` removes it). The route validates it (`validate.ts`: https only, host allowlist). It then calls the SQL functions `register_push_subscription` / `unregister_push_subscription`. These functions find the member from `auth.uid()` and enforce the member-app plan gate.
2. **Publish.** A trigger calls `publishPushJob(job)` (`publish.ts`). It posts the job to QStash with the deduplication id `push-{kind}-{ref}-{gymId}` (plus `-{cursor}` for later pages). QStash then calls `POST /api/push/send`.
   - Without `QSTASH_TOKEN` (local dev) it sends inline in the background.
   - It never throws, and does nothing when push is not configured.
3. **Send.** `/api/push/send` accepts a QStash signature or the `x-cron-secret` header. It runs `sendPushToMembers` (`send.ts`), which:
   - reads subscriptions with the service-role client, scoped by `job.gymId`;
   - builds the payload (`payload.ts`);
   - skips repeats per member with a Redis key `push:{kind}:{ref}:{memberId}` (48 h);
   - sends with `web-push`;
   - stops after a 40 s budget and returns `nextCursor`. The route then re-publishes the job with that cursor.

The table `member_push_subscriptions` has RLS on, no policies and no grants. Only the two SQL functions and the service-role sender can touch it, so keys are never readable from a browser.

## Setup

Generate the keys once:

```bash
npx web-push generate-vapid-keys
```

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public VAPID key. Inlined into the browser bundle at build time. |
| `VAPID_PRIVATE_KEY` | Private VAPID key. Server only. |
| `VAPID_SUBJECT` | `mailto:` or https URL. |
| `QSTASH_TOKEN`, `QSTASH_URL` | Used to publish jobs. |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Used to verify QStash calls. |
| `CRON_SECRET` | Accepted as the `x-cron-secret` header. |
| `NEXT_PUBLIC_APP_URL` | Base URL QStash calls back. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Dedupe and the anti-spam cap. |
| `PUSH_EVENING_ENABLED` | Set to `true` to turn on the evening streak nudge. Off by default. |

The first three are all required. If any is missing, `isPushConfigured()` is false and everything is a no-op.

Production runs on AWS with SST (`infra/sst.config.ts`). The public values and `PUSH_EVENING_ENABLED` are read from the deploy shell. Secrets live in SST secrets.

## Anti-spam

- Essential kinds (`notice`, `payment_decision`) always go out.
- All other kinds share a limit of 1 per day and 4 per week per member, by priority. They only go out between 07:00 and 21:00 IST.
- Before publishing, call `pickPushesForDay(candidates, history, now)` with `readPushHistory`.
- `sendPushToMembers` calls `recordPush` after a successful non-essential send.

## Scheduled pushes

**Daily** (`daily.ts` `runDailyPushStep`, rules in `rules.ts`)

- It is the last step of `runDailyWhatsAppAutomation()`, so it runs with the 09:00 IST WhatsApp cron. It only runs when `isPushConfigured()`.
- Failures are logged and never affect the WhatsApp run.
- For each gym that has subscribers it builds these kinds:
  - `expiring`: 3 and 1 day before the latest `end_date`.
  - `weigh_in` and `measurements`.
  - `goal`: 7 days before the target date, or when the target weight is reached.
  - `miss_you`: last attendance 3 or more days ago, once per 5-day bucket. Attendance is read 45 days back. A member who never attended is skipped.
  - `weekly_quote`: on Mondays IST.
- Members who opened the app today (`members.last_portal_login`) are skipped.
- Then `pickPushesForDay` applies the cap. It publishes one job per (kind, ref, body), with at most 100 members each (`ID_CHUNK` in `daily.ts`).
- If `readPushHistory` returns null (no Redis), nothing is sent.

**Evening streak nudge** (`POST /api/cron/push-evening`)

- Off unless `PUSH_EVENING_ENABLED=true`. It only runs between 17:00 and 20:30 IST.
- It uses the SQL function `members_streak_at_risk(gym_id)` (service role only). Run the migration `supabase/migrations/20261030140000_streak_at_risk.sql` in the Supabase SQL editor first.
- It mirrors the streak rules of `get_member_gamification()` and `lib/gamification/streak.ts`. Change them together.
- The QStash schedule is created by `infra/set-qstash-schedules.sh` (not by app code). It is `30 13 * * *` UTC, which is 19:00 IST, with the `x-cron-secret` header. The route also accepts a valid `upstash-signature`.

## Adding an event kind

1. Add the kind to `PushKind`, `PUSH_PRIORITY` and `PUSH_TTL_SECONDS` in `types/push.ts`. Add it to `ESSENTIAL_PUSH_KINDS` only if it must bypass the cap.
2. Add the kind to the enum in `app/api/push/send/route.ts`.
3. Add copy to `PUSH_COPY` in `payload.ts`. Keep it short and positive, with no emojis, amounts or weights (lock screens are public).
4. At the trigger, call `publishPushJob({ gymId, kind, ref, memberIds?, body, url })`. Use a `ref` that stays the same for the event, because it is the dedupe key. The `url` must start with `/m/`.
5. Add a test in `__tests__/push/`.

## Test

```bash
npx vitest run __tests__/push/
```

## Gotchas

- **Failed sends.**
  - A 404 or 410 from the push service deletes the subscription row.
  - Other errors add 1 to `failure_count`. The row is deleted at `PUSH_LIMITS.failuresBeforeDelete` (5). A success resets the count and sets `last_success_at`.
  - If nothing reached any device because of temporary errors, the dedupe key is released so a retry can send.
- **SSRF defence.** The endpoint is re-checked with `isAllowedPushEndpoint` before every send. A stored endpoint that fails is deleted.
- **Redis down.** The dedupe fails open (the notification `tag` replaces a duplicate on the phone). `readPushHistory` returns `null`, and callers must then skip non-essential kinds.
- **Plan gate.** Only members the plan allows get pushes: the gym is writable, the plan includes the member app, and on a trial only the first `PLAN_MEMBER_LIMIT` members (same rule as `member_app_allowed()`).
- **Do not add a new cron for push.** New scheduled work belongs in the daily step above.
