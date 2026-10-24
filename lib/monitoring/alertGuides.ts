/**
 * Plain-English guide for every alert key the system can raise. Pure data + a pure lookup (no server-only
 * imports) so it can be used from anywhere and unit-tested. Adding a new alert key to the code without a
 * guide here fails __tests__/monitoring/alertGuides.test.ts.
 *
 * Only real settings are named: env vars from .env.example / config/whatsapp.ts, tables from supabase-schema.sql.
 */

export interface AlertGuide {
  happening: string
  failing: string
  check: string[]
  fix: string[]
  links?: { label: string; url: string }[]
}

const VERCEL = { label: 'Vercel dashboard', url: 'https://vercel.com/dashboard' }
const SUPABASE = { label: 'Supabase dashboard', url: 'https://supabase.com/dashboard' }
const UPSTASH = { label: 'Upstash console', url: 'https://console.upstash.com' }
const META = { label: 'Meta Business Suite', url: 'https://business.facebook.com' }
const HEALTH = { label: 'Health endpoint (needs the secret header)', url: 'https://app.gymflow.sbs/api/health/deep' }

const LOGS = 'Vercel > Project > Logs: filter by the route named in Details.'

export const GENERIC_GUIDE: AlertGuide = {
  happening: 'GymFlow raised an alert that has no specific guide yet.',
  failing: 'Unknown. Read the details below to see which part of the app reported it.',
  check: [
    'Vercel > Project > Logs: search for the alert key shown at the bottom.',
    'Sentry: look for a matching error in the last hour.',
    'Open /api/health/deep with the x-health-secret header to see which dependency is red.',
  ],
  fix: [
    'If the health check shows a red dependency, follow that dependency (Supabase, Redis, WhatsApp).',
    'If everything is green and it does not repeat, note it and keep watching.',
  ],
  links: [VERCEL, HEALTH],
}

const route5xx: AlertGuide = {
  happening: 'A page or API route on the live app answered with a server error (5xx).',
  failing: 'The feature behind that route fails for whoever called it. Other features may still work.',
  check: [
    LOGS,
    'Open Sentry and find the newest error for the same route.',
    'Supabase > Project status: confirm the database is up.',
    'Did a deploy go out in the last hour? Vercel > Deployments.',
  ],
  fix: [
    'If a deploy caused it, Vercel > Deployments > previous good one > Promote to Production.',
    'If Supabase is down or slow, wait for it and retry the action.',
    'If it is a code bug, copy the error from Sentry and fix it, then redeploy.',
  ],
  links: [VERCEL, SUPABASE],
}

const cronRerun = (path: string): string =>
  `Re-run it by hand: POST https://app.gymflow.sbs${path} with header x-cron-secret set to your CRON_SECRET.`

const activation = (step: string): AlertGuide => ({
  happening: `A member hit an error while activating their account (${step} step).`,
  failing: 'That member cannot finish activation from their WhatsApp link, so they cannot use the member app yet.',
  check: [
    'Vercel > Project > Logs: search the route for the member activation call.',
    'Supabase > Authentication > Users: see whether the member account exists.',
    'Supabase > Table editor > members: check the member row for this gym.',
  ],
  fix: [
    'Ask the gym owner to resend the activation link to the member.',
    'If it keeps failing for everyone, check Supabase status and redeploy the last good build.',
  ],
  links: [VERCEL, SUPABASE],
})

const authGuide = (what: string, impact: string): AlertGuide => ({
  happening: `The ${what} route failed unexpectedly.`,
  failing: impact,
  check: [
    'Supabase > Project status and Authentication > Logs: any outage or rate limit?',
    LOGS,
    'Try the same action yourself on https://app.gymflow.sbs.',
  ],
  fix: [
    'If Supabase Auth is degraded, wait for it to recover, then retry.',
    'If only this route fails, read the Sentry error and fix or roll back the last deploy.',
  ],
  links: [SUPABASE, VERCEL],
})

const watchdogRerun = 'Run the watchdog again and confirm the alert clears: GET /api/health/watchdog with the x-health-secret header.'

/** Exact-key guides. */
const EXACT: Record<string, AlertGuide> = {
  // ── WhatsApp queue and QStash ──────────────────────────────────────────────
  'wa:enqueue_failed': {
    happening: 'WhatsApp messages could not be put into the send queue.',
    failing: 'Those reminders and welcome messages are not scheduled, so members will not receive them.',
    check: [
      'Supabase > Project status: is the database up?',
      'Supabase > Table editor > whatsapp_send_queue: are new rows still appearing?',
      LOGS,
    ],
    fix: [
      'If Supabase was down, wait for it and the next daily run re-queues reminders.',
      'If the table rejects inserts, read the error in Logs and fix the cause (policy or column).',
    ],
    links: [SUPABASE, VERCEL],
  },
  'wa:qstash_quota': {
    happening: 'The free QStash daily message quota is used up.',
    failing: 'The queue drain cannot be kicked, so scheduled WhatsApp messages wait until the quota resets.',
    check: [
      'QStash console > Usage: confirm the daily limit is reached.',
      'Supabase > whatsapp_send_queue: count rows with status pending.',
    ],
    fix: [
      'Wait for the daily reset; the queue drains afterwards and nothing is lost.',
      'If this keeps happening, upgrade the QStash plan.',
    ],
    links: [{ label: 'QStash console', url: 'https://console.upstash.com/qstash' }],
  },
  'wa:qstash_auth': {
    happening: 'QStash rejected our credentials or URL.',
    failing: 'The WhatsApp queue cannot be drained, so scheduled messages pile up.',
    check: [
      'Vercel > Settings > Environment Variables: check QSTASH_TOKEN and QSTASH_URL.',
      'QStash console: compare the token and region URL with Vercel.',
    ],
    fix: [
      'Copy the current token and URL from the QStash console into Vercel.',
      'Redeploy so the new values are used.',
    ],
    links: [VERCEL, { label: 'QStash console', url: 'https://console.upstash.com/qstash' }],
  },
  'wa:qstash_publish': {
    happening: 'Publishing the "drain the queue" request to QStash failed or QStash is not configured.',
    failing: 'Queued WhatsApp messages are not sent on time until the next successful kick.',
    check: [
      'QStash console > Logs: look for failed publishes.',
      'Vercel > Settings > Environment Variables: QSTASH_TOKEN and QSTASH_URL are set.',
      'Check the QStash status page for an outage.',
    ],
    fix: [
      'Set or correct QSTASH_TOKEN and QSTASH_URL in Vercel and redeploy.',
      'If QStash is down, wait; trigger the drain by hand with the x-cron-secret header if urgent.',
    ],
    links: [VERCEL],
  },
  'wa:qstash_budget': {
    happening: 'Today\'s QStash publishes passed 800 of the 1000 free limit.',
    failing: 'Nothing yet. If it reaches 1000 the queue stops draining until the next UTC day.',
    check: [
      'QStash console > Usage: see today\'s count.',
      'Supabase > whatsapp_send_queue: is there an unusually large backlog today?',
    ],
    fix: [
      'Usually wait for UTC midnight (5:30 AM IST).',
      'If it recurs daily, upgrade the QStash plan.',
    ],
    links: [{ label: 'QStash console', url: 'https://console.upstash.com/qstash' }],
  },
  'qstash:budget': {
    happening: 'Today\'s QStash publishes are 800 or more (free limit 1000).',
    failing: 'Nothing yet. At 1000 the WhatsApp queue stops draining until the next UTC day.',
    check: [
      'QStash console > Usage: see today\'s count.',
      'Supabase > whatsapp_send_queue: look for a big backlog.',
    ],
    fix: ['Wait for UTC midnight (5:30 AM IST), or upgrade the QStash plan if this is daily.'],
    links: [{ label: 'QStash console', url: 'https://console.upstash.com/qstash' }],
  },
  'wa:drain_not_rescheduled': {
    happening: 'The queue drain finished but did not schedule its next run.',
    failing: 'Remaining queued WhatsApp messages stop until something kicks the drain again.',
    check: [
      'QStash console > Logs: was the follow-up publish rejected?',
      'Supabase > whatsapp_send_queue: rows still pending?',
    ],
    fix: [
      'Trigger the drain by hand: POST https://app.gymflow.sbs/api/whatsapp/queue/drain with header x-cron-secret.',
      'Fix the QStash error shown in its logs (see wa:qstash_publish).',
    ],
    links: [VERCEL],
  },
  'wa:queue_persist': {
    happening: 'After sending, the app could not save the queue row\'s new state.',
    failing: 'Risk of the same message being sent twice, or stuck in "sending".',
    check: [
      'Supabase > Project status: database healthy?',
      'Supabase > whatsapp_send_queue: rows stuck in sending?',
      LOGS,
    ],
    fix: [
      'Once Supabase is healthy, stuck rows are retried by the next drain.',
      'If members got duplicates, tell the gym owner and no action is needed on data.',
    ],
    links: [SUPABASE],
  },
  'wa:send_failed': {
    happening: 'One or more WhatsApp messages failed permanently after all retries.',
    failing: 'Those members did not get their message.',
    check: [
      'Supabase > whatsapp_send_queue: filter status = failed, read the last_error column.',
      'Meta Business Suite > WhatsApp Manager: template status and quality rating.',
    ],
    fix: [
      'Token errors: renew WHATSAPP_ACCESS_TOKEN in Vercel.',
      'Template errors: fix or re-approve the template in Meta.',
      'Bad phone numbers: nothing to fix, the member is not on WhatsApp.',
    ],
    links: [META, SUPABASE],
  },
  'wa:drain_unauthorized': {
    happening: 'The queue drain URL was called with a wrong or missing signature.',
    failing: 'Nothing is lost. Genuine QStash calls may be rejected if the keys are wrong.',
    check: [
      'Vercel > Settings > Environment Variables: QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.',
      'QStash console: compare the signing keys.',
      'If the queue still drains, this is probably a random probe.',
    ],
    fix: [
      'Copy the current and next signing keys from QStash into Vercel and redeploy.',
      'If the queue drains fine, ignore it.',
    ],
    links: [VERCEL],
  },
  'wa:drain_error': {
    happening: 'The WhatsApp queue drain route crashed.',
    failing: 'Queued messages are not being sent until the drain runs cleanly.',
    check: [
      'Vercel > Logs: filter /api/whatsapp/queue/drain.',
      'Sentry: newest error for that route.',
      'Supabase > Project status.',
    ],
    fix: [
      'Fix the cause shown in the error (often Supabase or a token problem).',
      'Trigger the drain by hand with header x-cron-secret to confirm it works.',
    ],
    links: [VERCEL, SUPABASE],
  },
  'wa:daily_gym_error': {
    happening: 'The 9 AM IST WhatsApp automation failed for one or more gyms.',
    failing: 'Reminders for those gyms were not sent today. Other gyms are unaffected.',
    check: [
      'Read Details: it names the gym.',
      LOGS,
      'Supabase > gyms: is whatsapp_enabled on and the gym active?',
    ],
    fix: [
      'Fix the error in Logs for that gym.',
      cronRerun('/api/cron/whatsapp'),
    ],
    links: [VERCEL],
  },
  'wa:recipient_reserve_failed': {
    happening: 'The check that enforces Meta\'s 250 unique recipients per 24 h is erroring.',
    failing: 'WhatsApp sends are deferred (not lost) while the check fails.',
    check: [
      'Supabase > SQL editor: select the function reserve_whatsapp_recipient and run it for a test.',
      'Supabase > Project status.',
    ],
    fix: [
      'Re-run the latest migrations if the function is missing.',
      'Once the function works, deferred sends go out automatically.',
    ],
    links: [SUPABASE],
  },
  'wa:recipient_window_high': {
    happening: 'Over 220 of Meta\'s 250 unique recipients for the rolling 24 h are used.',
    failing: 'Nothing is lost. New recipients will be deferred until room frees up.',
    check: [
      'Supabase > Table editor > whatsapp_recipient_window: count rows from the last 24 h.',
      'Did a gym just run a big import or campaign?',
    ],
    fix: [
      'Wait; room frees up as the 24 h window rolls.',
      'To lift the limit, raise the messaging limit in Meta Business Suite.',
    ],
    links: [META, SUPABASE],
  },
  'wa:webhook_bad_signature': {
    happening: 'WhatsApp webhook calls arrived with an invalid signature.',
    failing: 'Delivery receipts may be ignored. It may also be someone probing the URL.',
    check: [
      'Vercel > Settings > Environment Variables: WHATSAPP_APP_SECRET matches Meta > App settings > App secret.',
      'Are delivery statuses still being recorded?',
    ],
    fix: [
      'Correct WHATSAPP_APP_SECRET in Vercel and redeploy.',
      'If statuses keep arriving normally, ignore it.',
    ],
    links: [VERCEL, META],
  },
  'wa:webhook_schema_invalid': {
    happening: 'WhatsApp webhook payloads are arriving in a shape the app does not understand.',
    failing: 'Those events (delivery receipts, replies) are skipped.',
    check: [
      LOGS,
      'Meta app dashboard > Webhooks: did the API version or fields change?',
      'WHATSAPP_API_VERSION in Vercel Environment Variables.',
    ],
    fix: [
      'Align WHATSAPP_API_VERSION with the version configured in Meta.',
      'If Meta changed the payload, update the webhook parser and redeploy.',
    ],
    links: [META, VERCEL],
  },
  'wa:webhook_error': {
    happening: 'The WhatsApp webhook handler hit an error while processing an event.',
    failing: 'Some delivery receipts or replies may not be recorded.',
    check: [
      'Vercel > Logs: filter /api/whatsapp/webhook.',
      'Supabase > Table editor > whatsapp_webhook_logs: recent rows with processed = false.',
    ],
    fix: [
      'Fix the error shown in Logs and redeploy.',
      'Check Supabase status if it is a database error.',
    ],
    links: [VERCEL, SUPABASE],
  },
  'wa:token_invalid': {
    happening: 'Meta rejected our WhatsApp access token (invalid or expired).',
    failing: 'Every WhatsApp message fails: reminders, welcome messages and OTP codes.',
    check: [
      'Vercel > Project > Settings > Environment Variables > WHATSAPP_ACCESS_TOKEN: is it set and current?',
      'Meta Business Suite > Business settings > System users: is the token still valid?',
      'Supabase > whatsapp_send_queue: recent last_error mentions the token?',
    ],
    fix: [
      'Generate a new permanent token for the system user in Meta.',
      'Paste it into WHATSAPP_ACCESS_TOKEN in Vercel, then redeploy.',
      'Failed rows retry on the next queue drain.',
    ],
    links: [META, VERCEL],
  },
  'wa:token_expired': {
    happening: 'The watchdog sees token errors in recent WhatsApp sends (or the live Meta check fails).',
    failing: 'Every WhatsApp message fails until the token is replaced.',
    check: [
      'Vercel > Project > Settings > Environment Variables > WHATSAPP_ACCESS_TOKEN.',
      'Meta Business Suite > Business settings > System users: token status.',
      'Supabase > whatsapp_send_queue: last_error for recent failed rows.',
    ],
    fix: [
      'Generate a new permanent token in Meta and paste it into WHATSAPP_ACCESS_TOKEN.',
      'Redeploy, then confirm the alert clears on the next watchdog run (every 5 minutes).',
    ],
    links: [META, VERCEL],
  },
  'wa:meta_rate_limited': {
    happening: 'Meta is rate-limiting our WhatsApp sends.',
    failing: 'Some sends fail or slow down until the limit eases.',
    check: [
      'Supabase > whatsapp_recipient_window: how many recipients in the last 24 h?',
      'Meta > WhatsApp Manager: messaging limit and quality rating.',
    ],
    fix: [
      'Wait; the queue retries automatically.',
      'Avoid large sends at once; raise the messaging limit in Meta if you are at the cap.',
    ],
    links: [META],
  },
  'wa:delivery_failed': {
    happening: 'Meta reported that a WhatsApp message could not be delivered.',
    failing: 'That member did not get the message. This is one message, not an outage.',
    check: [
      'Read the error code in Details.',
      'Supabase > whatsapp_send_queue: find the row and read last_error.',
      'Meta > WhatsApp Manager: is the template approved?',
    ],
    fix: [
      'Template or policy errors: fix the template in Meta.',
      'Number not on WhatsApp: no action.',
    ],
    links: [META, SUPABASE],
  },
  'wa:delivery_failure_rate': {
    happening: 'Many WhatsApp deliveries failed within this hour.',
    failing: 'A large share of members are not receiving messages.',
    check: [
      'Meta > WhatsApp Manager: template status and quality rating.',
      'Supabase > whatsapp_send_queue: group recent failed rows by last_error.',
    ],
    fix: [
      'Fix the dominant error (token, template, quality block).',
      'Pause sends for the affected template if Meta flags quality.',
    ],
    links: [META, SUPABASE],
  },
  'wa:queue_backlog': {
    happening: 'Messages in the send queue are more than 30 minutes late.',
    failing: 'Members get their WhatsApp messages late, or not at all.',
    check: [
      'QStash console > Logs: is the drain being called every 5 minutes?',
      'Vercel > Logs: filter /api/whatsapp/queue/drain.',
      'Supabase > whatsapp_send_queue: oldest pending scheduled_at.',
    ],
    fix: [
      'Trigger the drain by hand: POST /api/whatsapp/queue/drain with header x-cron-secret.',
      'Fix the QStash or token problem found in the logs.',
    ],
    links: [VERCEL, SUPABASE],
  },
  'wa:queue_stuck_sending': {
    happening: 'A queue row has been "sending" for over 15 minutes.',
    failing: 'That message may never go out, and it blocks retry of itself.',
    check: [
      'Supabase > whatsapp_send_queue: filter status = sending, look at locked_at.',
      'Vercel > Logs: any crash in the drain route?',
    ],
    fix: [
      'Run the drain by hand with x-cron-secret; it releases expired locks.',
      'If it persists, fix the crash shown in Logs.',
    ],
    links: [VERCEL, SUPABASE],
  },
  'wa:queue_failed_high': {
    happening: '10 or more WhatsApp queue rows failed in the last 24 hours.',
    failing: 'A pattern of failures (token, template, or numbers) is losing messages.',
    check: [
      'Supabase > whatsapp_send_queue: filter status failed or delivery_failed; read last_error.',
      'Meta > WhatsApp Manager: template approval and quality.',
    ],
    fix: [
      'Fix the common error: renew WHATSAPP_ACCESS_TOKEN, or repair the template.',
      'Bad-number failures alone need no action.',
    ],
    links: [META, SUPABASE],
  },
  'wa:webhook_unprocessed': {
    happening: '5 or more WhatsApp webhook events in the last hour were stored but not processed.',
    failing: 'Delivery receipts and replies are not being applied.',
    check: [
      'Supabase > whatsapp_webhook_logs: rows with processed = false.',
      'Vercel > Logs: filter /api/whatsapp/webhook for errors.',
    ],
    fix: [
      'Fix the processing error shown in Logs and redeploy.',
      'After the fix, new events process normally.',
    ],
    links: [VERCEL, SUPABASE],
  },

  // ── Crons, subscriptions ───────────────────────────────────────────────────
  'cron:secret_missing': {
    happening: 'CRON_SECRET is not set in production.',
    failing: 'The daily WhatsApp and subscription crons refuse to run, so reminders and expiries stop.',
    check: ['Vercel > Project > Settings > Environment Variables > CRON_SECRET (Production).'],
    fix: [
      'Add CRON_SECRET (a long random string) for Production.',
      'Redeploy, then use the same value in the Worker or QStash headers.',
    ],
    links: [VERCEL],
  },
  'cron:whatsapp:failed': {
    happening: 'The daily 9 AM IST WhatsApp cron failed.',
    failing: 'Today\'s renewal and gamification reminders were not queued.',
    check: [LOGS, 'Supabase > Project status.'],
    fix: [cronRerun('/api/cron/whatsapp'), 'Fix the error shown in Logs first, otherwise the re-run fails again.'],
    links: [VERCEL, SUPABASE],
  },
  'cron:subscription:failed': {
    happening: 'The daily subscription cron failed.',
    failing: 'Expired trials and plans may not be locked, and reminders may be missing.',
    check: [LOGS, 'Supabase > Project status.'],
    fix: [cronRerun('/api/cron/subscription'), 'Fix the error shown in Logs first.'],
    links: [VERCEL, SUPABASE],
  },
  'cron:whatsapp:stale': {
    happening: 'The daily WhatsApp cron has not succeeded for over 26 hours.',
    failing: 'No daily reminders have been queued since then.',
    check: [
      'Vercel > Project > Settings > Cron Jobs: is /api/cron/whatsapp listed?',
      'Vercel > Logs: filter /api/cron/whatsapp.',
      'Vercel > Environment Variables: CRON_SECRET set.',
    ],
    fix: [cronRerun('/api/cron/whatsapp'), 'Fix what the logs show, then confirm the next scheduled run succeeds.'],
    links: [VERCEL],
  },
  'cron:subscription:stale': {
    happening: 'The daily subscription cron has not succeeded for over 26 hours.',
    failing: 'Gym trials and plans are not being expired on time.',
    check: [
      'Vercel > Project > Settings > Cron Jobs: is /api/cron/subscription listed?',
      'Vercel > Logs: filter /api/cron/subscription.',
      'Vercel > Environment Variables: CRON_SECRET set.',
    ],
    fix: [cronRerun('/api/cron/subscription'), 'Fix what the logs show, then confirm the next scheduled run succeeds.'],
    links: [VERCEL],
  },
  'sub:cron_missed': {
    happening: 'Some gyms are more than a day past their end date but still not marked expired.',
    failing: 'Gyms keep access they should have lost.',
    check: [
      'Supabase > Table editor > gyms: trial or active gyms with an end date in the past.',
      'Did the subscription cron run? Vercel > Logs: /api/cron/subscription.',
    ],
    fix: [cronRerun('/api/cron/subscription'), 'Fix the cron error if it fails.'],
    links: [SUPABASE, VERCEL],
  },
  'sub:requests_waiting': {
    happening: 'A payment request from a gym has been waiting for approval over 24 hours.',
    failing: 'That gym is paying but not yet extended; they may be locked out.',
    check: [
      'Admin app > Subscriptions: open pending requests.',
      'Supabase > subscription_requests: status pending.',
    ],
    fix: ['Verify the UPI payment proof, then approve or reject in the admin app.'],
    links: [SUPABASE],
  },
  'sub:proof_upload_failed': {
    happening: 'A gym\'s payment proof image failed to upload.',
    failing: 'The gym cannot submit its renewal request.',
    check: [
      'Supabase > Storage > payment-proofs: bucket exists and policies allow the upload.',
      'Supabase > Project status.',
    ],
    fix: [
      'Fix the bucket or policy; ask the gym owner to retry.',
      'Meanwhile take the proof on WhatsApp and approve manually.',
    ],
    links: [SUPABASE],
  },
  'sub:request_insert_failed': {
    happening: 'Saving a gym\'s subscription request failed after the proof uploaded.',
    failing: 'The gym\'s renewal request is not recorded.',
    check: ['Supabase > Project status.', 'Supabase > subscription_requests: can you insert a row?', LOGS],
    fix: ['Ask the gym owner to submit again.', 'Fix the database error shown in Logs.'],
    links: [SUPABASE, VERCEL],
  },

  // ── Other app areas ────────────────────────────────────────────────────────
  'import:confirm_failed': {
    happening: 'A bulk member import (Excel or CSV) failed at the final save step.',
    failing: 'The gym\'s members were not imported.',
    check: ['Read Details for the failing step.', LOGS, 'Supabase > members: were any rows partly saved?'],
    fix: ['Ask the owner to upload the file again.', 'If it repeats, fix the error shown in Logs.'],
    links: [VERCEL, SUPABASE],
  },
  'reports:rpc_failed': {
    happening: 'The owner Reports page could not load its data.',
    failing: 'That gym owner sees an empty Reports page.',
    check: [
      'Read Details for the error code.',
      'Supabase > SQL editor: confirm the reports function exists (missing migration is common).',
      LOGS,
    ],
    fix: ['Run the latest migrations in the Supabase SQL editor.', 'Redeploy if the response shape changed.'],
    links: [SUPABASE, VERCEL],
  },
  'auth:login_error': authGuide('login', 'Owners or members may be unable to sign in.'),
  'auth:signup_error': authGuide('owner signup', 'New gym owners may be unable to register.'),
  'auth:finalize_error': authGuide(
    'registration finalise',
    'A new owner may have an account but no gym set up.',
  ),
  'auth:phone_save_error': authGuide('owner phone save', 'A new owner\'s mobile number is not saved.'),
  'auth:signup_index_error': {
    happening: 'Writing the owner signup helper index to Redis failed.',
    failing: 'Low impact: resending signup from another device falls back to a slower lookup.',
    check: ['Upstash console: is the database up?', 'Vercel > Environment Variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'],
    fix: ['If Redis is down, wait for it.', 'Correct the Upstash variables and redeploy if they are wrong.'],
    links: [UPSTASH, VERCEL],
  },
  'activate:activity_log_error': {
    happening: 'A member activated their account but the activity log entry was not saved.',
    failing: 'Low impact: the member can use the app; only the log line is missing.',
    check: [LOGS, 'Supabase > Project status.'],
    fix: ['Usually no action. Fix the cause if it repeats.'],
    links: [VERCEL, SUPABASE],
  },
  'activate:redeem_error': activation('redeem link'),
  'activate:complete_error': activation('complete'),
  'activate:finalize_error': activation('finalize'),

  // ── Infrastructure (watchdog) ──────────────────────────────────────────────
  'redis:down': {
    happening: 'Redis (Upstash) is configured but does not answer.',
    failing: 'Rate limiting and caching are degraded; some pages are slower, alert de-duplication falls back to memory.',
    check: ['Upstash console: database status.', 'Vercel > Environment Variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'],
    fix: ['If Upstash is down, wait for it.', 'If the token changed, update both variables in Vercel and redeploy.'],
    links: [UPSTASH, VERCEL],
  },
  'db:slow': {
    happening: 'A simple database query took over 2 seconds.',
    failing: 'Pages and kiosks feel slow for everyone.',
    check: ['Supabase > Reports: CPU, memory and connections.', 'Supabase > Database > Query performance: slow queries.'],
    fix: ['Cancel runaway queries or add the missing index.', 'Upgrade the Supabase compute size if load is genuinely high.'],
    links: [SUPABASE],
  },
}

/** Prefix guides, tried after exact keys. First match wins. */
const PREFIX: [string, AlertGuide][] = [
  ['5xx:', route5xx],
  ['activate:', activation('unknown')],
  ['auth:', authGuide('auth', 'Sign-in or registration may be failing for some users.')],
  [
    'watchdog:check_error:',
    {
      happening: 'One of the automatic health checks itself failed or timed out.',
      failing: 'That check is blind right now, so a real problem might go unnoticed.',
      check: ['Vercel > Logs: filter /api/health/watchdog.', 'Supabase > Project status.', 'Upstash console: status.'],
      fix: ['Fix the error shown in Logs.', watchdogRerun],
      links: [VERCEL],
    },
  ],
  [
    'drill:',
    {
      happening: 'This is a TEST alert from a drill. Nothing is actually wrong.',
      failing: 'Nothing. It only proves that Telegram and the admin app notifications work.',
      check: ['Confirm this message also appears in the admin app notifications.'],
      fix: ['No action needed. Delete the notification if you wish.'],
    },
  ],
]

/** Resolve by exact key, then prefix, then `cron:<name>:stale`-style pattern, else the generic guide. */
export function getAlertGuide(key: string): AlertGuide {
  const exact = EXACT[key]
  if (exact) return exact
  for (const [prefix, guide] of PREFIX) if (key.startsWith(prefix)) return guide
  if (/^cron:[a-z_]+:stale$/.test(key)) return EXACT['cron:whatsapp:stale']
  if (/^cron:[a-z_]+:failed$/.test(key)) return EXACT['cron:whatsapp:failed']
  return GENERIC_GUIDE
}

export const ALERT_GUIDE_COUNT = Object.keys(EXACT).length + PREFIX.length
