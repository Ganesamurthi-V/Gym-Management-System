# Self-hosting GymFlow

This guide takes you from a fresh clone to a deployment of your own. Local development only
needs steps 1 to 4.

GymFlow was written for one deployment (`thegymflow.in`). It is not a configurable product. So some
values live in the code instead of in environment variables. [Step 10](#10-things-that-are-specific-to-thegymflowin)
lists them. Read it before you go live.

> This guide was written from the code. A full install on an empty Supabase project has not been
> tested end to end again, so expect to fix a small thing or two in step 2. Please send a pull
> request for whatever you had to change.

## Contents

1. [What you need](#1-what-you-need)
2. [Set up the database](#2-set-up-the-database)
3. [Run the app locally](#3-run-the-app-locally)
4. [Check that it works](#4-check-that-it-works)
5. [Deploy to production](#5-deploy-to-production)
6. [Optional: email with Resend](#6-optional-email-with-resend)
7. [Optional: WhatsApp](#7-optional-whatsapp)
8. [Schedule the daily jobs](#8-schedule-the-daily-jobs)
9. [Optional: admin panel, mobile app and marketing site](#9-optional-admin-panel-mobile-app-and-marketing-site)
10. [Things that are specific to thegymflow.in](#10-things-that-are-specific-to-thegymflowin)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What you need

| | Required? | Notes |
|---|---|---|
| Node.js 20+ and npm | Yes | Each project installs its own `node_modules` |
| A Supabase project | Yes | The free tier works. Pick a region near your users |
| A host for Next.js 15 | For production only | Vercel works out of the box. The hosted version uses AWS (see [step 5](#5-deploy-to-production)) |
| Upstash Redis | Recommended | Cache and rate limiting. The app runs without it |
| Resend, Meta WhatsApp, QStash, Google Maps, Sentry, Firebase, Groq | Optional | Each one switches on one feature. See the table in the [README](README.md#which-services-do-i-need) |

---

## 2. Set up the database

The whole schema is **one file**, `supabase-schema.sql`. You run it once, unchanged. Then you set a few
values of your own with a short SQL snippet.

> **Do not edit `supabase-schema.sql`.** Nothing in it needs to change for a new install. Your own
> values go in with the snippet in step 2.4. That way the file stays identical to the project's and
> can be run again later without undoing your settings.

### 2.1 Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) and choose **New project**.
2. Pick a region close to your users. Set a database password and save it somewhere safe.
3. Wait for the project to finish setting up (about two minutes).

### 2.2 Check the extensions (usually nothing to do)

The file turns on the extensions it needs: `uuid-ossp`, `pg_trgm` and `pg_net`. On Supabase this
normally just works. If the run in step 2.3 stops with an error that mentions an extension, turn it
on by hand and run again. Go to **Database → Extensions**, search for `pg_net` (or the one named in
the error) and switch it on.

### 2.3 Run the schema

1. Open **SQL Editor → New query**.
2. Open `supabase-schema.sql` from this repository, select everything, and paste it into the editor.
   It is about 7,300 lines, so give it a moment.
3. Click **Run**. It takes a few seconds and should end with **Success. No rows returned.**

If it stops with an error, the message names the failing statement. Fix the cause (usually a missing
extension, step 2.2) and click Run again. The file is idempotent (safe to run more than once), so
running it again picks up where the failure left things.

Check that it worked. Run this in a new query:

```sql
select count(*) as tables from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';      -- expect about 50 (51 when this was written)

select id, public from storage.buckets;                           -- expect: Payments_proof, false

select key from app_config order by key;                          -- expect: push_cron_secret, push_dispatch_url

select price_monthly, price_yearly from platform_settings;        -- 999, 9999
```

### 2.4 Set your own values

Run this in a new SQL Editor query, **after** replacing every `<...>` placeholder. Each block says
when you can skip it.

```sql
-- A. Where owners pay for their GymFlow subscription, and the prices.
--    Required if you charge gyms for a subscription. The app shows "Payment details are not set
--    up yet" until upi_id is filled in.
update platform_settings
set upi_id            = '<your-upi-id@bank>',     -- the UPI ID that receives the payments
    upi_name          = '<Your Business Name>',   -- the name shown in the UPI app
    price_monthly     = 999,                     -- rupees; change to your own prices
    price_yearly      = 9999
where id = 1;

-- B. Push notifications to the admin mobile app.
--    Skip this whole block if you are not running gymflow-admin / gymflow-mobile.
--    <CRON_SECRET> must be exactly the CRON_SECRET in gymflow-admin's environment
--    (generate one with:  openssl rand -hex 32).
update app_config set value = '<CRON_SECRET>'
where key = 'push_cron_secret';

--    The public address of your deployed gymflow-admin app, plus /api/push/dispatch.
update app_config set value = 'https://<your-admin-host>/api/push/dispatch'
where key = 'push_dispatch_url';
```

What each value does:

| Value | Where it comes from | If you leave it |
|---|---|---|
| `platform_settings.upi_id`, `upi_name` | Your own UPI ID and business name | Owners cannot pay: the subscription page shows no QR |
| `platform_settings.price_*` | Your own prices | The defaults apply (₹999 per month, ₹9,999 per year) |
| `app_config.push_cron_secret` | A random secret you generate | Push dispatch stays off (it ignores the placeholder) |
| `app_config.push_dispatch_url` | Your admin app's URL | Pushes are sent to `admin.thegymflow.in`, which is not yours |

Running `supabase-schema.sql` again later will **not** overwrite these values.

### 2.5 Set the Supabase Auth settings

In the dashboard, go to **Authentication → URL Configuration**:

- **Site URL**: your app's address (`http://localhost:3004` for local development, your real domain in production).
- **Redirect URLs**: add the same address, and `<address>/**`.

To test locally without a mail provider, turn off **Authentication → Providers → Email → Confirm
email**. Or confirm users by hand under **Authentication → Users**.

### 2.6 Copy the API keys

Go to **Project Settings → API**. You will paste these into `.env.local` in step 3.

| Supabase shows | Goes into |
|---|---|
| Project URL | `SUPABASE_URL` |
| `anon` `public` key | `SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` (server only; never share it) |

`gymflow-admin` uses the same project, but with different variable names: Project URL →
`NEXT_PUBLIC_SUPABASE_URL`, anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, service-role key →
`SUPABASE_SERVICE_ROLE_KEY`.

### Updating an existing database later

A database you already created does not need the whole file again. When the project adds a new file
under `supabase/migrations/`, run just that file in the SQL Editor. Running all of
`supabase-schema.sql` also works, because it is idempotent, but the single migration is smaller.

---

## 3. Run the app locally

```bash
npm install
cp .env.example .env.local      # then fill in the REQUIRED block
npm run dev                     # http://localhost:3004
```

`.env.example` explains every variable. To start the app you need these five:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | From step 2.6 |
| `SUPABASE_ANON_KEY` | From step 2.6 |
| `SUPABASE_SERVICE_ROLE_KEY` | From step 2.6 |
| `NEXT_PUBLIC_APP_URL` | The app's own address, `http://localhost:3004` locally |
| `NEXT_PUBLIC_API_URL` | Keep it equal to `NEXT_PUBLIC_APP_URL` |

Restart the dev server after you edit `.env.local`.

---

## 4. Check that it works

1. Open http://localhost:3004/auth/create-account and create an account. Without Resend, the
   set-password email is not sent. Confirm the user under **Authentication → Users** instead.
2. Sign in and go through the onboarding wizard.
3. Check that the new gym exists in the database:

   ```sql
   select name, subscription_status, trial_ends_at from gyms;       -- status 'trial'
   ```

4. Before you deploy, run the checks:

   ```bash
   npm run build
   npm test
   ```

---

## 5. Deploy to production

GymFlow runs on any host that can run Next.js 15.

**Vercel (works out of the box)**

1. Connect the repository. The project root is the repository root.
2. Add every variable from `.env.local` to the project's environment variables.
3. `vercel.json` sets an `ignoreCommand` (`scripts/vercel-ignore-root.sh`). It skips the root build
   when a commit only touches the sibling projects or `docs/`.
4. `vercel.json` does **not** define crons. Do [step 8](#8-schedule-the-daily-jobs).

**Other hosts**

Any Node host for Next.js 15 works. You must run the daily jobs yourself ([step 8](#8-schedule-the-daily-jobs)).

**The hosted version (AWS)**

The hosted version runs on AWS: SST v4 + OpenNext, CloudFront to Lambda, in `ap-south-1`. The config is
`infra/sst.config.ts` and the guide is [infra/README.md](infra/README.md). You do not need it to
self-host.

Use different secrets for development and production. Never reuse `ADMIN_PASSWORD` as
`ADMIN_PANEL_SECRET`.

---

## 6. Optional: email with Resend

Transactional email is sent through three **published Resend templates**. They are referenced by
alias in `lib/email/resend.ts`:

| Alias | Source in this repo | Variables |
|---|---|---|
| `gymflow-set-password` | `emails/set-password.html` | `action_url`, `year`, `logo_url` |
| `gymflow-confirm-email` | `emails/confirm-email.html` | `action_url`, `year`, `logo_url` |
| `gymflow-delete-account-otp` | `emails/delete-account-otp.html` | `otp_code`, `expiry_label`, `year`, `logo_url` |

1. Verify a sending domain in Resend. Set `RESEND_API_KEY` and `RESEND_FROM`.
2. Create the three templates in Resend from the HTML files and publish them. Keep the aliases above,
   or change `EMAIL_TEMPLATES` in `lib/email/resend.ts` to yours.
3. Each template declares a default for `logo_url`. Point it at your own logo, hosted as a PNG
   (Gmail and Outlook do not show SVG in email).

---

## 7. Optional: WhatsApp

WhatsApp is the largest optional piece. You need:

- a Meta Business account,
- a WhatsApp Business phone number,
- message templates approved by Meta, whose **names and parameters match the code exactly**.

Start with [lib/whatsapp/README.md](lib/whatsapp/README.md). The template definitions are in
`config/whatsapp.ts` and `lib/whatsapp/`.

1. Set `WHATSAPP_BASE_URL=https://graph.facebook.com` to call Meta directly. The hosted version goes
   through its own reverse proxy on a dedicated hostname. You do not need that.
2. Register the webhook URL `https://<your-app>/api/webhook` with Meta. Use the value of `WHATSAPP_VERIFY_TOKEN`.
3. Scheduled sends go through a queue that QStash drains. Without QStash, call
   `/api/whatsapp/queue/drain` yourself with the `x-cron-secret` header.
4. After any change in this area, run `npm test` and `npm run verify:whatsapp`.

---

## 8. Schedule the daily jobs

Three routes need to run once a day. Each one is protected by `CRON_SECRET`: send it in the
`x-cron-secret` header.

| Time (UTC) | Route | What it does |
|------------|-------|--------------|
| 03:30 (09:00 IST) | `/api/cron/whatsapp` | Scheduled WhatsApp reminders |
| 00:00 | `/api/cron/subscription` | Expires lapsed trials and subscriptions |
| 13:30 (19:00 IST) | `/api/cron/push-evening` | Evening member push nudge. Off unless `PUSH_EVENING_ENABLED=true` |

Pick one way to run them:

- **QStash.** From `infra/`, run `./set-qstash-schedules.sh`. It reads `QSTASH_TOKEN`, `QSTASH_URL` and
  `CRON_SECRET` from `../.env.local` (or your shell). Set `APP_URL=https://<your-app>` to point it at
  your own deployment, because the default is `https://app.thegymflow.in`.
- **Your host's scheduler**, or any cron service. Send a `POST` to each route with the `x-cron-secret` header.

---

## 9. Optional: admin panel, mobile app and marketing site

**Admin panel.** `gymflow-admin/` is a separate Next.js app for the platform operator: approving
subscription payments, the support inbox and logs. See [gymflow-admin/README.md](gymflow-admin/README.md).

It uses the Supabase **service-role key** for every query, so it bypasses Row Level Security by
design. Protect it. Use a long random `ADMIN_PANEL_SECRET`, HTTPS only, and ideally another layer in
front (an IP allowlist, a VPN, or your host's access control).

For push notifications to the admin mobile app, run block B from [step 2.4](#24-set-your-own-values)
after the schema has run. The full push setup is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#set-up-the-admin-mobile-app-and-push).

**Admin mobile app and marketing site.** Both are optional and have their own READMEs:

- [gymflow-mobile/README.md](gymflow-mobile/README.md): React Native app for the operator.
- [landing-page/README.md](landing-page/README.md): the public marketing site.

---

## 10. Things that are specific to thegymflow.in

These values are in the code, not in environment variables. Search for `thegymflow.in` to find them
all (`git grep -n "thegymflow\.in"`).

**Change before you take real payments**

| What | Where | Why it matters |
|---|---|---|
| Your UPI ID and business name | `platform_settings` table ([step 2.4](#24-set-your-own-values)) | There is no hard-coded fallback. Until `upi_id` is set, owners cannot pay |
| Subscription prices | `platform_settings` table. Also quoted in `landing-page/` and `gymflow-admin/lib/support-knowledge.ts` | Keep the three in step |

**Change for your own domain**

| What | Where |
|---|---|
| Host isolation, legacy redirects, the WhatsApp proxy hostname | `middleware.ts`, `lib/graph-domain.ts`, `lib/member/redirect.ts`, `lib/auth/roles.ts`, `next.config.mjs` |
| Site metadata, `robots`, service worker scope | `app/layout.tsx`, `app/robots.ts`, `app/sw.ts` |
| Links placed in emails and WhatsApp messages | `lib/member/activation-email.ts`, `app/api/activate/*`, `app/api/member-app/invite/route.ts`, `lib/whatsapp/sender.ts` |
| Support address, sender name, reply email design and logo | `gymflow-admin/lib/email.ts`, `gymflow-admin/lib/email-html.ts` (logo URL; override with `SUPPORT_EMAIL_LOGO_URL`) |
| What the AI reply drafts may say | `gymflow-admin/lib/support-knowledge.ts`, and the allowed link hosts in `gymflow-admin/lib/ai-draft.ts` |
| The mobile app's production API host and Supabase project fallback | `gymflow-mobile/lib/api/client.ts`, `gymflow-mobile/lib/supabase-realtime.ts` |
| App links, contact details, legal pages, SEO files | `landing-page/src/components/*`, `landing-page/index.html`, `landing-page/public/` |

**Analytics on the marketing site**

`landing-page/index.html` loads Google Analytics with a measurement ID that belongs to
thegymflow.in. It only runs when the page is served from `thegymflow.in`, so a fork does not report to
it. Still, replace the ID (and the hostname check) with your own. Microsoft Clarity is set by
`VITE_CLARITY_PROJECT_ID`.

**Branding**

The name "GymFlow", the logo and the files in `public/` and `landing-page/public/` identify the
original project. The license covers the code. Please use your own name and logo for a service you run.

---

## 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `permission denied for schema ...` or an extension error | Turn the extension on under Database → Extensions ([step 2.2](#22-check-the-extensions-usually-nothing-to-do)), then run again |
| `relation "..." does not exist` partway through | The run was cut off or edited. Run the unmodified file again from the top |
| The query runs forever or the editor freezes | The paste is very large. Run it in two halves: split at the `-- 5 — FUNCTIONS` section header, and run the first half first |
| The app says the database is unreachable | `SUPABASE_URL` or a key in `.env.local` is wrong, or you did not restart the dev server after editing it |
| The signup email never arrives | Resend is not set up. Confirm the user by hand ([step 2.5](#25-set-the-supabase-auth-settings)) |
| Owners see "Payment details are not set up yet" | `platform_settings.upi_id` is empty ([step 2.4](#24-set-your-own-values)) |
| WhatsApp reminders never go out | The daily jobs are not scheduled ([step 8](#8-schedule-the-daily-jobs)), or the queue is not being drained ([step 7](#7-optional-whatsapp)) |
