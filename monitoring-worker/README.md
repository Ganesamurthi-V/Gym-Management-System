# GymFlow monitoring worker

An independent watcher that runs on a **free Cloudflare cron trigger every 5 minutes**. It checks the public site and APIs, calls the app's watchdog endpoints and sends **Telegram** messages directly when something is wrong, even if the whole Vercel app is down. It also pings a Better Stack heartbeat after every complete run, so you get an email if the Worker itself stops.

Self-contained: nothing in the main app imports it. Edit URLs and thresholds in `src/config.ts`.

## What it checks

| Probe | URL | Expect | Class |
|-------|-----|--------|-------|
| www-site | https://www.gymflow.sbs/ | 200, body contains `GymFlow` | critical |
| www-sitemap | https://www.gymflow.sbs/sitemap.xml | 200 | warning |
| app-login-page | https://app.gymflow.sbs/auth/login | 200 | critical |
| api-health | https://app.gymflow.sbs/api/health | 200, body contains `"status":"healthy"` | critical |
| api-health-deep | /api/health/deep + `x-health-secret` | 200 (503 = unhealthy) | critical |
| api-watchdog | /api/health/watchdog + `x-health-secret` | 200 and JSON (the app sends its own alerts; the Worker only checks the call works) | critical |
| guard-members, guard-payments, guard-expiring | /api/members, /api/payments, /api/dashboard/expiring (no cookie) | exactly 401 (200 or 500 is a failure) | critical |
| graph-proxy | https://graph.gymflow.sbs/api/health | 200 | warning |
| status-page | https://status.gymflow.sbs | any 2xx or 3xx | warning |

Each probe has an 8 s timeout and at most 2 attempts (one retry after 2 s, only on a network error, timeout or 5xx).

## Alert rules

- **critical**: alert after 1 failing run. **warning**: alert after 2 consecutive failing runs (about 10 minutes).
- While still failing, a reminder is sent every 60 minutes.
- When the probe passes again you get a `[RECOVERED]` message.
- Messages look like `[CRITICAL] api-health` + reason + UTC time. A Telegram failure is logged (never with the token) and does not stop the run. A missed alert is repeated at the next 60-minute reminder.

## Free-tier math

- 288 runs per day (limit: 100,000 requests per day).
- Normal run: 12 outbound requests (11 probes + heartbeat). Worst case (every probe failing and retried = 22, canary 3, one batched Telegram summary 1, heartbeat 1) is 27.
- Hard budget `MAX_SUBREQUESTS = 45` (the free plan allows 50): the heartbeat and one Telegram summary are reserved up front, critical probes run first, retries stop once 30 are used, and more than 2 alerts in a run go out as ONE summary message. Any probe that does not fit is skipped, keeps its previous state (neither failed nor recovered) and the summary says "N probes skipped (subrequest budget)".
- KV: 1 read per run = 288 reads per day (free: 100,000). Writes only when something changes, plus an hourly "last run" stamp: about 24 per day plus alert changes (free: 1,000). With the canary on add at most 96 per day (login time stored every 15 minutes).
- CPU: almost all time is waiting on the network, which is not counted as CPU. `limits.cpu_ms` is deliberately not set: the free plan has a fixed 10 ms and does not accept custom limits.

## Setup (Windows, no coding needed)

Run every command in PowerShell inside the `monitoring-worker` folder. You need Node.js installed.

1. **Telegram bot**: in Telegram open `@BotFather`, send `/newbot`, follow the questions, copy the token (looks like `123456:ABC...`). Keep it secret.
2. **Chat id**: open your new bot and press Start, then send it any message. In a browser open `https://api.telegram.org/bot<TOKEN>/getUpdates` (replace `<TOKEN>`). Find `"chat":{"id":123456789` and copy the number. To alert a **group** instead: add the bot to the group, send a message in the group, run getUpdates again and use the group's id (it is negative, such as `-1001234567890`).
3. `npm install`
4. `npx wrangler login` (opens a browser; log in to Cloudflare).
5. `npx wrangler kv namespace create STATE`, then paste the printed `id` into `wrangler.jsonc` in place of `REPLACE_WITH_KV_NAMESPACE_ID`.
6. Set the secrets (each command asks you to paste the value):
   ```
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler secret put HEALTH_CHECK_SECRET
   npx wrangler secret put BETTERSTACK_HEARTBEAT_URL
   ```
   `HEALTH_CHECK_SECRET` must equal the value set on Vercel. `BETTERSTACK_HEARTBEAT_URL` is optional: in Better Stack create a heartbeat with period 10 minutes and grace 10 minutes and paste its URL. Never commit these values.
7. `npx wrangler deploy`
8. Test it: edit one probe URL in `src/config.ts` to a bad one (for example `https://www.gymflow.sbs/does-not-exist` for a `status: 200` probe), run `npx wrangler deploy`, wait one or two runs (5 to 10 minutes) and a Telegram message should arrive. Put the URL back and deploy again to get the `[RECOVERED]` message.
9. Logs: `npx wrangler tail`. You can also open `https://gymflow-monitoring.<your-subdomain>.workers.dev/health` (needs the workers.dev route enabled): it returns `ok` and the last run time (refreshed hourly) and nothing else; every other URL is 404.
10. **Disable**: remove the `triggers` block (or the whole Worker with `npx wrangler delete`) and deploy. Alerts stop and Better Stack will email that the heartbeat is missing, which is expected.

Run the tests any time with `npm test` and the type check with `npm run typecheck`.

## Optional authenticated canary

Off by default (`CANARY_ENABLED = false` in `src/config.ts`). When on, at most every 15 minutes it logs in as a dedicated owner account through `POST /api/auth/login` (with the `X-Requested-With` CSRF header, keeping the `sb-*` cookies itself), reads `GET /api/dashboard/expiring`, then calls `POST /api/auth/signout` with `{"scope":"local"}`. Alert names are `canary:login`, `canary:read` (critical) and `canary:logout` (warning), with the same de-duplication. One login every 15 minutes is far below the app's limits (10 per minute per IP, 5 per 5 minutes per email). Cookies, passwords and tokens are never logged; failure reasons are only status codes.

Secrets: `npx wrangler secret put CANARY_EMAIL` and `CANARY_PASSWORD`.

### Canary gym safety setup

The current journey only reads. The write steps (check-in then undo) are a marked extension point in `src/canary.ts` and must stay off until you have:

1. A separate owner account and a **separate gym** used only by the canary, with a couple of test members that are not real people.
2. WhatsApp switched off for that gym (`gyms.whatsapp_enabled = false` in the admin app, Manage Subscription), so a test action can never message anyone.
3. An active subscription for that gym (otherwise the paywall answers instead of the data).
4. A password used nowhere else.

Never point the canary at a real gym.

## Troubleshooting

- **No Telegram message**: run `npx wrangler tail` and look for `telegram:` lines. Check the token and chat id secrets, and that you pressed Start on the bot (or added it to the group).
- **`api-health-deep` or `api-watchdog` failing with "HEALTH_CHECK_SECRET not set"**: set the secret (step 6). A 401 means it differs from Vercel's value; 503 `unconfigured` means Vercel has none.
- **Guard probe says status 200 or 500**: the guard is open or broken, which is a real problem. 404 usually means the route was renamed; edit `src/config.ts`.
- **No heartbeat in Better Stack**: the URL secret is missing or wrong; look for `heartbeat: failed` in the logs.
- **Warning probes alert late**: that is by design (2 failing runs).
- **Duplicate or stuck alerts**: state lives in KV key `state`; delete it with `npx wrangler kv key delete state --binding STATE` to reset.
- **Telegram was down during an outage**: a probe is only marked alerted after Telegram accepted the message (or the summary that included it). If the send fails the alert is retried on the next run (5 minutes later), and a failed `[RECOVERED]` message is also retried. Look for `telegram:` lines in `npx wrangler tail`.
- **One message saying "State storage (KV) is unavailable"**: the Worker could not read its saved state, so it cannot tell new failures from old ones. It sends at most one summary per run, sends no reminders and does not write state, so a good saved state is never overwritten. Check the KV namespace id in `wrangler.jsonc` and Cloudflare status; alerts may repeat until KV works again.
