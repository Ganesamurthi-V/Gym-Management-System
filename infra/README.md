# AWS hosting (SST v4 + OpenNext)

Runs the root Next app on CloudFront -> Lambda (ap-south-1, x86_64, 1024 MB, 60 s). Supabase, Upstash, QStash and
Sentry are unchanged. Vercel stays live as the rollback until cutover. `next.config.mjs` and `vercel.json` are untouched.

## One-time setup

1. Create an AWS account with a deploy identity. Preferred: a GitHub OIDC role (trust `repo:<org>/<repo>:*`) with
   permissions for CloudFormation-free SST/Pulumi resources (S3, Lambda, CloudFront, IAM, EventBridge, SQS, DynamoDB,
   CloudWatch, SSM). Put its ARN in the repo secret `AWS_DEPLOY_ROLE_ARN`. For local deploys use an IAM user and
   `aws configure` / `AWS_PROFILE`.
2. `cd infra && npm install`
3. Set every secret listed in `SECRET_NAMES` in `sst.config.ts`:
   `npx sst secret set NAME value --stage production`. Optional features you do not use still need a value
   (use a single space or `unset`); the app treats blank as off. `CRON_SECRET` must equal the one on Vercel until cutover.
4. NEXT_PUBLIC_* and other plain values are read from the shell at deploy time (they are inlined at build), so export
   them before deploying, for example `NEXT_PUBLIC_APP_URL=https://app.gymflow.sbs`.
5. `npx sst deploy --stage production` (or run the manual `deploy` job in the aws-deploy workflow).
   The first deploy prints the CloudFront URL; smoke-test it before touching DNS.

## Streaming and warm Lambdas

- `open-next.config.ts` (repo root) switches the server function to OpenNext's `aws-lambda-streaming` wrapper, so the owner
  shell is sent before the page's data queries finish. `warm: 3` in `sst.config.ts` pings 3 server Lambdas every 5 minutes.
  Both stay inside the Lambda free tier; there is no provisioned concurrency (it is billed).
- Try a change before production: run the `aws-deploy` workflow with stage `streamtest`. That stage has no custom domain, so
  it is served on its own `*.cloudfront.net` URL (printed at the end of the deploy). Set its secrets first:
  `npx sst secret set NAME value --stage streamtest`. Remove it afterwards with `npx sst remove --stage streamtest`.
- Check streaming on that URL: `curl -N -o /dev/null -w "ttfb=%{time_starttransfer} total=%{time_total}
" <url>/auth/login`.
  With streaming the first byte arrives well before the total; buffered, they are almost equal. Also look in the build log for
  `"streaming":true` in `.open-next/open-next.output.json`.
- The production stage owns `app.gymflow.sbs` and its aliases; with a domain set CloudFront answers 403 on the
  `*.cloudfront.net` host, which is intended.

## Manual console steps

- AWS Budget: Billing -> Budgets -> create a monthly cost budget of $5 with an email alert at 80% and 100%.
- Error alarm: deferred. Add a CloudWatch alarm on the server Lambda's Errors metric with an SNS notification later.

## DNS and certificates (app.gymflow.sbs, graph.gymflow.sbs)

CloudFront only accepts ACM certificates from us-east-1, whatever the app region.

1. In ACM (us-east-1) request one certificate for `app.gymflow.sbs` and `graph.gymflow.sbs`, validate it with the
   DNS records ACM shows.
2. Add `domain` to the `sst.aws.Nextjs` component (with `aliases: ['graph.gymflow.sbs']` and `dns: false` plus the
   `cert` ARN if DNS is not on Route 53) and redeploy.
3. Point both hostnames at the CloudFront domain with CNAME records (apex is not involved). `middleware.ts` already
   isolates `graph.gymflow.sbs` as the API-only proxy by host header.
4. Lower the TTL a day before cutover so a rollback is quick.

## Crons

`sst.aws.Cron` creates EventBridge schedules that run `cron/handler.ts`, which POSTs to the route with the
`x-cron-secret` header. They are created with `enabled: false`.

- `/api/cron/whatsapp` at 03:30 UTC, `/api/cron/subscription` at 00:00 UTC (same as `vercel.json`).
- `/api/cron/push-evening` is deliberately not scheduled here: its route documents a QStash schedule (~19:00 IST).

## Cutover order

1. Deploy to AWS with crons disabled; verify login, a member check-in, an owner page, `/api/health/deep`.
2. Lower DNS TTL; point `NEXT_PUBLIC_APP_URL`, the QStash callback and the Meta webhook URL at the new host
   (redeploy so the public values are rebuilt).
3. Switch DNS to CloudFront. Watch the CloudWatch alarm and Sentry.
4. Remove the `crons` block from `vercel.json` and deploy Vercel (or pause the project).
5. Only then set `enabled: true` on the crons in `sst.config.ts` and redeploy. Never run both: the daily WhatsApp
   automation would run twice.
6. Rollback: repoint DNS to Vercel, set the cron `enabled` back to false, restore `vercel.json` crons.

## Admin panel (separate SST app)

`gymflow-admin/` deploys as its own SST app (`infra/sst.admin.config.ts`, app name `gymflow-admin`), so main-app
deploys never depend on admin secrets or its certificate. Every command runs from `infra/` with
`--config sst.admin.config.ts`. Vercel stays live as the rollback.

1. Certificate: request an ACM certificate for `admin.gymflow.sbs` in us-east-1 (CloudFront requires it). An earlier
   request failed with CAA_ERROR: Cloudflare can add CAA records for proxied hosts, so set the admin DNS record to
   DNS only, or add a CAA record allowing `amazon.com`, before requesting. Validate with the CNAME ACM shows.
2. In `gymflow-admin/` run `npx vercel env pull .env.local`.
3. In `infra/` run `bash set-admin-secrets.sh` (prints only `set:` / `MISSING:`).
4. Export `ADMIN_CERT_ARN` and the plain vars listed in `PLAIN_ENV_NAMES` (empty values are skipped).
5. `npx sst diff --stage production --config sst.admin.config.ts`, then `npx sst deploy ...` (or run the
   aws-deploy workflow with target `admin`, which reads repository variables).
6. Cutover: CNAME `admin` to the CloudFront domain printed by deploy, DNS only. Lower the TTL first.

Verify after cutover:

- Admin login at `/auth`.
- Resend inbound webhook URL is unchanged and still delivers.
- The Postgres trigger that calls `/api/push/dispatch` still reaches the new host.
- Rate limiting by client IP: `lib/rate-limit.ts` `getClientIp` prefers `x-real-ip`, which Vercel sets but
  CloudFront does not. Check which header it falls back to, or all users may share one bucket.
