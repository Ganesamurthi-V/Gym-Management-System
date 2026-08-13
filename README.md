# GymFlow — Gym Management SaaS

> Know exactly who paid, who didn't, and who's about to expire — without using notebooks.

**GymFlow** is a full-stack gym management SaaS built for small to mid-size gyms in **Tamil Nadu and Puducherry, India**. It features WhatsApp automation, UPI payment collection via QR codes, real-time notifications, and complete multi-tenant data isolation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, React Server Components) |
| **Language** | TypeScript 5 (strict mode) |
| **Styling** | Tailwind CSS 3, Sora font (Google Fonts) |
| **Backend** | Supabase (PostgreSQL 15, Auth, Row Level Security, Realtime) |
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
| `app.gymflow.sbs` | GymFlow frontend + API | Main Next.js app |
| `graph.gymflow.sbs` | WhatsApp Graph API reverse proxy (API-only) | Same Vercel project, domain-isolated |
| `gymflow.sbs` | Bare domain → 301 redirect to `app.gymflow.sbs` | Middleware redirect |

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
| **Support System** | In-app messaging + support tickets. Real-time via Supabase Broadcast. |
| **Account Settings** | Edit gym name/info, change password, UPI setup, danger zone. |
| **Super Admin Panel** | Separate app (`/gymflow-admin`): dashboard, gyms, subscriptions, support, errors, logs. |

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

## Supabase Realtime

| Channel | Purpose |
|---------|---------|
| `gym-{id}-global-status` | Gym activation/deactivation, subscription status changes |
| `gym-{id}-requests` | Subscription request approval/rejection |
| `gym_support_realtime_{id}` | Admin messages and ticket updates to gym owner |
| `admin_subscription_requests_realtime` | New subscription requests to admin panel |
| `admin_dashboard_realtime` | Live stats updates on admin dashboard |
| `admin_support_queue_realtime` | New support tickets to admin panel |

---

## Project Structure

```
gymflow/
├── app/
│   ├── auth/                         # Login, create-account, setup-password
│   ├── onboarding/                   # 7-step wizard with UPI setup
│   ├── dashboard/                    # Live stats, quick actions
│   ├── members/                      # CRUD, bulk-edit, detail, attendance log
│   ├── payments/                     # History, export, dues
│   ├── attendance/                   # Self-service check-in/out
│   ├── dues/                         # Pending dues with inline collection
│   ├── inventory/                    # Products, variants, sales
│   ├── import/                       # Bulk import pipeline (upload, edit, review)
│   ├── subscription/                 # Payment proof submission, status
│   ├── account/                      # Settings, UPI config
│   ├── admin/                        # Super admin dashboard + subscriptions
│   └── api/
│       ├── auth/                     # Login (rate-limited), admin auth
│       ├── members/                  # Member CRUD
│       ├── payments/                 # Payment API
│       ├── attendance/               # Attendance API
│       ├── import/                   # Bulk import confirm + next-member-id
│       ├── inventory/                # Sell, delete, sales
│       ├── subscription/             # Request, status
│       ├── support/                  # Tickets, clear
│       ├── whatsapp/                 # Send, webhook, automation (welcome/renewal/due-cleared/import-batch), queue drain
│       ├── graph/[...path]/          # Secure reverse proxy to Meta Graph API
│       ├── cron/                     # Daily WhatsApp + subscription expiry crons
│       ├── health/                   # Health check
│       └── onboarding/              # Complete onboarding
├── gymflow-admin/                    # Super Admin Panel
│   ├── app/
│   │   ├── dashboard/               # Stats, Sentry errors, recent messages
│   │   ├── gyms/                    # Gym list + detail (subscription panel)
│   │   ├── subscriptions/           # All pending payment requests
│   │   ├── support/                 # Send messages, resolve tickets (realtime)
│   │   ├── errors/                  # Sentry error viewer
│   │   └── logs/                    # Event logs
│   ├── components/                  # Sidebar, error components
│   └── lib/                         # Auth (JWT), supabase-admin, supabase-browser (realtime)
├── components/
│   ├── layout/                      # ShellGuard, NavClient, AccountMenu, TrialBanner
│   ├── upi/                         # UPIPaymentModal, UPIQRSetup
│   ├── support/                     # SupportTabsClient, SupportHeaderClient
│   ├── inventory/                   # InventoryDetailClient, InventoryFilters
│   ├── import/                      # WizardHeader
│   └── ui/                          # WelcomeTransition, FitnessLoader
├── lib/
│   ├── supabase/                    # Client (browser), server, admin
│   ├── whatsapp/                    # Automation engine, queue, scheduling, sender, finalize, idempotency
│   ├── upi/                         # parseUPIQRCode, generateUPILink, generateQRCode
│   ├── import/                      # normalizers.ts, pipeline.ts
│   ├── hooks/                       # useRealtimeChannel
│   ├── graph-domain.ts             # Domain isolation config + helpers
│   ├── subscription-utils.ts       # Pure subscription state computation
│   ├── cache.ts                    # Redis cache wrapper
│   ├── cache-keys.ts              # Centralized cache key definitions
│   ├── rateLimit.ts               # Upstash rate limiter
│   ├── fetch.ts                   # Production fetch with timeout + retry + backoff
│   ├── dal.ts                     # Data Access Layer (auth, gym, subscription)
│   ├── redis.ts                   # Redis client singleton
│   ├── logger.ts                  # APM-style RequestLogger
│   └── utils.ts                   # cn(), formatDate, formatCurrency, etc.
├── services/
│   └── whatsapp/                   # graph.ts, messageProcessor, statusProcessor, validateTemplate, templateSpec
├── repositories/
│   └── whatsapp/                   # DB operations for messages, webhook logs
├── types/
│   ├── index.ts                    # Member, Membership, Attendance, DashboardStats
│   └── whatsapp.ts                # TemplateId, SendResult, webhook types
├── middleware.ts                   # Domain isolation + auth guard + subscription guard
├── vercel.json                    # Cron schedules
└── supabase/migrations/           # All DB migrations
```

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

### 1. Create Supabase Project
- Go to [supabase.com](https://supabase.com) → New project (Mumbai/Singapore region)
- Run `supabase-schema.sql` in SQL Editor

### 2. Run Migrations
Run all files in `supabase/migrations/` in order via SQL Editor.

### 3. Local Development
```bash
cd gymflow
npm install
cp .env.example .env.local   # Fill in values
npm run dev                   # http://localhost:3004
```

### 4. Deploy to Vercel
```bash
vercel
```
- Attach domains: `app.gymflow.sbs`, `graph.gymflow.sbs`
- Add all env vars in Vercel dashboard
- Set Supabase Auth → Site URL: `https://app.gymflow.sbs`

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
| `support_tickets` | Gym owner tickets |
| `admin_messages` | Admin-to-gym messages |

---

## Cron Jobs

| Schedule | Route | Purpose |
|----------|-------|---------|
| Daily 03:30 UTC | `/api/cron/whatsapp` | Process all scheduled WhatsApp reminders |
| Daily 00:00 UTC | `/api/cron/subscription` | Expire lapsed trials and subscriptions |

---

## Performance

- **Save operations**: < 1 second (optimized from 5-6s via cache parallelization, redundant query removal, atomic RPCs)
- **Dashboard**: Cached 5 minutes in Redis, with Supabase RPC fast-path
- **Members list**: Bounded membership fetches (only displayed page's members)
- **Payments**: Explicit column selects + row limits
- **Inventory**: Redis-cached with 10-minute TTL
- **WhatsApp queue**: 5 messages per 5-minute drain batch (prevents API spam flagging)

---

A VAPID key (Voluntary Application Server Identification) is used for Web Push Notifications. It lets your server send push notifications to browsers/PWAs without needing a third-party push service account.

It's a public/private key pair:

NEXT_PUBLIC_VAPID_PUBLIC_KEY — shared with the browser so it can subscribe to push
VAPID_PRIVATE_KEY — stays on your server to sign outgoing push messages
How to generate it:

Run this in any terminal where Node.js is installed:

bash

npx web-push generate-vapid-keys
It will output something like:


Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkGs-GDq6QAa...

Private Key:
UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls

## License

Private. Built for gym owners, by fitness enthusiasts.

© 2025 GymFlow. Tamil Nadu & Puducherry, India.....
