# Self-hosting GymFlow

This guide takes you from a clone to a running deployment of your own. Local development only
needs steps 1 to 3.

GymFlow was written for one deployment (`gymflow.sbs`), not as a configurable product, so some
values are in the code instead of in environment variables. [Section 9](#9-things-that-are-specific-to-gymflowsbs)
lists them. Read it before going live.

> This guide was written from the code. A full install on an empty Supabase project has not
> been re-tested end to end, so expect to fix a small thing or two in step 2, and please send
> a pull request for whatever you had to change.

## Contents

1. [What you need](#1-what-you-need)
2. [Database](#2-database)
3. [Root app: owner console and member app](#3-root-app-owner-console-and-member-app)
4. [Production hosting](#4-production-hosting)
5. [Email (Resend)](#5-email-resend)
6. [WhatsApp](#6-whatsapp)
7. [Admin panel](#7-admin-panel)
8. [Admin mobile app and marketing site](#8-admin-mobile-app-and-marketing-site)
9. [Things that are specific to gymflow.sbs](#9-things-that-are-specific-to-gymflowsbs)

---

## 1. What you need

| | Required | Notes |
|---|---|---|
| Node.js 20+ and npm | yes | each project installs its own `node_modules` |
| A Supabase project | yes | free tier works; pick a region near your users |
| A host for Next.js | for production | the hosted version uses Vercel; cron schedules are in `vercel.json` |
| Upstash Redis | recommended | cache and rate limiting; the app runs without it |
| Resend, Meta WhatsApp, QStash, Google Maps, Sentry, Firebase, Groq | optional | one feature each; see the table in the root [README](README.md#which-services-do-i-need) |

## 2. Database

The whole schema is **one file**, `supabase-schema.sql`. You run it once, unchanged, and then set
a few values of your own with a short SQL snippet. Follow the steps in order.

> **Do not edit `supabase-schema.sql`.** Nothing inside it needs to be changed for a new
> install. Your own values go in with the snippet in step 4, so the file stays identical to the
> project's and can be run again later without undoing your settings.

### Step 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) → **New project**.
2. Pick a region close to your users and set a database password (save it somewhere safe).
3. Wait for the project to finish provisioning (about two minutes).

### Step 2. Check the extensions (usually nothing to do)

The file enables the extensions it needs: `uuid-ossp`, `pg_trgm` and `pg_net`. On Supabase this
normally just works. If the run in step 3 stops with an error that mentions an extension, enable
it by hand and run again: **Database → Extensions**, search for `pg_net` (or the one named in the
error) and switch it on.

### Step 3. Run the schema

1. Open **SQL Editor → New query**.
2. Open `supabase-schema.sql` from this repository, select everything, and paste it into the
   editor. It is about 6,200 lines, so give it a moment.
3. Click **Run**. It takes a few seconds and should end with **Success. No rows returned.**

If it stops with an error, the message names the failing statement. Fix the cause (usually a
missing extension, step 2) and click Run again. The file is idempotent, so running it again is
safe and picks up where the failure left things.

Check that it worked, in a new query:

```sql
select count(*) as tables from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';      -- expect 29

select id, public from storage.buckets;                           -- expect: payment-proofs, false

select key from app_config order by key;                          -- expect: push_cron_secret, push_dispatch_url

select price_monthly, price_half_yearly, price_yearly from platform_settings;   -- 1999, 6999, 12999
```

### Step 4. Set your own values (this is the part you change)

Run this in a new SQL Editor query, **after** replacing every `<…>` placeholder. Each block says
when you can skip it.

```sql
-- A. Where owners pay for their GymFlow subscription, and the prices.
--    Required if you charge gyms for a subscription. The app shows "Payment details are not set
--    up yet" until upi_id is filled in.
update platform_settings
set upi_id            = '<your-upi-id@bank>',     -- the UPI ID that receives the payments
    upi_name          = '<Your Business Name>',   -- the name shown in the UPI app
    price_monthly     = 1999,                     -- rupees; change to your own prices
    price_half_yearly = 6999,
    price_yearly      = 12999
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

| Value | Where it comes from | What happens if you leave it |
|---|---|---|
| `platform_settings.upi_id`, `upi_name` | your own UPI ID and business name | Owners cannot pay: the subscription page shows no QR |
| `platform_settings.price_*` | your own prices | Defaults of ₹1,999 / ₹6,999 / ₹12,999 apply |
| `app_config.push_cron_secret` | a random secret you generate | Push dispatch stays off (it ignores the placeholder) |
| `app_config.push_dispatch_url` | your admin app's URL | Pushes are sent to `admin.gymflow.sbs`, which is not yours |

Re-running `supabase-schema.sql` later will **not** overwrite these values.

### Step 5. Supabase Auth settings

In the dashboard, under **Authentication → URL Configuration**:

- **Site URL**: your app's address (`http://localhost:3004` for local development, your real
  domain in production).
- **Redirect URLs**: add the same address, and `<address>/**`.

To test locally without a mail provider, turn off **Authentication → Providers → Email →
Confirm email**, or confirm users by hand under **Authentication → Users**.

### Step 6. Copy the API keys into the app

In **Project Settings → API** copy three values into the root `.env.local`:

| Supabase shows | Goes into |
|---|---|
| Project URL | `SUPABASE_URL` |
| `anon` `public` key | `SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` (server only; never share it) |

For `gymflow-admin`, the same project: Project URL → `NEXT_PUBLIC_SUPABASE_URL`, the anon key →
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, the service-role key → `SUPABASE_SERVICE_ROLE_KEY`.

### Step 7. First run

```bash
npm run dev          # http://localhost:3004
```

Create an account at `/auth/create-account`. The new gym appears in the database:

```sql
select name, subscription_status, trial_ends_at from gyms;       -- status 'trial'
```

### Updating an existing database later

A database you already created does not need the whole file again. When the project adds a new
file under `supabase/migrations/`, run just that file in the SQL Editor. Running the whole of
`supabase-schema.sql` also works, because it is idempotent, but the single migration is smaller.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| `permission denied for schema …` or an extension error | Enable the extension under Database → Extensions (step 2), run again |
| `relation "…" does not exist` partway through | The run was cut off or edited. Run the unmodified file again from the top |
| Query runs forever or the editor freezes | Very large paste. Run it in two halves: split at the line `-- PART 2 — MIGRATIONS (chronological)`, and run Part 1 first, then Part 2 |
| App says the database is unreachable | `SUPABASE_URL` or a key in `.env.local` is wrong, or the dev server was not restarted after editing it |
| Signup email never arrives | Resend is not set up. Confirm the user by hand (step 5) |

## 3. Root app: owner console and member app

```bash
npm install
cp .env.example .env.local      # fill in the REQUIRED block
npm run dev                     # http://localhost:3004
```

`.env.example` explains every variable. To boot you need `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_API_URL`.

In Supabase, under Authentication → URL Configuration, set the Site URL to your app's origin
(`http://localhost:3004` in development) and add it to the redirect URLs.

Create an account at `/auth/create-account`. Without Resend configured the set-password email
is not sent; confirm the user under Authentication → Users instead.

## 4. Production hosting

The hosted version runs the root app on Vercel:

- Connect the repository; the project root is the repository root.
- Add every variable from `.env.local` to the project's environment variables.
- `vercel.json` registers two daily crons (`/api/cron/whatsapp`, `/api/cron/subscription`).
  Vercel sends `CRON_SECRET` with them automatically when that variable is set.
- `vercel.json` also sets an `ignoreCommand` (`scripts/vercel-ignore-root.sh`) that skips the
  root build when a commit only touches the sibling projects or `docs/`.

Any host that runs Next.js 15 works. If it has no cron feature, call the two cron routes daily
yourself, sending the header `x-cron-secret: <CRON_SECRET>`.

Use different secrets for development and production, and never reuse `ADMIN_PASSWORD` as
`ADMIN_PANEL_SECRET`.

## 5. Email (Resend)

Transactional email is sent through three **published Resend templates**, referenced by alias
in `lib/email/resend.ts`:

| Alias | Source in this repo | Variables |
|---|---|---|
| `gymflow-set-password` | `emails/set-password.html` | `action_url`, `year`, `logo_url` |
| `gymflow-confirm-email` | `emails/confirm-email.html` | `action_url`, `year`, `logo_url` |
| `gymflow-delete-account-otp` | `emails/delete-account-otp.html` | `otp_code`, `expiry_label`, `year`, `logo_url` |

To set it up:

1. Verify a sending domain in Resend and set `RESEND_API_KEY` and `RESEND_FROM`.
2. Create the three templates in Resend from the HTML files, keeping the aliases above (or
   change `EMAIL_TEMPLATES` in `lib/email/resend.ts` to yours), and publish them.
3. Each template declares a default for `logo_url`. Point it at your own logo, hosted as a PNG
   (Gmail and Outlook do not render SVG in email).

## 6. WhatsApp

WhatsApp is the largest optional piece. You need a Meta Business account, a WhatsApp Business
phone number, and message templates approved by Meta whose **names and parameters match the
code exactly**. Start with the guide in
[lib/whatsapp/README.md](lib/whatsapp/README.md); the template definitions are in `config/whatsapp.ts`
and `lib/whatsapp/`.

- Set `WHATSAPP_BASE_URL=https://graph.facebook.com` to call Meta directly. The hosted version
  routes through its own reverse proxy on a dedicated hostname; you do not need that.
- Register the webhook URL `https://<your-app>/api/webhook` with Meta, using the value of
  `WHATSAPP_VERIFY_TOKEN`.
- Scheduled sends go through a queue drained by QStash. Without QStash, call
  `/api/whatsapp/queue/drain` yourself with the `x-cron-secret` header.
- After any change in this area run `npm test` and `npm run verify:whatsapp`.

## 7. Admin panel

`gymflow-admin/` is a separate Next.js app for the platform operator: approving subscription
payments, the support inbox, logs. See [gymflow-admin/README.md](gymflow-admin/README.md).

It uses the Supabase **service-role key** for every query, so it bypasses Row Level Security by
design. Protect it accordingly: a long random `ADMIN_PANEL_SECRET`, HTTPS only, and ideally an
extra layer in front of it (IP allowlist, VPN, or your host's access control).

For push notifications to the admin mobile app, after the schema has run:

```sql
update app_config set value = '<your CRON_SECRET for the admin app>' where key = 'push_cron_secret';
update app_config set value = 'https://<your-admin-host>/api/push/dispatch' where key = 'push_dispatch_url';
```

## 8. Admin mobile app and marketing site

Both are optional and documented in their own READMEs:

- [gymflow-mobile/README.md](gymflow-mobile/README.md): React Native app for the operator.
- [landing-page-1/README.md](landing-page-1/README.md): the public marketing site.

## 9. Things that are specific to gymflow.sbs

These are in the code, not in environment variables. Search for `gymflow.sbs` to find them all
(`git grep -n "gymflow\.sbs"`).

**Change before you take real payments**

| What | Where | Why it matters |
|---|---|---|
| Your UPI ID and business name | `platform_settings` table (step 4 of section 2) | There is no hard-coded fallback: until `upi_id` is set, owners cannot pay. |
| Subscription prices | `platform_settings` table; also quoted in `landing-page-1/` and `gymflow-admin/lib/support-knowledge.ts` | Keep the three in step. |

**Change for your own domain**

| What | Where |
|---|---|
| Host isolation, legacy redirects, the WhatsApp proxy hostname | `middleware.ts`, `lib/graph-domain.ts`, `lib/member/redirect.ts`, `lib/auth/roles.ts`, `next.config.mjs` |
| Site metadata, `robots`, service worker scope | `app/layout.tsx`, `app/robots.ts`, `app/sw.ts` |
| Links placed in emails and WhatsApp messages | `lib/member/activation-email.ts`, `app/api/activate/*`, `app/api/member-app/invite/route.ts`, `lib/whatsapp/sender.ts` |
| Support address, sender name, reply email design and logo | `gymflow-admin/lib/email.ts`, `gymflow-admin/lib/email-html.ts` (logo URL; override with `SUPPORT_EMAIL_LOGO_URL`) |
| What the AI reply drafts are allowed to say | `gymflow-admin/lib/support-knowledge.ts`, and the allowed link hosts in `gymflow-admin/lib/ai-draft.ts` |
| Mobile app's production API host and Supabase project fallback | `gymflow-mobile/lib/api/client.ts`, `gymflow-mobile/lib/supabase-realtime.ts` |
| App links, contact details, legal pages, SEO files | `landing-page-1/src/components/*`, `landing-page-1/index.html`, `landing-page-1/public/` |

**Analytics on the marketing site**

`landing-page-1/index.html` loads Google Analytics with a measurement ID that belongs to
gymflow.sbs. It only runs when the page is served from `gymflow.sbs`, so a fork does not report
to it, but replace the ID (and the hostname check) with your own. Microsoft Clarity is set by
`VITE_CLARITY_PROJECT_ID`.

**Branding**

The name "GymFlow", the logo and the files in `public/` and `landing-page-1/public/` identify
the original project. The license covers the code; please use your own name and logo for a
service you run.
