<p align="center">
  <img src="public/logo_landspace.png" alt="GymFlow" width="720">
</p>

<h1 align="center">GymFlow</h1>

<p align="center">
  <em>Know exactly who paid, who didn't, and who's about to expire, without notebooks.</em>
</p>

<p align="center">
  <a href="https://www.gymflow.sbs">Website</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="SELF_HOSTING.md">Self-hosting</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">AGPL-3.0</a>
</p>

**GymFlow** is open-source gym management software for small, single-location gyms. It was
built for gyms in Tamil Nadu and Puducherry, India, so it is mobile-first, prices are in INR,
payments are collected by UPI QR code, and members are reached on WhatsApp.

It is a multi-tenant SaaS: one deployment serves many gyms, and each gym's data is isolated
with Postgres Row Level Security.

- **Owner console**: members, payments and dues, attendance kiosk, reports, bulk Excel/CSV import
- **Member app (PWA)**: digital gym card with QR, attendance, membership details, workouts, rewards
- **WhatsApp automation**: welcome messages, renewal reminders and payment-due alerts
- **Super-admin panel and mobile app**: subscriptions, support inbox, push notifications
- **Marketing site**

The hosted version runs at [gymflow.sbs](https://www.gymflow.sbs). This repository is the same
code.

## Contents

- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Which services do I need?](#which-services-do-i-need)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Self-hosting](#self-hosting)
- [Contributing](#contributing)
- [License](#license)

Everything from [Domains & Architecture](#domains--architecture) down is a deeper reference.

---

## Repository layout

The repository root **is** the main Next.js app. The other folders are separate projects with
their own `package.json` and `node_modules`, deployed on their own.

| Path | What it is | Dev command | README |
|------|-----------|-------------|--------|
| `/` (root) | Owner console + member PWA (Next.js 15) | `npm run dev` → http://localhost:3004 | this file |
| `gymflow-admin/` | Super-admin panel (Next.js) | `npm run dev` → http://localhost:3001 | [gymflow-admin/README.md](gymflow-admin/README.md) |
| `gymflow-mobile/` | Admin mobile app (React Native 0.75, Android/iOS) | `npm run android` | [gymflow-mobile/README.md](gymflow-mobile/README.md) |
| `landing-page-1/` | Marketing site (Vite + React) | `npm run dev` | [landing-page-1/README.md](landing-page-1/README.md) |
| `supabase-schema.sql` | The complete database schema as one runnable file | run once in the SQL editor | [SELF_HOSTING.md](SELF_HOSTING.md#2-database) |
| `supabase/migrations/` | The same schema as individual change files (history) | for existing databases | |
| `emails/` | Source HTML of the transactional email templates | published to Resend | [SELF_HOSTING.md](SELF_HOSTING.md#5-email-resend) |
| `_archived/` | Dead code kept for reference. Not built, not imported. | | |

You only need the root app to try GymFlow. The admin panel, mobile app and marketing site are
optional.

---

## Quick start

This gets the owner console and member app running on your machine against your own Supabase
project. About 15 minutes.

**You need:** Node.js 20 or newer, npm, and a free [Supabase](https://supabase.com) project.

```bash
git clone <your-fork-url> gymflow
cd gymflow
npm install
cp .env.example .env.local
```

1. **Create the database.** In the Supabase dashboard, open the SQL editor and run the single
   file `supabase-schema.sql`. It contains the whole schema (tables, indexes, RLS, functions,
   triggers, realtime and storage) with every migration already merged in. See
   [SELF_HOSTING.md](SELF_HOSTING.md#2-database) for what to set afterwards.
2. **Fill in `.env.local`.** Only the three Supabase values and the two app URLs are required
   to boot. `.env.example` marks every variable as required or optional and says what each one
   switches on.
3. **Run it.**

   ```bash
   npm run dev          # http://localhost:3004
   ```

4. **Create an account** at http://localhost:3004/auth/create-account and go through the
   onboarding wizard. Signup emails need Resend (see the table below); without it, confirm the
   user by hand in Supabase under Authentication → Users.

Before you push a change:

```bash
npm run build          # the real typecheck; there is no CI
npm test               # vitest
npm run lint
```

---

## Which services do I need?

Only Supabase is required. Everything else switches on one feature, and the app is written to
keep working without it.

| Service | Needed for | Without it |
|---------|-----------|------------|
| **Supabase** (Postgres, Auth, Storage) | Everything | The app does not start |
| **Upstash Redis** | Caching and rate limiting | Both degrade gracefully: no cache, no rate limits |
| **Resend** | Signup, member activation and account-deletion emails | Those emails are not sent; confirm users by hand |
| **Meta WhatsApp Cloud API** | All WhatsApp messages | No messages are sent; the rest of the app is unaffected |
| **Upstash QStash** | The throttled WhatsApp send queue | Queued sends are not drained; trigger the drain by hand in dev |
| **Google Maps Platform** | Address autocomplete in onboarding | Type the address by hand |
| **Sentry** | Error and performance monitoring | No error reports |
| **Firebase** | Push notifications to the admin mobile app (set in `gymflow-admin`) | No push; the admin app still works |
| **Groq** | AI reply drafts in the support inbox (set in `gymflow-admin`) | No drafts; replies are written by hand |

WhatsApp needs approved message templates in your own Meta Business account, and their names
and parameters must match the code exactly. See [lib/whatsapp/README.md](lib/whatsapp/README.md).

---
## Tech stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, React Server Components) |
| **Language** | TypeScript 5 (strict mode) |
| **Styling** | Tailwind CSS 3, Sora font (Google Fonts) |
| **Backend** | Supabase (PostgreSQL 15, Auth, Row Level Security, Realtime, `pg_net`) |
| **Admin Mobile** | React Native 0.75 (bare, no Expo) + React Navigation 6 |
| **Push** | Firebase Cloud Messaging (`@react-native-firebase`) + Notifee, `firebase-admin` server-side |
| **Caching** | Upstash Redis (Serverless HTTP/REST caching) |
| **Queue** | Upstash QStash (throttled WhatsApp send queue) |
| **WhatsApp** | Meta Cloud API via reverse proxy (`graph.gymflow.sbs`) |
| **Payments** | UPI QR code generation (all apps: GPay, PhonePe, Paytm, etc.) |
| **Animations** | Framer Motion, CSS keyframe animations |
| **Charts** | Recharts 3, custom Tailwind bar charts |
| **Import** | ExcelJS (dynamically imported, server-side only) |
| **PDF** | jsPDF + jspdf-autotable |
| **QR Code** | `qrcode` (server-side generation) + `jsqr` (client-side decoding) |
| **Dates** | date-fns 3 |
| **Icons** | Lucide React + custom SVG icon components |
| **Monitoring** | Sentry (error tracking), structured APM-style logging |
| **Deployment** | Vercel (multi-domain) + Supabase Cloud |

---

## Domains & Architecture

| Domain | Purpose | Served By |
|--------|---------|-----------|
| `app.gymflow.sbs` | Owner console (`/owner`), member PWA (`/m`) and API | Main Next.js app |
| `admin.gymflow.sbs` | Super-admin panel and the API the mobile app calls | `gymflow-admin/` |
| `graph.gymflow.sbs` | WhatsApp Graph API reverse proxy (API-only) | Same Vercel project, domain-isolated |
| `www.gymflow.sbs` | Marketing site (`landing-page-1/`); `gymflow.sbs` redirects here | Separate static deployment |

### Domain Isolation Security

- `graph.gymflow.sbs` **never** renders HTML/React pages — only whitelisted API routes pass through
- Endpoint whitelist: only `messages`, `media`, `uploads`, `phone_numbers`, `webhooks`, `message_templates`
- Rate limited (120 req/min per IP via Upstash Redis)
- Path traversal protection (`..` / `%2e` sequences blocked)
- Security headers on all responses (`X-Content-Type-Options: nosniff`, `Cache-Control: no-store`)
- Unknown endpoints → 403 Forbidden JSON
- Non-API routes → 401 Unauthorized JSON

---

## Core Modules

| Module | Description |
|--------|-------------|
| **Onboarding Wizard** | 7-step setup (gym details, plans, metrics, operations, UPI payment setup, marketing, AI personalization) |
| **Dashboard** | Live stats (active members, attendance, expiring, expired, collection, dues). Quick actions. |
| **Members** | Full CRUD + bulk edit. Auto-generated `GF`-prefixed IDs. Area as free text. |
| **Payments** | Payment history with period/mode filters. Export to Excel. Pending dues management. |
| **Attendance** | Self-service check-in/check-out with session tracking (morning/evening). Duration calculation. |
| **Dues** | Members with pending amounts. WhatsApp reminder deep-links. Inline collect form. |
| **Inventory** | Product/variant management. Stock tracking. Sales recording with payment mode. |
| **Bulk Import** | Pipeline: Parse → Map Columns → Map Plans → Assign IDs → Preview → Confirm. Smart column detection. |
| **UPI Payments** | Merchant QR upload/scan → auto-parse UPI ID → generate fresh payment QR per transaction. |
| **WhatsApp Automation** | 6 templates: welcome, renewal, expiry reminder, expired, due reminder, birthday wishes. Throttled queue. |
| **Subscription System** | Trial → payment proof upload → admin approval → active. Realtime status updates. |
| **Support & Feedback** | In-app messaging, support tickets, and star-rated owner feedback. Real-time via Supabase Broadcast. |
| **Account Settings** | Edit gym name/info, change password, UPI setup, danger zone. |
| **Super Admin Panel** | Separate app (`/gymflow-admin`): dashboard, gyms, subscriptions, support, feedback, errors, logs. |
| **Admin Mobile App** | Separate React Native app (`/gymflow-mobile`): same admin API, plus lock-screen push notifications. |

---

## WhatsApp Automation Engine

### Templates (6 approved Meta templates)

| Template | Trigger | Cadence |
|----------|---------|---------|
| `_gymflow_welcome_member` | New member created | Once per member |
| `membership_renewed` | Membership renewed | Once per renewal |
| `membership_expiry_reminder` | Membership expiring soon | Every 3 days, up to 7 sends |
| `membership_expired` | Membership expired | Every 3 days, up to 7 sends |
| `payment_due_reminder` | Pending dues > 0 | Every 3 days, up to 7 sends |
| `_birthday_wishes` | Member's birthday | Once per year |

### Architecture

- **Event-driven** sends (welcome, renewal) fire inline with atomic claim-then-send
- **Scheduled** sends (expiry, expired, due, birthday) are processed by a daily cron job
- **Throttled queue**: all scheduled sends go through `whatsapp_send_queue` → drained at 5 msgs / 5 min via QStash
- **Idempotency**: partial unique index on `(member_id, template_name, date)` prevents duplicate sends
- **Cycle management**: 3-day intervals, 7-send cap, cancellation on renewal/payment

---

## UPI Payment Flow

1. **Merchant onboarding**: Gym owner uploads/scans their UPI QR code during onboarding or settings
2. **QR parsing**: `parseUPIQRCode()` extracts `pa`, `pn`, `mc`, `cu` via standard `URLSearchParams`
3. **Payment collection**: When adding a member with UPI mode → modal offers "Generate QR" or "Collect Manually"
4. **QR generation**: `generateUPILink()` creates a fresh URI per transaction → `generateQRCode()` renders it
5. **Storage**: Only normalized merchant data stored in `gym_upi_config` table (never the raw QR image)

Supports all UPI apps: Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, Cred, and any bank-generated QR.

---

## Owner Feedback

Feedback shares the `support_tickets` table with tickets rather than living in its own
table, so the admin sees tickets and feedback in one queue. Two columns carry it:
`type = 'feedback'` and a nullable `rating SMALLINT` bounded to 1–5.

| Side | Surface |
|------|---------|
| **Owner app** | Support modal, two tabs — "Contact Support" and "Give Feedback" (star rating + topic chips + comment) |
| **Admin web** | `/support` list with an All / Tickets / Feedback filter and inline star display |
| **Admin web (per gym)** | `GymFeedbackPanel` on `/gyms/[gymId]` — that gym's feedback with an average rating |
| **Admin mobile** | Support tab shows stars on feedback cards; gym detail screen has an Owner Feedback card |

Both admin clients read one shared endpoint, `GET /api/support/tickets`, which accepts
optional `?gymId=` and `?type=` filters — so the same route serves the global queue and
the per-gym ("gym-wise") view.

---

## Admin Push Notifications

Lock-screen alerts for the admin mobile app, so events are seen even when the app is
closed. There is **no external cron** — Postgres calls the dispatcher directly.

```
business event (ticket / feedback / payment proof / new gym)
      │  AFTER INSERT trigger
      ▼
notifications row ──────────────► admin:notifications broadcast (in-app bell)
      │  AFTER INSERT trigger → pg_net
      ▼
POST /api/push/dispatch  (x-cron-secret)
      │  claims unpushed rows atomically, sends via firebase-admin
      ▼
FCM ──► device lock screen        (tokens from device_push_tokens)
```

### Notified events

| `type` | Fires when |
|--------|-----------|
| `ticket` | A support ticket is created |
| `feedback` | Owner feedback is submitted (rating included in the title) |
| `payment_request` | A payment proof is submitted for review (`status = 'pending'` only) |
| `new_gym` | A new gym registers |

### Design notes

- **Instant, cron-free**: a `pg_net` `AFTER INSERT` trigger on `notifications` POSTs to
  `/api/push/dispatch`. Delivery is immediate and needs no Vercel Pro cron.
- **No duplicate alerts**: the dispatcher *claims* rows with
  `UPDATE … SET pushed_at = now() WHERE pushed_at IS NULL AND id IN (…) RETURNING`.
  Postgres re-checks the predicate after the row lock, so concurrent dispatches (the
  trigger fires once per row) can never send the same notification twice. A failed send
  releases the batch for retry.
- **Trigger is `AFTER INSERT` only**, so the claim `UPDATE` cannot re-trigger a dispatch.
- **Secrets stay out of the function body**: the dispatch URL and shared secret live in the
  private `app_config` table, read by a `SECURITY DEFINER` trigger.
- **Never blocks business writes**: every notification trigger wraps its work in
  `BEGIN … EXCEPTION WHEN OTHERS` so a logging or network failure cannot roll back the
  ticket/payment/gym insert that caused it.
- **Token hygiene**: tokens re-register on FCM rotation (`onTokenRefresh`), are deleted on
  sign-out (so a signed-out device stops receiving alerts), and are pruned automatically
  when FCM reports them unregistered.
- **App-state handling**: background/quit notifications are rendered by the OS via the
  `admin-alerts` channel; foreground messages are drawn by Notifee. Taps from any state
  deep-link to the relevant gym.

### Middleware exception

`/api/push/dispatch` is listed in the admin middleware's `PUBLIC_PATHS` because Postgres
authenticates with the `x-cron-secret` header, not an admin session. It is **not** actually
public — the route fails closed when `CRON_SECRET` is unset or mismatched.

---

## Supabase Realtime

### Owner-facing channels

| Channel | Purpose |
|---------|---------|
| `gym-{id}-global-status` | Gym activation/deactivation, subscription status changes |
| `gym-{id}-requests` | Subscription request approval/rejection |
| `gym_support_realtime_{id}` | Admin messages and ticket updates to gym owner |
| `admin_subscription_requests_realtime` | New subscription requests to admin panel |
| `admin_dashboard_realtime` | Live stats updates on admin dashboard |
| `admin_support_queue_realtime` | New support tickets to admin panel |

### Admin invalidation hints (`admin:*`)

The admin web and mobile clients authenticate with their own app session, not Supabase
Auth, so they **never** consume row data over Realtime. Postgres `AFTER` triggers emit
**payload-free** public broadcast hints; each client debounces them and re-fetches
through the authenticated admin API. Broadcast payloads are never trusted as data.

| Channel | Emitted on changes to |
|---------|----------------------|
| `admin:gyms` | `gyms`, `subscription_requests` |
| `admin:subscriptions` | `gyms`, `subscription_requests` |
| `admin:support` | `support_tickets`, `admin_messages` |
| `admin:activity` | `subscription_audit_logs`, `whatsapp_*`, new `members` |
| `admin:notifications` | `notifications` (drives the in-app bell + unread badge) |

> React Native note: Hermes lacks `TextEncoder`/`TextDecoder`, which
> `@supabase/realtime-js` needs to encode broadcast frames. `gymflow-mobile/polyfills.js`
> installs them and **must** be the first import in `index.js`, before any Supabase module
> is evaluated.

---

## Project structure

Root app only. Each sibling project documents its own layout in its README.

```
/
├── app/
│   ├── owner/            # Owner console. Its layout mounts AppShell, which is also the paywall
│   ├── m/                # Member PWA. Its layout is the authorization boundary
│   ├── auth/             # Unified login, create account, set password
│   ├── activate/         # Public member activation flow, reached from WhatsApp links
│   ├── api/              # Route handlers for both experiences, crons, webhooks
│   └── sw.ts             # Service worker (Serwist): static assets only
├── components/           # Shared React components
├── features/             # Feature folders (components / hooks / services / types)
├── lib/
│   ├── supabase/         # Server and service-role clients, env access
│   ├── api/              # withAuth wrapper, API client, response helpers
│   ├── dal.ts            # Cached data access for Server Components
│   ├── whatsapp/         # Automation engine: scheduling, idempotency, queue, sender
│   ├── import/           # Bulk Excel/CSV import pipeline
│   ├── upi/              # UPI QR parse, link and QR generation
│   ├── member/           # Member app logic
│   ├── tours/            # Owner onboarding tours (driver.js)
│   ├── cache.ts          # Redis cache; keys in cache-keys.ts
│   └── logger.ts         # Structured logger with redaction
├── services/whatsapp/    # Graph API client and webhook processors
├── repositories/         # Database access for WhatsApp
├── config/               # App configuration
├── types/                # Shared TypeScript types
├── __tests__/            # Vitest tests
├── middleware.ts         # Host isolation, legacy redirects, auth
├── supabase/migrations/  # Database schema
└── vercel.json           # Cron schedules
```

`CLAUDE.md` at the root is a compact, current description of the architecture and its rules
(auth, data access, caching, styling). It is written for AI coding agents but is the fastest
way for a person to get oriented too.


---

## Authentication & Security

### Middleware (`middleware.ts`)
- **Domain isolation**: `graph.gymflow.sbs` → API-only mode; `gymflow.sbs` → redirect to app
- **Auth guard**: Protected routes redirect to `/auth/login`
- **Subscription guard**: Expired gyms redirect to `/subscription`
- **Request IDs**: Every request stamped with a unique ID for tracing

### Login Security
- Server-side login route with **dual rate limiting** (10/min per IP + 5/5min per email)
- Generic error messages (never reveals whether email exists)
- Gym deactivation check post-login

### Admin Auth
- Admin panel protected by `ADMIN_EMAIL` env var check
- API routes protected by `ADMIN_PASSWORD` with IP-based rate limiting (5/min)
- Gymflow-admin uses JWT session (8hr TTL) signed with `ADMIN_PANEL_SECRET`

### Password Security
- Server-side password strength validation (8+ chars, upper, lower, digit, special)
- Constant-time token comparison for webhook verification

---

## Setup Instructions

The [Quick start](#quick-start) covers local development. For a full production deployment
(domains, email templates, WhatsApp, crons, the admin panel) follow
[SELF_HOSTING.md](SELF_HOSTING.md).

The steps below cover the admin mobile app and push notifications.

### Admin mobile app + push notifications

**a. Firebase project**
- Create a project in the [Firebase console](https://console.firebase.google.com)
- Add an **Android app** with package name `com.gymflowAdminMobile`
- Download `google-services.json` → place in `gymflow-mobile/android/app/`
  (gitignored — it is client config, but keep it out of the repo and
  [restrict the API key](https://cloud.google.com/docs/authentication/api-keys#restricting_api_keys)
  to that package + SHA-1)
- For iOS: add an iOS app and upload an APNs Auth Key (requires a paid Apple Developer account)

**b. Server credentials** — Firebase Console → Project Settings → Service Accounts →
Generate new private key. From that JSON, set in the `gymflow-admin` environment:

| Var | Notes |
|-----|-------|
| `FIREBASE_PROJECT_ID` | from `project_id` |
| `FIREBASE_CLIENT_EMAIL` | from `client_email` |
| `FIREBASE_PRIVATE_KEY` | from `private_key` — **one line, double-quoted, keeping the literal `\n` escapes** |
| `CRON_SECRET` | any 32-byte hex string; authorizes `/api/push/dispatch` |

Generate `CRON_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**c. Point the DB at the dispatcher.** The migration seeds a placeholder, so after
running migrations set the shared secret (must equal `CRON_SECRET` above):
```sql
update app_config set value = '<YOUR_CRON_SECRET>' where key = 'push_cron_secret';

-- only if the admin app is not at admin.gymflow.sbs
update app_config set value = 'https://YOUR-ADMIN-HOST/api/push/dispatch'
where key = 'push_dispatch_url';
```

**d. Build the app.** Native modules were added, so a JS reload is not enough:
```bash
cd gymflow-mobile
npm install
npx react-native run-android        # iOS: cd ios && pod install && npx react-native run-ios
```

### Verifying push end to end

Test bottom-up so a failure localises to one layer:

| Layer | Check | Healthy result |
|-------|-------|----------------|
| 1. Device registered | `select * from device_push_tokens;` | At least one row after signing in |
| 2. Dispatcher reachable | `curl -X POST <host>/api/push/dispatch -H "x-cron-secret: <secret>"` | JSON with `sent`/`notifications` (not `Unauthorized` or `push_not_configured`) |
| 3. Trigger fires | `insert into notifications (type, title, body) values ('new_gym','Test','Pipeline works');` | Lock-screen alert within ~2s (background the app first) |
| 4. pg_net result | `select status_code, error_msg from net._http_response order by created desc limit 5;` | `status_code = 200` |
| 5. Row consumed | `select title, pushed_at from notifications order by created_at desc limit 5;` | `pushed_at` is non-null |
| 6. Real event | Submit feedback or a ticket from the owner app | Notification arrives automatically |

Shortcut: to test the device/native side alone, send a test message from
**Firebase Console → Cloud Messaging** using a token from `device_push_tokens`. If that
arrives, any remaining problem is in the DB → dispatch chain (layers 2–4).

---

## Database Schema

All tables use **Row Level Security** scoped to `gym_id → owner_id = auth.uid()`.

### Core Tables

| Table | Purpose |
|-------|---------|
| `gyms` | Gym profile, subscription status, onboarding data |
| `members` | Member profiles (name, phone, area, pending_amount) |
| `memberships` | Payment records (plan, dates, amount, mode) |
| `attendance` | Daily check-ins with session + check-out time |
| `gym_plan_prices` | Per-gym pricing config |
| `inventory` | Products with variants |
| `inventory_sales` | Sales records |
| `due_payments` | Due collection records |

### Subscription Tables

| Table | Purpose |
|-------|---------|
| `subscription_requests` | Payment proof uploads for admin review |
| `subscription_audit_logs` | Admin action audit trail |
| `platform_settings` | UPI ID, pricing for subscription payments |
| `gym_upi_config` | Per-gym merchant UPI config (from QR scan) |

### WhatsApp Tables

| Table | Purpose |
|-------|---------|
| `whatsapp_automation_logs` | Send tracking, cycle state, idempotency |
| `whatsapp_send_queue` | Throttled outbound queue |
| `whatsapp_messages` | Inbound/outbound message history |
| `whatsapp_webhook_logs` | Webhook event audit |

### Support Tables

| Table | Purpose |
|-------|---------|
| `support_tickets` | Gym owner tickets **and** feedback — `type IN ('query','issue','bug','high_priority','feedback')`, plus nullable `rating SMALLINT` (1–5) for feedback rows |
| `admin_messages` | Admin-to-gym messages |

### Admin Notification Tables

These are written only by DB triggers and read only through the service-role admin API.
They have **RLS enabled with zero policies**, which denies `anon`/`authenticated` outright
while the service role (used by the admin API) bypasses RLS.

| Table | Purpose |
|-------|---------|
| `notifications` | Admin event log (`ticket`/`feedback`/`payment_request`/`new_gym`). `is_read` drives the bell badge; `pushed_at` is the push dispatch watermark |
| `device_push_tokens` | FCM registration tokens, keyed per **device** (admin auth has no per-user identity) |
| `app_config` | Private key/value store for the push dispatch URL + `CRON_SECRET` used by the `pg_net` trigger |

---

## Cron Jobs

| Schedule | Route | Purpose |
|----------|-------|---------|
| Daily 03:30 UTC | `/api/cron/whatsapp` | Process all scheduled WhatsApp reminders |
| Daily 00:00 UTC | `/api/cron/subscription` | Expire lapsed trials and subscriptions |

> **Push dispatch is intentionally not a cron.** `/api/push/dispatch` is invoked by a
> `pg_net` trigger the moment a notification row is created. A per-minute Vercel cron would
> require the Pro plan and still add up to 60s of latency; the trigger is both free and
> instant. Do not add a cron entry for it.

---

## Performance

- **Save operations**: < 1 second (optimized from 5-6s via cache parallelization, redundant query removal, atomic RPCs)
- **Dashboard**: Cached 5 minutes in Redis, with Supabase RPC fast-path
- **Members list**: Bounded membership fetches (only displayed page's members)
- **Payments**: Explicit column selects + row limits
- **Inventory**: Redis-cached with 10-minute TTL
- **WhatsApp queue**: 5 messages per 5-minute drain batch (prevents API spam flagging)

---

## Two Separate Push Systems

> **Note.** Only the Firebase (admin mobile) system exists in the current code. Web Push with
> VAPID keys belonged to the standalone member app, which has been merged into the root app
> without it. The VAPID notes below are kept for anyone who wants to add Web Push back.

The project has two unrelated push mechanisms. Keep them distinct — they use different
keys, different transports, and different audiences.

| | Member PWA (Web Push) | Admin Mobile (FCM) |
|---|---|---|
| **Audience** | Gym members in a browser / installed PWA | Super admins on the React Native app |
| **Transport** | Web Push protocol via the browser's push service | Firebase Cloud Messaging |
| **Keys** | VAPID key pair | Firebase service account + `google-services.json` |
| **Sender** | Main app | `gymflow-admin` (`/api/push/dispatch`) |

### VAPID keys (member PWA)

A VAPID key (Voluntary Application Server Identification) lets the server send Web Push
notifications to browsers and PWAs without a third-party push service account. It is a
public/private pair:

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Shared with the browser so it can subscribe to push |
| `VAPID_PRIVATE_KEY` | Stays on the server to sign outgoing push messages |

Generate a pair with:
```bash
npx web-push generate-vapid-keys
```

### Firebase credentials (admin mobile)

See [Setup step 5](#5-admin-mobile-app--push-notifications) — `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `CRON_SECRET`.

> **Never commit either key set.** `.env.local` and `google-services.json` are gitignored.
> If a service-account key is ever exposed, rotate it in the Firebase console immediately —
> revoking the old key is the only reliable fix.

---

## Self-hosting

GymFlow can be run by anyone, but it was written for one deployment, so a number of things are
specific to `gymflow.sbs`: domain names in the middleware, email sender addresses, WhatsApp
template names, links in the marketing site. [SELF_HOSTING.md](SELF_HOSTING.md) lists
every one of them and what to change.

---

## Contributing

Bug reports, fixes and improvements are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first:
it covers the workflow, the checks to run, and the rules that keep tenants isolated.

Found a security problem? Please do not open a public issue. See [SECURITY.md](SECURITY.md).

---

## License

GymFlow is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

In short: you may use, modify and self-host it, including commercially. If you run a modified
version as a service that other people use over a network, you must make your modified source
available to those users under the same license. The [LICENSE](LICENSE) file is the
authoritative text.

"GymFlow" and the GymFlow logo are names and marks of the original project. The license covers
the code, not the brand: if you run your own service, please give it your own name and logo.

© GymFlow contributors. Built for gym owners, by fitness enthusiasts.
