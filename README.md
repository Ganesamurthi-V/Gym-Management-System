# GymFlow — Gym Management SaaS

> Know exactly who paid, who didn't, and who's about to expire — without using notebooks.

**GymFlow** is a full-stack gym management SaaS built for small to mid-size gyms in **Tamil Nadu and Puducherry, India**. It features intelligent area normalization powered by AI, a premium mobile-first UI, and complete multi-tenant data isolation..

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, React Server Components) |
| **Language** | TypeScript 5 (strict mode) |
| **Styling** | Tailwind CSS 3, Sora font (Google Fonts) |
| **Backend** | Supabase (PostgreSQL 15, Auth, Row Level Security) |
| **Caching** | Upstash Redis (Serverless HTTP/REST caching) |
| **AI** | Google Gemini 2.0 Flash (area inference fallback) |
| **Animations** | Framer Motion, CSS keyframe animations |
| **Charts** | Recharts 3, custom Tailwind bar charts |
| **Import** | ExcelJS (dynamically imported, server-side only) |
| **PDF** | jsPDF + jspdf-autotable, HTML-based daily collection reports |
| **Dates** | date-fns 3 |
| **Icons** | Lucide React + custom SVG icon components |
| **Maps** | Google Places Autocomplete (city field in onboarding) |
| **Deployment** | Vercel + Supabase Cloud |

---

## Core Modules

| Module | Description |
|--------|-------------|
| **Onboarding Wizard** | 6-step first-login setup (gym details, plans, metrics, operations, marketing, AI personalization). Autosaves to `localStorage`. |
| **Dashboard** | Live stats grid (active members, attendance, expiring, expired, today's collection, total dues). Getting Started checklist with celebration modal. Quick actions panel. |
| **Members** | Full CRUD + bulk edit. Member detail with membership history. Auto-generated `GF`-prefixed IDs (e.g. `GF0001`). Area autocomplete with confidence dots. |
| **Payments** | Payment history with period/mode filters. Export to Excel. Pending dues management. |
| **Attendance** | One-tap daily check-in. Duplicate prevention via DB unique constraint `(member_id, date)`. Monthly calendar view. |
| **Dues** | Members with pending amounts. WhatsApp reminder deep-links. |
| **Reports** | 6-month revenue trend, plan distribution, gender/age breakdown, attendance by day, top areas, new members/month. PDF export. Scroll-reveal animations via Framer Motion. |
| **Bulk Import** | 5-stage pipeline: Parse → Area Normalize → Area Review → Edit → Confirm. Supports `.csv` and `.xlsx`. Smart column detection with 40+ aliases per field. |
| **Geo Intelligence Engine** | 11-step area normalization pipeline with AI fallback (Gemini 2.0 Flash). 1200+ static aliases. Client-side seed data fallback. |
| **Account Settings** | Edit gym name, gym info (type, city, phone, address, opening year, branches), change password. Toast notifications. Danger zone. |
| **Observability & Caching** | Request-scoped APM-style logger (`RequestLogger`) for granular performance tracing. Upstash Redis caching for heavy reports (1 RPC -> Cache architecture). |
| **Support System** | In-app messaging for owners to contact admins. Includes real-time notifications via Supabase Broadcast and a dedicated history center. |
| **Super Admin Panel** | Separate Next.js app (`/gymflow-admin`) for global oversight, support ticket resolution, and system health monitoring. |

---

## Project Structure

```
gymflow/
├── app/
│   ├── layout.tsx                    # Root layout (Sora font, SmoothScrollProvider, AppShell)
│   ├── globals.css                   # Design system (btn-primary, card, skeleton, animations)
│   ├── page.tsx                      # Root redirect
│   ├── auth/login/page.tsx           # Split-screen login with welcome transition animation
│   ├── onboarding/
│   │   ├── page.tsx                  # Server component — fetches gym data
│   │   └── OnboardingWizard.tsx      # 6-step wizard (1236 lines), Google Places city autocomplete
│   ├── dashboard/
│   │   ├── layout.tsx                # Auth guard + onboarding redirect
│   │   ├── page.tsx                  # Server component — parallel data fetching via Promise.all
│   │   ├── DashboardClient.tsx       # Stats grid, expiring members, quick actions, daily PDF
│   │   ├── GettingStartedChecklist.tsx # 5-task checklist with confetti celebration modal
│   │   └── loading.tsx               # Skeleton loader
│   ├── members/
│   │   ├── page.tsx + MembersClient.tsx  # Member list with search, filter, sort
│   │   ├── new/page.tsx              # Add member form (plan price auto-fill from onboarding)
│   │   ├── [id]/edit/                # Edit member
│   │   ├── bulk-edit/                # Bulk edit with native scrollable preview
│   │   └── loading.tsx               # Skeleton loader
│   ├── payments/
│   │   ├── page.tsx + PaymentsClient.tsx  # Payment history, Excel export
│   │   └── loading.tsx
│   ├── attendance/
│   │   ├── page.tsx + AttendanceClient.tsx  # One-tap check-in
│   │   └── loading.tsx
│   ├── dues/
│   │   ├── page.tsx + DuesClient.tsx  # Pending dues, WhatsApp reminders
│   │   └── loading.tsx
│   ├── reports/
│   │   ├── page.tsx                  # Server component — 7 parallel Supabase queries
│   │   ├── ReportsClient.tsx         # Charts, PDF export (63KB — largest component)
│   │   └── loading.tsx
│   ├── import/
│   │   ├── page.tsx                  # Auto-import with smart column detection (41KB)
│   │   ├── review/page.tsx           # Area review + delete selected
│   │   └── edit/page.tsx             # Final edit before confirm
│   ├── account/
│   │   ├── page.tsx + AccountClient.tsx  # Gym info edit, password change, toast
│   │   └── layout.tsx
│   └── api/
│       ├── onboarding/complete/      # POST: saves onboarding data + plan prices
│       ├── members/                  # Member CRUD API
│       ├── payments/                 # Payment API
│       ├── attendance/               # Attendance API
│       ├── import/                   # Bulk import final insert
│       ├── account/                  # Account management
│       └── geo/                      # Geo normalization engine API
│           ├── normalize/            # POST: single area normalization
│           ├── batch-normalize/      # POST: batch (up to 200 inputs)
│           ├── search/               # GET: autocomplete search
│           ├── cluster-detect/       # POST: dataset cluster detection
│           ├── save-alias/           # POST: save gym-specific alias
│           └── seed/                 # POST: populate geo_localities (run once)
├── gymflow-admin/                    # Super Admin Panel (Separate Next.js app)
│   ├── app/                          # Admin routes (Dashboard, Support, Auth)
│   ├── components/                   # Admin UI components
│   └── lib/                          # Admin auth & helpers
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx              # Thin server wrapper
│   │   ├── ShellGuard.tsx            # Client: hides sidebar on /auth/ and /onboarding
│   │   ├── NavClient.tsx             # Desktop sidebar (collapsible) + mobile slide-up drawer
│   │   ├── BottomNav.tsx             # Mobile bottom navigation bar
│   │   └── AccountMenu.tsx           # Top-right avatar (auth-aware, onAuthStateChange)
│   ├── ui/
│   │   └── FitnessLoader.tsx         # Centered dumbbell loading animation
│   ├── providers/
│   │   └── SmoothScrollProvider.tsx   # Scroll provider wrapper (root-level)
│   ├── import/                       # Import-specific components
│   └── location/                     # Location/area components
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Browser Supabase client
│   │   └── server.ts                 # Server-side Supabase client (RSC/API routes)
│   ├── geo/                          # Geo Intelligence Engine
│   │   ├── matchArea.ts              # matchArea(), matchAreaBatch(), searchLocalities()
│   │   ├── aiInference.ts            # Gemini 2.0 Flash integration
│   │   ├── aliases.ts                # 1200+ static alias map (58KB)
│   │   ├── normalizer.ts             # normalizeInput(), toPhoneticKey()
│   │   ├── fuzzyMatch.ts             # levenshtein, diceCoefficient, lcs, combinedSimilarity
│   │   ├── clustering.ts             # Cluster detection + voting algorithm
│   │   ├── seed-data.ts              # Client-side locality seed (29KB, fallback)
│   │   └── types.ts                  # NormalizationResult, DatasetCluster, confidence constants
│   ├── import/
│   │   ├── normalizers.ts            # normalizePlan, normalizeGender, normalizeAge, normalizeDate, etc.
│   │   └── pipeline.ts              # Shared 6-stage post-parse pipeline
│   ├── hooks/
│   ├── pdf.ts                        # HTML-based daily collection PDF (print window)
│   ├── rateLimit.ts                  # In-memory per-user rate limiter
│   ├── timeout.ts                    # Request timeout utility
│   ├── utils.ts                      # cn(), formatDate, formatCurrency, buildWhatsAppLink, etc.
│   └── areas.ts                      # Legacy sync matcher (kept for phonetic reference)
├── types/
│   └── index.ts                      # Member, Membership, Attendance, DashboardStats, etc.
├── utils/location/                   # Location utility helpers
├── services/location/                # Location service layer
├── middleware.ts                      # Auth guard for protected routes
├── next.config.js                     # Chunk splitting, ExcelJS server-only, tree-shaking
├── tailwind.config.js                 # brand-* colors, Sora font, surface tokens
├── supabase-schema.sql                # Full schema + all migrations (1–10)
└── .env.example                       # Required environment variables
```

---

## Design System

### Typography
- **Primary font**: Sora (Google Fonts, loaded via `next/font`)
- **CSS variable**: `--font-sora`

### Color Palette (Tailwind tokens)

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-500` | `#2563EB` | Primary actions, buttons, active states |
| `brand-600` | `#1D4ED8` | Hover states, gradients |
| `brand-50` | `#EFF6FF` | Light backgrounds |
| `cyan-400/500` | `#22D3EE` / `#06B6D4` | Attendance, secondary accents |
| `emerald` | Tailwind default | Success, active status, WhatsApp |
| `amber` | Tailwind default | Warning, expiring status |
| `red` | Tailwind default | Error, expired status, dues |

### Component Classes (defined in `globals.css`)

| Class | Purpose |
|-------|---------|
| `btn-primary` | Gradient brand button with shadow |
| `btn-secondary` | White bordered button |
| `btn-ghost` | Minimal text button |
| `input-field` | Styled input with focus ring |
| `card` | White card with border + shadow |
| `status-active` / `status-expiring` / `status-expired` | Member status badges |
| `skeleton` | Shimmer loading placeholder |
| `glass` | Glassmorphism effect |
| `no-scrollbar` | Hide scrollbar utility |

### Custom Animations
`animate-spin-slow`, `animate-bounce-dot`, `animate-progress-bar`, `animate-fill-bar`, `animate-pop-in`, `animate-lift`, `animate-pulse-soft`, `animate-slide-up`

---

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required for AI area inference (falls back to fuzzy matching without it)
GEMINI_API_KEY=your_gemini_api_key          # Server-only — NEVER use NEXT_PUBLIC_

# Optional Caching (Gracefully degrades to no-cache if missing)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

# Optional
NEXT_PUBLIC_APP_URL=your_vercel_deployment_link
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key  # City autocomplete in onboarding
```

---

## Setup Instructions

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to India (Mumbai / Singapore)
3. Wait for the project to be ready (~2 min)

### Step 2: Run Database Schema

1. Supabase dashboard → **SQL Editor**
2. Paste the entire content of `supabase-schema.sql`
3. Click **Run**

This creates all tables, indexes, RLS policies, helper functions, and the geo normalization engine. Includes migrations 1–10.

### Step 3: Create a Gym Owner User

1. Supabase dashboard → **Authentication** → **Users** → **Add user**
2. Enter email and password
3. Log in to the app — the **onboarding wizard** runs automatically for new users

> No manual SQL insert needed. The onboarding wizard creates the `gyms` row and `gym_plan_prices`.

**For existing users (pre-onboarding):**
```sql
UPDATE gyms SET onboarding_completed = TRUE
WHERE onboarding_completed IS NULL OR onboarding_completed = FALSE;
```

### Step 4: Local Development

```bash
cd gymflow
npm install
cp .env.example .env.local
# Fill in environment variables
npm run dev
```

Open http://localhost:3000 — redirects to login, then onboarding for new users.

### Step 5: Seed Geo Data (Optional)

After first deployment, call the seed endpoint once to populate `geo_localities`:
```
POST /api/geo/seed
```

---

## Deployment to Vercel

```bash
# Option A: CLI
npm install -g vercel
vercel

# Option B: GitHub → vercel.com → New Project → Import repo
```

Add environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY` (server-only)

After deploy, in Supabase → **Authentication** → **URL Configuration**:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`

---

## Database Schema

All tables use **Row Level Security** scoped to `gym_id → owner_id = auth.uid()`. Each gym's data is completely isolated.

### Core Tables

| Table | Purpose | Scoped |
|-------|---------|--------|
| `gyms` | Gym profile, `onboarding_completed`, `onboarding_data` JSONB, city, phone, GST | By `owner_id` |
| `members` | Member profiles (name, phone, gender, age, area, pending_amount, legacy_member_id, Google Places metadata) | By `gym_id` |
| `memberships` | One row per payment/renewal (plan, dates, amount, admission_fee, payment_mode) | By `gym_id` |
| `attendance` | Daily check-ins, unique per `(member_id, date)` | By `gym_id` |
| `gym_plan_prices` | Per-gym plan prices + joining fees (monthly, quarterly, annual) | By `gym_id` |
| `support_tickets` | Support messages sent from gyms to the admin | By `gym_id` |
| `admin_messages` | Responses and broadcast messages from admin to gyms | By `gym_id` |

### Geo Tables

| Table | Purpose | Scoped |
|-------|---------|--------|
| `geo_localities` | Canonical locality reference data (name, district, state, coordinates) | Shared (all gyms) |
| `geo_aliases` | Global alternate spellings → canonical locality | Shared |
| `geo_gym_aliases` | Gym-specific learned aliases (highest priority) | By `gym_id` |
| `geo_normalization_log` | Audit trail for area normalization | By `gym_id` |
| `geo_review_queue` | Unresolved areas pending manual review | By `gym_id` |

### Key Constraints
- `members(gym_id, phone)` — unique phone per gym
- `members(gym_id, member_number)` — unique member number per gym
- `attendance(member_id, date)` — prevents duplicate daily check-ins
- `memberships.plan` — CHECK: `monthly | quarterly | annual`

### Migrations (all in `supabase-schema.sql`)
1. Add gender, area, pending_amount to members
2. Add member_number with auto-assignment
3. Add admission_fee to memberships
4. Performance indexes
5. Add age to members
6. Geo normalization engine (full table set + functions)
7. Add city, gst_number, phone to gyms
8. Onboarding system (onboarding_completed, onboarding_data)
9. Joining fees per plan in gym_plan_prices
10. Google Places hybrid geo metadata on members

---

## Onboarding Flow

New gym owners are automatically redirected to `/onboarding` on first login:

| Step | Fields |
|------|--------|
| 1. Gym Details | Name*, type, branches, city (Google Places), phone, address, opening year |
| 2. Membership Plans | Plan name, duration, price, joining fee, discount, freeze option |
| 3. Business Metrics | Active members, monthly joins, trainers, revenue, expenses |
| 4. Operations | Timings (split shift support), working days, attendance method, existing software |
| 5. Marketing | Lead sources, WhatsApp marketing, Instagram, reminders |
| 6. AI Personalization | Biggest challenge, main goal, notes |

- Autosaves to `localStorage` on every keystroke — safe to close and resume
- Plan prices auto-fill membership fees when adding new members
- All data stored in `gyms.onboarding_data` JSONB + `gym_plan_prices` table

---

## Bulk Import Pipeline

Supports `.csv` and `.xlsx` files. Column headers are auto-detected via fuzzy matching with 40+ aliases per field.

### Pipeline Stages (in `lib/import/pipeline.ts`)
1. **Parse** — Read file, detect columns, normalize all fields via `lib/import/normalizers.ts`
2. **Area batch normalization** — 11-step geo pipeline per row (batched in groups of 50)
3. **Cluster detection** — Determines dominant district/state for boost scoring
4. **Plan price auto-fill** — Fills missing amounts from `gym_plan_prices`
5. **Phone dedup** — Marks duplicates within file AND against database
6. **Member ID assignment** — Auto-assigns IDs, preserves legacy IDs on conflict

### Supported Import Fields

| Field | Required | Notes |
|-------|----------|-------|
| name | Yes | Member full name |
| phone | Yes | 10-digit Indian mobile |
| plan | No | monthly / quarterly / annual (+ 40 aliases) |
| start_date | No | YYYY-MM-DD, DD/MM/YYYY, or Excel serial number |
| amount | No | Auto-filled from plan prices if missing |
| payment_mode | No | cash / upi / card (+ 20 aliases) |
| area | No | Any locality name — normalized automatically |
| member_number | No | Auto-assigned if missing; legacy IDs preserved |
| gender | No | male / female / other (+ aliases like m/f/boy/girl) |
| age | No | Number or word form ("twenty five") |

> **Mobile note**: Preview tables use native `overflow-y-auto` scroll — independently scrollable on touch devices.

---

## Geo Intelligence Engine

### Normalization Pipeline (11 steps, priority order)

1. **Text normalization** — lowercase, strip special chars, trim
2. **Abbreviation expansion** — common Indian locality abbreviations
3. **Gym-specific alias** — `geo_gym_aliases` table (highest priority, gym-scoped)
4. **Static alias map** — `lib/geo/aliases.ts` (1200+ entries, 58KB)
5. **Exact DB match** — `geo_localities` table
6. **DB alias table** — `geo_aliases` table
7. **pg_trgm trigram search** — PostgreSQL trigram similarity (threshold > 0.15)
8. **Multi-algorithm fuzzy scoring** — `lev×0.25 + dice×0.25 + lcs×0.20 + phonetic×0.30`
9. **Cluster boost** — +0.20 same district, +0.08 same state (batch only)
10. **Gemini 2.0 Flash AI fallback** — capped at 0.85 confidence, cached in `geo_ai_cache`
11. **Unresolved fallback** — flagged for manual review

### Confidence Thresholds
| Score | Color | Action |
|-------|-------|--------|
| ≥ 0.90 | 🟢 Green | Auto-accept |
| 0.70 – 0.89 | 🟡 Amber | Needs review |
| < 0.70 | 🟠 Orange | Low confidence |
| 0 | 🔴 Red | Unresolved |

### Phonetic Key Rules
`ph→f`, `ck→k`, deduplicate consecutive vowels/consonants, `yan→an`, `iya→ia`, `ea→e`, `ou→u`, strip trailing vowels

### `searchLocalities()`
Used in add/edit member area field — tries the DB first, falls back to client-side seed data (`lib/geo/seed-data.ts`, 29KB) so suggestions always appear even when the `geo_localities` table is empty.

---

## Authentication & Routing

### Middleware (`middleware.ts`)
- Protects: `/dashboard`, `/members`, `/payments`, `/attendance`, `/reports`, `/dues`, `/import`
- Redirects unauthenticated users to `/auth/login`
- Redirects authenticated users away from `/auth/*` to `/dashboard`
- Uses `@supabase/ssr` for cookie-based session management

### Layout Guards
- `dashboard/layout.tsx` — Redirects to `/onboarding` if gym is null OR `onboarding_completed === false`
- `ShellGuard.tsx` — Hides sidebar + header on `/auth/` and `/onboarding` routes

### Login Page
- Split-screen design: dark branded hero (left) + clean login form (right)
- Animated grid background with floating particles
- Welcome transition animation on successful login (checkmark → progress bar → redirect)
- Mobile-responsive: full-width form on small screens

---

## Key Patterns & Conventions

### TypeScript Types (`types/index.ts`)
- `Plan`: `'monthly' | 'quarterly' | 'annual' | 'custom'`
- `PaymentMode`: `'cash' | 'upi' | 'card'`
- `MemberStatus`: `'active' | 'expiring' | 'expired'`
- `Member`, `Membership`, `Attendance`, `MemberWithStatus`, `DashboardStats`
- `formatMemberId(num)` → `"GF0001"`, `parseMemberId(raw)` → `42`

### Utility Functions (`lib/utils.ts`)
- `cn()` — clsx + tailwind-merge for conditional classes
- `formatDate()` — `dd MMM yyyy` format via date-fns
- `formatCurrency()` — Indian Rupee, `en-IN` locale, no decimals
- `buildWhatsAppLink()` / `buildCustomWhatsAppLink()` — WhatsApp deep-links with encoding
- `getMemberStatus()` — status from end_date (active/expiring/expired)
- `calcEndDate()` — calculate membership end date from plan

### Naming Conventions
- **Variables**: camelCase
- **Components/Types**: PascalCase
- **DB columns**: snake_case
- **Member IDs**: `GF`-prefixed zero-padded 4 digits (e.g. `GF0042`)

### Performance Optimizations (`next.config.js`)
- **Redis Caching**: Heavy report queries consolidated into a single Supabase RPC and cached in Upstash Redis.
- ExcelJS kept server-side only via `serverExternalPackages`
- Tree-shaking for lucide-react and date-fns via `optimizePackageImports`
- Aggressive chunk splitting: Supabase and date-fns in separate bundles
- `console.log` removed in production (keeps `error` and `warn`)

---

## Features

| Feature | Status |
|---------|--------|
| Email/password login with animated welcome transition | ✅ |
| First-login onboarding wizard (6 steps) | ✅ |
| Getting Started checklist with confetti celebration | ✅ |
| Sidebar hidden on login/onboarding pages | ✅ |
| Collapsible desktop sidebar with hover-expand | ✅ |
| Mobile slide-up drawer navigation | ✅ |
| Auth-aware account menu (gym initials, onAuthStateChange) | ✅ |
| Dashboard with live stats (6-card grid) | ✅ |
| Add/edit/delete members | ✅ |
| Bulk edit members | ✅ |
| Plan price auto-fill from onboarding config | ✅ |
| GF-prefixed member IDs with legacy ID preservation | ✅ |
| Membership plans (monthly/quarterly/annual/custom) | ✅ |
| Auto expiry calculation | ✅ |
| Color-coded member status badges | ✅ |
| Payment recording + history | ✅ |
| Export payments to Excel | ✅ |
| Daily collection PDF generation | ✅ |
| One-tap attendance marking | ✅ |
| Duplicate attendance prevention | ✅ |
| WhatsApp reminders (individual + bulk) | ✅ |
| CSV/Excel bulk import (auto + manual mapping) | ✅ |
| Smart column detection (40+ aliases per field) | ✅ |
| Area normalization (11-step geo pipeline) | ✅ |
| AI area inference (Gemini 2.0 Flash) | ✅ |
| Area review page with delete selected | ✅ |
| Google Places hybrid geo metadata | ✅ |
| Upstash Redis caching for heavy reports | ✅ |
| Monthly revenue reports with Recharts | ✅ |
| Plan distribution, gender/age breakdown charts | ✅ |
| Scroll-reveal chart animations (Framer Motion) | ✅ |
| PDF report export | ✅ |
| Account settings with gym info edit | ✅ |
| Toast notifications on save | ✅ |
| Multi-gym isolation (RLS) | ✅ |
| Per-gym plan prices + joining fees | ✅ |
| Skeleton loading states for all major routes | ✅ |
| Mobile-scrollable import/bulk-edit previews | ✅ |
| Rate limiting on geo API routes | ✅ |
| Server-side rate limiter (per-user, per-route) | ✅ |
| Structured APM-style request logging | ✅ |
| Admin Panel for global system oversight | ✅ |
| In-app Support Ticketing system | ✅ |
| Real-time WebSocket notifications via Supabase Broadcast | ✅ |
| Dedicated Support Notification Center for owners | ✅ |
| Secure "Clear All" notification logic via Service Role | ✅ |
| Complete global rebranding to GymFlow | ✅ |

---

## API Routes

| Route | Method | Purpose | Rate Limit |
|-------|--------|---------|------------|
| `/api/onboarding/complete` | POST | Save onboarding data + plan prices | — |
| `/api/members/*` | CRUD | Member management | — |
| `/api/payments/*` | CRUD | Payment management | — |
| `/api/attendance/*` | CRUD | Attendance management | — |
| `/api/import/*` | POST | Bulk import final insert | — |
| `/api/account/*` | PATCH | Account settings | — |
| `/api/geo/normalize` | POST | Single area normalization | 5/user/min |
| `/api/geo/batch-normalize` | POST | Batch area normalization (max 200) | 2/user/min |
| `/api/geo/search` | GET | Area autocomplete search | — |
| `/api/geo/cluster-detect` | POST | Dataset cluster detection | — |
| `/api/geo/save-alias` | POST | Save gym-specific alias | 20/user/min |
| `/api/geo/seed` | POST | Populate geo_localities (run once) | — |

---

npx vitest run __tests__/whatsapp/scheduling.test.ts

## License

Private. Built for gym owners, by fitness enthusiasts.

© 2026 GymFlow. Tamil Nadu & Puducherry, India..
