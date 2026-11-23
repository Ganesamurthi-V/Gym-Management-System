# AWS hosting (SST v4 + OpenNext)

## What this is

This folder deploys GymFlow to AWS. It uses [SST](https://sst.dev) with OpenNext:

- The root Next.js app runs behind CloudFront and AWS Lambda in `ap-south-1` (x86_64, 1024 MB, 60 s timeout).
- `gymflow-admin/` deploys as a second, separate SST app (see "Admin panel" below).
- Supabase, Upstash, QStash and Sentry are not part of this folder. They stay as they are.
- `vercel.json` is still in the repo for anyone who prefers to host on Vercel. Nothing in `infra/` changes it.

Files in this folder:

| File | Purpose |
|------|---------|
| `sst.config.ts` | Main app: secrets list, plain env list, domain, Lambda settings |
| `sst.admin.config.ts` | Admin panel app (name `gymflow-admin`) |
| `set-secrets.sh` | Copies main-app secrets from `../.env.local` into SST |
| `set-admin-secrets.sh` | Copies admin secrets from `../gymflow-admin/.env.local` into SST |
| `set-qstash-schedules.sh` | Creates the daily cron schedules in QStash |
| `../.github/workflows/aws-deploy.yml` | GitHub Actions deploy workflow |

## What you need

- An AWS account and a deploy identity. Best is a GitHub OIDC role (trust `repo:<org>/<repo>:*`). It needs permission
  for the resources SST creates (S3, Lambda, CloudFront, IAM, EventBridge, SQS, DynamoDB, CloudWatch, SSM).
  For deploys from your own computer, use an IAM user with `aws configure` or `AWS_PROFILE`.
- Node.js and `npm`.
- Your values for every secret and plain variable listed below.
- A QStash account (Upstash) for the daily crons.

## Set up the main app

1. Install: `cd infra && npm install`
2. Edit `sst.config.ts` for your own account. The production stage currently has the GymFlow domain
   (`app.thegymflow.in` plus aliases) and an ACM certificate ARN written in the `domain` block. Replace them with
   your own, or remove `domain` to get a plain CloudFront URL.
3. Set every secret in `SECRET_NAMES` (see the list below). There are two ways:
   - Put them all in `../.env.local`, then run `bash set-secrets.sh`. It prints `set: NAME` or `MISSING: NAME`.
   - Or set them one by one: `npx sst secret set NAME value --stage production`.
4. Optional features that you do not use still need a value (a single space or `unset`). The app treats a blank value
   as "off". This detail is carried over from the earlier README and not re-tested.
5. Export the plain values in your shell before you deploy (see "Plain variables"). Public values (`NEXT_PUBLIC_*`)
   are baked into the browser bundle at build time, so they cannot come from SST secrets. Example:
   `export NEXT_PUBLIC_APP_URL=https://app.thegymflow.in`
6. Deploy: `npx sst deploy --stage production`.
   To deploy from GitHub instead, see "GitHub Actions deploy".

### Secrets (`SECRET_NAMES` in `sst.config.ts`)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `GRAPH_PROXY_SECRET`, `QSTASH_TOKEN`,
`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `VAPID_PRIVATE_KEY`, `SENTRY_WEBHOOK_SECRET`,
`HEALTH_CHECK_SECRET`, `BETTERSTACK_HEARTBEAT_WHATSAPP`, `BETTERSTACK_HEARTBEAT_SUBSCRIPTION`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMS_INGEST_SECRET`,
`ADMS_INGEST_SECRET_PREVIOUS`, `ADMS_PUBLIC_HOST`, `ADMS_PUBLIC_PORT`.

The ADMS values are for biometric attendance. The host and port are secrets on purpose, so the device address never
lands in repo variables or the browser bundle. `set-secrets.sh` uses the same list.

### Plain variables (`PLAIN_ENV_NAMES` in `sst.config.ts`)

Read from the shell at deploy time. A variable you do not export is simply not passed to the app.

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
`NEXT_PUBLIC_SENTRY_DSN`, `TRIAL_DURATION_DAYS`, `RESEND_FROM`, `WHATSAPP_API_VERSION`, `WHATSAPP_BASE_URL`,
`GRAPH_API_BASE_URL`, `QSTASH_URL`, `VAPID_SUBJECT`, `PUSH_EVENING_ENABLED`, `ALERT_MAX_PER_HOUR`.

### Check it worked

1. The deploy prints a CloudFront URL. With a domain set, the `*.cloudfront.net` host answers 403 on purpose.
   To smoke-test before touching DNS, deploy a stage other than `production`: it has no domain, so you can open its
   CloudFront URL.
2. Check login, an owner page and a member check-in.
3. Call `/api/health/deep` with the header `x-health-secret: <HEALTH_CHECK_SECRET>`. It should return 200.

## GitHub Actions deploy

`.github/workflows/aws-deploy.yml` (name `aws-deploy`):

- Pull requests run the checks only (`npx tsc --noEmit` and `npm test`).
- A push to `main` runs the checks, then deploys. A small `changes` job decides what to deploy. Docs, markdown,
  `gymflow-mobile/` and `landing-page/` changes deploy nothing. `gymflow-admin/` changes deploy the admin app.
  Anything else deploys the main app. Changes to `infra/` or the workflow deploy both.
- You can also run it by hand (Actions, aws-deploy, Run workflow, on `main`) and pick the target, `app` or `admin`.
- Deploys never overlap. SST holds a state lock, so runs are queued, not cancelled.
- It logs in to AWS with the repo secret `AWS_DEPLOY_ROLE_ARN` (the OIDC role from "What you need").
- Public values come from GitHub repository **variables** with the same names as the plain variables above.
  Server-only values come from the SST secrets.

## Streaming and warm Lambdas

- `open-next.config.ts` (repo root) switches the server function to OpenNext's `aws-lambda-streaming` wrapper. The
  owner shell is sent before the page's data queries finish. With streaming, the first byte arrives well before the
  total time. Buffered, they are almost equal.
- To confirm streaming is on, look in the build log for `"streaming":true` in `.open-next/open-next.output.json`.
- `warm: 3` in `sst.config.ts` pings 3 server Lambdas every 5 minutes. This stays inside the Lambda free tier.
  There is no provisioned concurrency, because that is billed. A visitor after a long quiet spell can still hit a
  cold start.

## DNS and certificates

CloudFront only accepts ACM certificates from `us-east-1`, whatever the app region.

1. In ACM (`us-east-1`) request one certificate that covers every hostname you will use. The production config uses a
   wildcard certificate for `thegymflow.in` and `*.thegymflow.in`. The admin app uses the same certificate.
2. Validate it with the DNS records ACM shows.
3. Put the certificate ARN in the `cert` field of the `domain` block in `sst.config.ts` and set the hostnames.
   `dns: false` means DNS stays outside AWS, so SST does not create records.
4. Deploy, then add CNAME records that point each hostname to the CloudFront domain the deploy prints.
5. `middleware.ts` routes by host. `graph.<your-domain>` is the API-only WhatsApp Graph proxy. Include it in
   `aliases` if you use it.

The production stage serves `app.thegymflow.in` with the aliases `thegymflow.in`, `graph.thegymflow.in` and
`member.thegymflow.in`. Other stages get no domain.

## Daily crons (QStash)

The daily crons are QStash schedules that POST to the app with the `x-cron-secret` header. There is no EventBridge
cron.

1. Put `QSTASH_TOKEN`, `QSTASH_URL` and `CRON_SECRET` in `../.env.local` (or export them in the shell).
   `QSTASH_URL` is the regional endpoint. Blank means `https://qstash.upstash.io`.
2. From `infra/` run `bash set-qstash-schedules.sh`. To target another host, run it with
   `APP_URL=https://your-app-host`. The default is `https://app.thegymflow.in`.
3. The script prints `ok: <id> -> <url>` for each schedule. Re-running is safe: it updates by schedule id.

| Schedule id | Path | Time (UTC) | Time (IST) |
|-------------|------|-----------|------------|
| `gymflow-cron-whatsapp` | `/api/cron/whatsapp` | 03:30 | 09:00 |
| `gymflow-cron-subscription` | `/api/cron/subscription` | 00:00 | 05:30 |
| `gymflow-cron-push-evening` | `/api/cron/push-evening` | 13:30 | 19:00 |

- `/api/cron/push-evening` does nothing unless `PUSH_EVENING_ENABLED=true`.
- Retries are 0 on purpose. A failed run shows up as a missing Better Stack heartbeat.
- Run only one scheduler. If you also keep Vercel crons live, the daily WhatsApp automation runs twice.
  `vercel.json` currently has only an `ignoreCommand`, so it does not define crons.
- To remove the schedules, delete the three `gymflow-cron-*` schedules in the Upstash console.

## Admin panel (separate SST app)

`gymflow-admin/` deploys as its own SST app (`sst.admin.config.ts`, app name `gymflow-admin`). Main-app deploys never
depend on admin secrets or its certificate. Run every command from `infra/` with `--config sst.admin.config.ts`.

1. Certificate: request an ACM certificate for `admin.thegymflow.in` (or your admin host) in `us-east-1`.
   If the request fails with `CAA_ERROR`, Cloudflare may have added CAA records for a proxied host. Set the admin DNS
   record to DNS only, or add a CAA record that allows `amazon.com`, then request again. Validate with the CNAME
   ACM shows.
2. Create `gymflow-admin/.env.local` with the admin secrets. If your env is on Vercel, run `npx vercel env pull
   .env.local` inside `gymflow-admin/`.
3. In `infra/` run `bash set-admin-secrets.sh`. It prints only `set:` or `MISSING:`.
4. Export `ADMIN_CERT_ARN` (required: the config throws without it) and the variables in `PLAIN_ENV_NAMES` of
   `sst.admin.config.ts`. Empty values are skipped.
5. Preview, then deploy:
   ```
   npx sst diff --stage production --config sst.admin.config.ts
   npx sst deploy --stage production --config sst.admin.config.ts
   ```
   Or run the aws-deploy workflow with target `admin`. It reads repository variables.
6. Add a CNAME for the admin host to the CloudFront domain the deploy prints (DNS only). Lower the TTL first.

Admin secrets (`SECRET_NAMES` in `sst.admin.config.ts`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ADMIN_PANEL_SECRET`, `ADMIN_JWT_SECRET`, `SENTRY_AUTH_TOKEN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AI_API_KEY`, `FIREBASE_PRIVATE_KEY`,
`FIREBASE_CLIENT_EMAIL`, `CRON_SECRET`.

Admin plain variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_ADMIN_URL`, `ADMIN_SESSION_VERSION`, `SENTRY_ORG`,
`SENTRY_PROJECT`, `SUPPORT_EMAIL_ADDRESS`, `SUPPORT_EMAIL_FROM_NAME`, `SUPPORT_EMAIL_LOGO_URL`, `AI_BASE_URL`,
`AI_MODELS`, `AI_TPM_BUDGET`, `AI_TPD_BUDGET`, `AI_DAILY_LIMIT`, `LOG_LEVEL`, `FIREBASE_PROJECT_ID`.

Check after deploy:

- Admin login at `/auth` works.
- The Resend inbound webhook URL still delivers.
- The Postgres trigger that calls `/api/push/dispatch` reaches the new host.
- Rate limiting by client IP. `getClientIp` in `gymflow-admin/lib/rate-limit.ts` prefers `x-real-ip` (which Vercel
  sets and CloudFront does not), then falls back to the last `x-forwarded-for` hop. Confirm which header reaches the
  app on CloudFront, or all users may share one bucket.

## Manual console steps

- AWS Budget: Billing, Budgets, create a monthly cost budget of $5 with an email alert at 80% and 100%.
- Error alarm: not set up yet. Add a CloudWatch alarm on the server Lambda's `Errors` metric with an SNS
  notification.

## Troubleshooting

- **`MISSING: NAME` from a script**: the name is not in the env file. Add it and re-run.
- **403 on the `*.cloudfront.net` URL**: expected when a domain is set. Use the real hostname or a non-production stage.
- **`Locked` error from SST**: another deploy holds the state lock. Wait for it to finish. If a run was cancelled
  mid-deploy, run `npx sst unlock --stage production` (command not re-tested here).
- **Admin deploy fails with "ADMIN_CERT_ARN is not set"**: export it, see admin step 4.
- **Cron route answers 401**: `CRON_SECRET` in QStash differs from the app secret. Re-run the schedule script.
