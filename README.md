# GymDesk — Gym Management SaaS

> Know exactly who paid, who didn't, and who's about to expire — without using notebooks.

---

## What's Inside

GymDesk is a full-stack gym management SaaS built for small to mid-size gyms in Tamil Nadu and Puducherry, India.

**Core modules:**
- **Onboarding Wizard** — 6-step first-login setup (gym details, plans, metrics, operations, marketing, AI personalization)
- **Dashboard** — live stats: active members, today's attendance, today's collection, dues
- **Members** — add, edit, bulk-edit, member detail with membership history
- **Payments** — full payment history, filter by period/mode, export to Excel, pending dues management
- **Attendance** — one-tap daily check-in, duplicate prevention, monthly calendar view
- **Dues** — members with pending amounts, WhatsApp reminder links
- **Reports** — 6-month revenue trend, plan distribution, gender/age breakdown, top areas, PDF export
- **Bulk Import** — 3-step pipeline: upload CSV/Excel → area review → edit & confirm
- **Geo Intelligence Engine** — 11-step area normalization with AI fallback (Gemini 2.0 Flash)
- **Account Settings** — edit gym name, gym info, password, danger zone

---

## Project Structure

```
GymDesk/
├── app/
│   ├── auth/login/           # Login page (no sidebar)
│   ├── onboarding/           # First-login wizard (no sidebar)
│   │   ├── page.tsx
│   │   └── OnboardingWizard.tsx
│   ├── dashboard/
│   │   ├── layout.tsx        # Auth guard + onboarding redirect
│   │   ├── page.tsx
│   │   └── DashboardClient.tsx
│   ├── members/
│   │   ├── new/page.tsx      # Add member (auto-fills plan prices from onboarding)
│   │   ├── bulk-edit/
│   │   └── [id]/edit/
│   ├── payments/
│   ├── attendance/
│   ├── dues/
│   ├── reports/
│   ├── import/
│   │   ├── page.tsx          # Auto-import (smart column detection)
│   │   ├── manual/page.tsx   # Manual column mapping
│   │   ├── review/page.tsx   # Area review + delete selected
│   │   └── edit/page.tsx     # Final edit before confirm
│   ├── account/
│   │   ├── page.tsx
│   │   └── AccountClient.tsx # Edit gym info, name, password + toast notifications
│   └── api/
│       ├── onboarding/complete/  # Saves onboarding data + plan prices
│       ├── members/
│       ├── payments/
│       ├── attendance/
│       ├── import/
│       └── geo/              # normalize, batch-normalize, search, cluster-detect, save-alias, seed
├── components/layout/
│   ├── AppShell.tsx          # Thin server wrapper
│   ├── ShellGuard.tsx        # Client: hides sidebar on /auth/ and /onboarding
│   ├── NavClient.tsx         # Sidebar + mobile bottom nav
│   └── AccountMenu.tsx       # Top-right avatar (gym initials, auth-aware)
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── geo/                  # Full geo normalization engine
│   │   ├── matchArea.ts      # matchArea, matchAreaBatch, searchLocalities (with seed fallback)
│   │   ├── aiInference.ts    # Gemini 2.0 Flash integration
│   │   ├── aliases.ts        # 1200+ static alias map
│   │   ├── normalizer.ts
│   │   └── seed-data.ts      # Client-side locality seed (fallback when DB is empty)
│   ├── import/
│   │   ├── normalizers.ts    # Shared: normalizePlan, normalizeGender, normalizeAge, etc.
│   │   └── pipeline.ts       # Shared post-parse pipeline (areas, cluster, prices, IDs)
│   ├── rateLimit.ts
│   └── utils.ts
├── types/index.ts
├── middleware.ts
├── supabase-schema.sql       # Full schema + all migrations (1–9)
└── .env.example
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

This creates all tables, indexes, RLS policies, and helper functions including the geo normalization engine.

### Step 3: Create a Gym Owner User

1. Supabase dashboard → **Authentication** → **Users** → **Add user**
2. Enter email and password
3. Log in to the app — the **onboarding wizard** will run automatically for new users

> No manual SQL insert needed for new users. The onboarding wizard creates the `gyms` row.

**For existing users (pre-onboarding):** run this once to mark them as already onboarded:
```sql
UPDATE gyms SET onboarding_completed = TRUE
WHERE onboarding_completed IS NULL OR onboarding_completed = FALSE;
```

### Step 4: Local Development

```bash
cd GymDesk
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# Add GEMINI_API_KEY for AI area inference (optional — falls back to fuzzy matching)
npm run dev
```

Open http://localhost:3000 — redirects to login, then onboarding for new users.

### Step 5: Supabase Credentials

Supabase dashboard → **Settings** → **API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Gemini API key** → `GEMINI_API_KEY` (server-only, never `NEXT_PUBLIC_`)

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
- `GEMINI_API_KEY`

After deploy, in Supabase → **Authentication** → **URL Configuration**:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`

---

## Onboarding Flow

New gym owners are automatically redirected to `/onboarding` on first login. The wizard collects:

| Step | Fields |
|------|--------|
| 1. Gym Details | Name, type, branches, city, phone, address, opening year |
| 2. Membership Plans | Plan name, duration, price, joining fee, discount, freeze option |
| 3. Business Metrics | Active members, monthly joins, trainers, revenue, expenses |
| 4. Operations | Timings, working days, attendance method, existing software |
| 5. Marketing | Lead sources, WhatsApp marketing, Instagram, reminders |
| 6. AI Personalization | Biggest challenge, main goal, notes |

- Autosaves to `localStorage` on every keystroke — safe to close and resume
- Plan prices set here auto-fill the membership fee when adding new members
- All data stored in `gyms.onboarding_data` JSONB + `gym_plan_prices` table

---

## Bulk Import Pipeline

Supports `.csv` and `.xlsx` files. Column headers are auto-detected (fuzzy matching, 40+ aliases per field).

**Pipeline stages:**
1. **Parse** — read file, detect columns, normalize all fields
2. **Area normalization** — 11-step geo pipeline per row (alias → exact → trigram → fuzzy → AI)
3. **Area review** — low-confidence areas flagged for manual review, delete selected rows
4. **Edit** — final table edit before import; preview table is independently scrollable on mobile
5. **Confirm** — preview + checkbox confirm → insert to DB; preview list is independently scrollable on mobile

**Plan normalization** handles: `monthly`, `month`, `1m`, `yearly` → `annual`, `6months` → `quarterly`, `halfyear`, numeric durations, and 40+ more aliases.

**Amount auto-fill**: if amount is missing or 0, fills from `gym_plan_prices` based on detected plan.

Both auto-import and manual-mapping import run the same shared pipeline (`lib/import/pipeline.ts`).

> **Mobile note**: The upload preview table, the edit-step preview table, and the bulk-edit changes summary all use native `overflow-y-auto` scroll — they are independently scrollable on mobile touch devices without blocking the page scroll.

---

## Geo Intelligence Engine

Area normalization pipeline (11 steps, in priority order):

1. Text normalization (lowercase, strip special chars)
2. Abbreviation expansion
3. Gym-specific alias lookup (`geo_gym_aliases` — highest priority)
4. Static alias map (`lib/geo/aliases.ts`, 1200+ entries)
5. Exact DB match (`geo_localities`)
6. DB alias table (`geo_aliases`)
7. pg_trgm trigram search
8. Multi-algorithm fuzzy scoring: `lev×0.25 + dice×0.25 + lcs×0.20 + phonetic×0.30`
9. Cluster boost (+0.20 same district, +0.08 same state)
10. Gemini 2.0 Flash AI fallback (capped at 0.85 confidence)
11. Unresolved fallback

**Confidence thresholds:** ≥0.90 auto-accept (green), 0.70–0.89 needs review (amber), <0.70 low (orange), 0 = unresolved (red).

**`searchLocalities()`** — used in add/edit member area field — tries the DB first, falls back to client-side seed data so suggestions always appear even when the `geo_localities` table is empty.

---

## Database Schema

All tables use Row Level Security scoped to `gym_id → owner_id = auth.uid()`. Each gym's data is completely isolated.

| Table | Purpose |
|-------|---------|
| `gyms` | Gym profile, `onboarding_completed`, `onboarding_data` JSONB |
| `members` | Member profiles |
| `memberships` | One row per payment/renewal |
| `attendance` | Daily check-ins (unique per member per day) |
| `gym_plan_prices` | Per-gym plan prices + joining fees (set during onboarding) |
| `geo_localities` | Canonical locality reference data (shared, not gym-scoped) |
| `geo_aliases` | Global alternate spellings |
| `geo_gym_aliases` | Gym-specific learned aliases |
| `geo_normalization_log` | Audit trail for area normalization |
| `geo_review_queue` | Unresolved areas pending manual review |

**Migrations 1–9** are all included in `supabase-schema.sql`. Run the full file on a fresh project.

---

## CSV Import Format

Headers are case-insensitive and fuzzy-matched. Any of these work for "phone": `phone`, `mobile`, `contact`, `whatsapp`, `mob`, etc.

| Field | Required | Notes |
|-------|----------|-------|
| name | Yes | Member full name |
| phone | Yes | 10-digit Indian mobile |
| plan | No | monthly / quarterly / annual (+ 40 aliases) |
| start_date | No | YYYY-MM-DD, DD/MM/YYYY, or Excel serial |
| amount | No | Auto-filled from plan prices if missing |
| payment_mode | No | cash / upi / card |
| area | No | Any locality name — normalized automatically |
| member_number | No | Auto-assigned if missing |
| gender | No | male / female / other (+ aliases) |
| age | No | Number or word form ("twenty five") |

---

## Features

| Feature | Status |
|---------|--------|
| Email/password login | ✅ |
| First-login onboarding wizard (6 steps) | ✅ |
| Sidebar hidden on login/onboarding pages | ✅ |
| Auth-aware account menu (gym initials) | ✅ |
| Dashboard with live stats | ✅ |
| Add/edit/delete members | ✅ |
| Plan price auto-fill from onboarding config | ✅ |
| Membership plans (monthly/quarterly/annual/custom) | ✅ |
| Auto expiry calculation | ✅ |
| Color-coded member status | ✅ |
| Payment recording + history | ✅ |
| Export payments to Excel | ✅ |
| One-tap attendance marking | ✅ |
| Duplicate attendance prevention | ✅ |
| WhatsApp reminders (no API) | ✅ |
| CSV/Excel bulk import (auto + manual mapping) | ✅ |
| Smart column detection (40+ aliases per field) | ✅ |
| Area normalization (11-step geo pipeline) | ✅ |
| AI area inference (Gemini 2.0 Flash) | ✅ |
| Area review page with delete selected | ✅ |
| Stale session fix (new file clears old review state) | ✅ |
| Mobile-scrollable import preview & bulk-edit preview | ✅ |
| Monthly revenue reports | ✅ |
| Plan distribution chart (per-plan bars) | ✅ |
| PDF report export | ✅ |
| Account settings with gym info edit | ✅ |
| Toast notifications on save | ✅ |
| Multi-gym isolation (RLS) | ✅ |
| Per-gym plan prices + joining fees | ✅ |

---

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript 5, Tailwind CSS 3
- **Backend**: Supabase (PostgreSQL 15, Auth, RLS)
- **AI**: Google Gemini 2.0 Flash (area inference)
- **Import**: ExcelJS (dynamically imported)
- **Dates**: date-fns
- **Icons**: Lucide React
- **Deployment**: Vercel + Supabase Cloud
