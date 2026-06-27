# GymFlow — Full Production Audit Report
**Date:** 27 June 2026
**Codebase:** Gym-Management-System-vivi-gym
**Auditor:** Automated deep-scan + manual code review
**Scope:** Main app (`/app`, `/lib`, `/components`) · Admin panel (`/gymflow-admin`) · Database schema · Build config

---

## Executive Summary

The codebase is a Next.js 15 App Router SaaS gym management platform backed by Supabase (PostgreSQL + RLS) and Upstash Redis. The overall architecture is sound. Caching, rate limiting, RLS, and a Data Access Layer (DAL) are all present. Previous audit cycles have cleared numerous critical bugs.

However, **12 issues remain** that affect latency, performance, and security before this is production-grade for a real user base. These range from a 10-second polling hammer that fires 6 network requests every 10 seconds per tab, to a full-table memberships scan that runs on every dashboard "month" filter click, to a 768 KB unoptimized PNG served with zero caching, to hardcoded Sentry credentials committed to the repo.

**Overall verdict: ⚠️ NEEDS FIXES — not production-ready at scale.**

---

## Severity Legend

| Label | Meaning |
|-------|---------|
| 🔴 P0 — Critical | Data exposure, security hole, or crash-level bug |
| 🟠 P1 — High | Significant latency or performance regression under real load |
| 🟡 P2 — Medium | Noticeable slowdown or wasted resources; won't crash but will degrade UX |
| 🟢 P3 — Low | Hygiene / best-practice issues; low user impact |

---

## Issue Index

| # | Severity | Title | File(s) |
|---|----------|-------|---------|
| 1 | 🔴 P0 | Sentry DSN hardcoded in source — public credential leak | `instrumentation-client.ts` |
| 2 | 🔴 P0 | `sendDefaultPii: true` in Sentry — PII sent to third party | `instrumentation-client.ts` |
| 3 | 🟠 P1 | 10-second polling hammers Supabase + Redis on every tab | `ShellGuard.tsx` |
| 4 | 🟠 P1 | Dashboard "month filter" fires a full memberships table scan from the client | `DashboardClient.tsx` |
| 5 | 🟠 P1 | `logo.png` is 768 KB, served unoptimized via raw `<img>` with no caching | `public/logo.png`, all pages |
| 6 | 🟠 P1 | `NewMemberPage` is a pure Client Component that re-fetches auth + gym on every interaction | `app/members/new/page.tsx` |
| 7 | 🟠 P1 | `tracesSampleRate: 1` in production — 100% Sentry tracing on every request | `instrumentation-client.ts` |
| 8 | 🟡 P2 | Missing compound index `(gym_id, date)` on `attendance` — dashboard RPC does full scan | `supabase-schema.sql` |
| 9 | 🟡 P2 | Missing compound index `(gym_id, end_date)` on `memberships` — used in dashboard RPC | `supabase-schema.sql` |
| 10 | 🟡 P2 | `aliases.ts` is a 58 KB static file bundled into every server route that imports geo logic | `lib/geo/aliases.ts` |
| 11 | 🟡 P2 | `console.log("[CLIENT] DASHBOARD_CLIENT_RENDERED")` leaks to browser console in production | `DashboardClient.tsx` |
| 12 | 🟢 P3 | Admin panel missing `CSP` and `HSTS` security headers | `gymflow-admin/next.config.js` |

---

## Detailed Findings & Fixes

---

### Issue 1 🔴 P0 — Sentry DSN hardcoded in source

**File:** `instrumentation-client.ts`

```typescript
// CURRENT — credential committed to Git
Sentry.init({
  dsn: "https://4bf63dde38b636a6a1d5480116e2601a@o4511622015156224.ingest.us.sentry.io/4511622026428416",
  ...
})
```

The Sentry DSN is a public credential that identifies your project. With it, anyone can send arbitrary events to your Sentry account, polluting your error feed, inflating event quotas, and potentially causing you to be rate-limited. It is currently committed in plaintext to the repository. If the repo is ever public or the Git history is leaked, this is permanently compromised.

**Fix:**

Move to an environment variable and regenerate the DSN in Sentry's project settings after rotating:

```typescript
// instrumentation-client.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...
})
```

```bash
# .env.local
NEXT_PUBLIC_SENTRY_DSN=https://your-new-dsn@sentry.io/...
```

Add `NEXT_PUBLIC_SENTRY_DSN` to your Vercel environment variables and rotate the DSN in Sentry → Project Settings → Client Keys. Also add `NEXT_PUBLIC_SENTRY_DSN` to `.env.example` (without the value) so future developers know it is required.

---

### Issue 2 🔴 P0 — `sendDefaultPii: true` ships PII to a third-party

**File:** `instrumentation-client.ts`

```typescript
// CURRENT
sendDefaultPii: true,
```

`sendDefaultPii: true` causes Sentry to capture user IP addresses, cookies, HTTP headers, and request bodies automatically. In India, this likely triggers obligations under the Digital Personal Data Protection Act (DPDPA) 2023. Gym member names and phone numbers flow through request bodies (e.g., on the member creation form), meaning they could be captured in Sentry error events without user consent.

**Fix:**

```typescript
// instrumentation-client.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Remove sendDefaultPii entirely (defaults to false)
  // If you need user context for debugging, set it explicitly and scrub sensitive fields:
  beforeSend(event) {
    // Strip any request body that may contain member PII
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
    }
    return event
  },
  ...
})
```

---

### Issue 3 🟠 P1 — 10-second polling hammers Supabase + Redis on every open tab

**File:** `components/layout/ShellGuard.tsx` · Line 89

```typescript
// CURRENT — fires every 10 seconds, per tab, always
const interval = setInterval(checkAuth, 10000)
```

`checkAuth` makes **two network calls** every time it fires:
1. `supabase.auth.getUser()` — a Supabase Auth network request
2. `supabase.rpc('check_gym_active', { p_email: user.email })` — a database RPC call

A single logged-in user with two browser tabs open is making **12 Supabase requests per minute** just from auth polling — before they interact with anything. With 50 concurrent users this is 600 requests/minute of polling traffic alone. This directly degrades response times for real user actions because connection pools are shared.

**Root cause:** The polling was introduced to detect admin-triggered gym deactivations, but the current interval is far too aggressive. The deactivation is a rare administrative action — there is no need to detect it within 10 seconds.

**Fix — Option A (recommended): Exponential backoff + visibility API**

```typescript
// ShellGuard.tsx
useEffect(() => {
  if (isShellless || !initialUser || !initialIsActive) return

  const supabase = createClient()
  let pollInterval = 60_000 // Start at 60 seconds

  const checkAuth = async () => {
    if (document.hidden) return // Skip if tab is not visible
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      await supabase.auth.signOut()
      window.location.href = '/auth/login'
      return
    }
    if (user.email) {
      const { data: isActive } = await supabase.rpc('check_gym_active', { p_email: user.email })
      if (isActive === false) {
        await supabase.auth.signOut()
        window.location.href = '/auth/login'
      }
    }
  }

  // Check on focus only (free), plus a conservative 60-second background poll
  window.addEventListener('focus', checkAuth)
  const interval = setInterval(checkAuth, pollInterval)

  return () => {
    window.removeEventListener('focus', checkAuth)
    clearInterval(interval)
  }
}, [isShellless, initialUser, initialIsActive])
```

**Fix — Option B (best, if Supabase Realtime is already in use):** Use a Supabase Realtime subscription on the `gyms` table filtered by `id = gym.id` and the `is_active` column. The change only fires when an admin deactivates the gym — zero polling at all.

```typescript
// Subscribe to gym deactivation via Realtime instead of polling
const channel = supabase
  .channel('gym-status')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'gyms',
    filter: `id=eq.${initialGym?.id}`,
  }, async (payload) => {
    if (payload.new.is_active === false) {
      await supabase.auth.signOut()
      window.location.href = '/auth/login'
    }
  })
  .subscribe()

return () => { supabase.removeChannel(channel) }
```

---

### Issue 4 🟠 P1 — Dashboard "month filter" fires a full memberships table scan from the client

**File:** `app/dashboard/DashboardClient.tsx` · Lines 34–57

```typescript
// CURRENT — no date filter, fetches ALL memberships for the gym
const { data: membershipsData } = await supabase
  .from('memberships')
  .select('member_id, end_date, member:members(id, name, phone, member_number)')
  .eq('gym_id', gymId)
  .order('created_at', { ascending: false })
  // ❌ No date range! Fetches every membership ever recorded.
```

When a user clicks "This Month" on the dashboard, a client-side fetch pulls **every membership record for the gym** across all time, then filters in JavaScript. For a gym with 500 members and 3 years of records, this could be 1,500–3,000 rows transferred to the browser over a mobile connection. This is a full table scan with no date predicate.

**Fix:** Add a server-side date filter. Since you control the query, add a `gte` filter for the start of the current month:

```typescript
// DashboardClient.tsx — inside the fetchMonth() function
const currentMonth = todayStr.slice(0, 7) // e.g. "2026-06"
const monthStart = `${currentMonth}-01`
const monthEnd = `${currentMonth}-31` // Postgres will clamp to last day

const { data: membershipsData } = await supabase
  .from('memberships')
  .select('member_id, end_date, member:members(id, name, phone, member_number)')
  .eq('gym_id', gymId)
  .gte('end_date', monthStart)   // ✅ Only memberships expiring this month
  .lte('end_date', monthEnd)
  .order('end_date', { ascending: true })
```

**Even better:** Move this logic to the existing `get_gym_dashboard` RPC and pass a `p_month` parameter, so it is server-side computed and cacheable via Redis. The RPC already has the infrastructure — add a `v_month_expiring` variable alongside `v_expiring_this_week`.

---

### Issue 5 🟠 P1 — `logo.png` is 768 KB served unoptimized via raw `<img>`

**Files:** `public/logo.png` (768,198 bytes), `app/dashboard/DashboardClient.tsx:131`, `app/account/AccountClient.tsx:277`, `gymflow-admin/public/logo.png` (768,198 bytes — duplicate)

The logo is served three times in the same byte-for-byte 768 KB file. It is used via a raw HTML `<img>` tag, which means:

- Next.js Image Optimization is completely bypassed
- No WebP conversion — the 768 KB PNG is sent to every device including mobile
- No `srcSet` / responsive sizing — an 8×8px icon loads a 768 KB image
- No browser cache-control headers are added by Next.js for raw `/public/` files served via `<img>`
- The file is duplicated inside `gymflow-admin/public/` — same binary, double the deploy size

**Fix:**

```typescript
// Replace raw <img> with Next.js <Image> everywhere
import Image from 'next/image'

// In DashboardClient.tsx
<Image
  src="/logo.png"
  alt="GymFlow Logo"
  width={32}
  height={32}
  className="object-contain"
  priority // above-the-fold, preload it
/>

// In AccountClient.tsx  
<Image
  src="/logo.png"
  alt="GymFlow Logo"
  width={56}
  height={56}
  className="rounded-2xl object-contain shadow-sm border border-slate-100"
/>
```

Then compress the source PNG. A gym logo at 768 KB is almost certainly a high-DPI export that was not resized. Run:

```bash
# Install sharp (already used by Next.js internally)
npx sharp-cli --input logo.png --output logo.png --resize 200 200 --format webp
# Or use squoosh-cli / imageoptim
```

A properly sized logo PNG should be under 20 KB. At 200×200px for a 2× Retina display it will be sharp everywhere. Next.js `<Image>` will serve WebP automatically to supported browsers.

**Remove the duplicate** from `gymflow-admin/public/logo.png` and either point to a CDN URL or copy it as part of the build process.

---

### Issue 6 🟠 P1 — `NewMemberPage` re-fetches auth and gym on every interaction

**File:** `app/members/new/page.tsx`

This page is a pure `'use client'` component (there is no corresponding server component). On every interaction that triggers a state change — member number blur, phone duplicate check, form submit — the code calls `supabase.auth.getUser()` and `supabase.from('gyms').select(...)` from scratch:

```typescript
// Called on member_number blur (line 63-65)
const { data: { user } } = await supabase.auth.getUser()
const { data: gym } = await supabase.from('gyms').select('id, onboarding_data').eq('owner_id', user.id).single()

// Called again in handleSubmit (line 151-154) — second auth + gym fetch
const { data: { user } } = await supabase.auth.getUser()
const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()

// Called a third time for plan saving (line 250)
const { data: gym } = await supabase.from('gyms').select('onboarding_data').eq('id', gymId).single()
```

That is **3 separate `gyms` table fetches** and **2 separate auth calls** in a single page session. The gym ID and user are completely static for the duration of the session — there is no reason to re-fetch them.

**Fix:** Fetch auth and gym once in a `useEffect` on mount, store in state, and reuse:

```typescript
// app/members/new/page.tsx
const [gymId, setGymId] = useState<string | null>(null)
const [gymOnboardingData, setGymOnboardingData] = useState<any>(null)

// Single fetch on mount — never again
useEffect(() => {
  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: gym } = await supabase
      .from('gyms')
      .select('id, onboarding_data')
      .eq('owner_id', user.id)
      .single()
    if (gym) {
      setGymId(gym.id)
      setGymOnboardingData(gym.onboarding_data)
    }
  }
  init()
}, []) // ← empty deps: runs once

// All subsequent handlers use gymId from state — no DB calls
async function handleSubmit() {
  if (!gymId) return
  // Use gymId directly — no re-fetch needed
  const { data, error } = await supabase.from('members').insert({ gym_id: gymId, ... })
}
```

**Better approach:** Convert to a Server Component that passes `gymId` and `onboardingData` as props, matching the pattern used by every other page in the app (dashboard, members, payments, account).

---

### Issue 7 🟠 P1 — `tracesSampleRate: 1` captures 100% of transactions in production

**File:** `instrumentation-client.ts`

```typescript
// CURRENT — traces EVERY request
tracesSampleRate: 1,
```

A `tracesSampleRate` of `1` means Sentry captures a performance trace for 100% of user sessions. Each trace adds overhead: header injection, span creation, and HTTP calls to Sentry's ingestion endpoint. This is appropriate in development but burns through your Sentry quota rapidly in production and adds measurable overhead to every page load (typically 5–15ms per request for the instrumentation overhead).

**Fix:**

```typescript
// instrumentation-client.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // 10% sampling in production captures plenty of data for performance analysis
  // while keeping quota usage manageable

  replaysSessionSampleRate: 0.05, // Reduce from 10% to 5% in production
  replaysOnErrorSampleRate: 1.0,  // Keep 100% on errors — this is valuable
})
```

Also consider using `tracesSampler` for finer control — excluding health check endpoints and static asset requests from tracing entirely:

```typescript
tracesSampler: (samplingContext) => {
  const url = samplingContext.request?.url ?? ''
  if (url.includes('/api/health') || url.includes('/_next/')) return 0
  return 0.1
},
```

---

### Issue 8 🟡 P2 — Missing compound index `(gym_id, date)` on `attendance`

**File:** `supabase-schema.sql`

The database has three separate single-column indexes on `attendance`:

```sql
-- CURRENT — three separate single-column indexes
CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance(gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);
```

The dashboard RPC and attendance page both query with `WHERE gym_id = p_gym_id AND date = p_today`. PostgreSQL can use either the `gym_id` or `date` index for this query, but not both simultaneously via a standard B-tree merge. For a gym with 1,000 attendance records and a busy date, this means scanning more rows than necessary.

The most common query pattern is "attendance for gym X on date Y" — this should have a covering index.

**Fix — add a migration:**

```sql
-- supabase/migrations/20260627_perf_indexes.sql

-- Compound index for the most common attendance query pattern
CREATE INDEX IF NOT EXISTS idx_attendance_gym_date 
  ON attendance(gym_id, date);

-- This replaces the need to use both separate indexes in conjunction.
-- The existing idx_attendance_gym_id and idx_attendance_date can be kept
-- for queries that filter on only one column.
```

Run via Supabase migrations:
```bash
supabase db push
```

---

### Issue 9 🟡 P2 — Missing compound index `(gym_id, end_date)` on `memberships`

**File:** `supabase-schema.sql`

The dashboard RPC (`get_gym_dashboard`) and the "expiring members" logic filter memberships by `WHERE m.gym_id = p_gym_id` and then evaluate `end_date` for status classification. The existing indexes are:

```sql
idx_memberships_gym_id   ON memberships(gym_id)        -- single column
idx_memberships_end_date ON memberships(end_date)       -- single column (no gym_id!)
idx_memberships_start_date ON memberships(gym_id, start_date) -- compound, wrong column
```

The `idx_memberships_end_date` index has no `gym_id`, meaning it covers all gyms. When the planner uses it for a gym-scoped query, it must re-filter by `gym_id` after the index scan. A compound `(gym_id, end_date)` index would allow an index-only scan for the expiry status logic.

**Fix:**

```sql
-- supabase/migrations/20260627_perf_indexes.sql (add to same migration as Issue 8)

-- Compound index for expiry status queries (dashboard RPC, expiring members)
CREATE INDEX IF NOT EXISTS idx_memberships_gym_end_date
  ON memberships(gym_id, end_date);
```

---

### Issue 10 🟡 P2 — `aliases.ts` is a 58 KB static dictionary bundled into server routes

**File:** `lib/geo/aliases.ts`

`ALIAS_MAP` is a 1,222-line, 58,002-byte JavaScript object containing Tamil Nadu / Puducherry location aliases. It is imported directly in:

- `app/api/geo/normalize/route.ts`
- `app/api/geo/batch-normalize/route.ts`

In a Vercel serverless deployment, this file is included in the Lambda bundle for those routes. A 58 KB module is not catastrophic, but it contributes to cold-start time since Node.js must parse and evaluate it on first invocation. Additionally, the in-memory dictionary is rebuilt from scratch on every cold start.

**Fix Option A — Use the `geo_aliases` database table instead:**

The schema already has a `geo_aliases` table with a GIN trigram index (`idx_geo_localities_trgm`). The in-memory `ALIAS_MAP` was originally a faster alternative to DB lookups, but with a properly indexed table and Supabase connection pooling, a DB alias lookup will be comparable in speed and avoids the bundle size penalty.

```typescript
// lib/geo/matchArea.ts — replace ALIAS_MAP lookup with DB lookup
const { data: alias } = await supabase
  .from('geo_aliases')
  .select('canonical_name')
  .eq('alias_normalized', normalizedInput)
  .single()

if (alias) return { matched_by: 'alias', value: alias.canonical_name }
```

**Fix Option B — Lazy load the alias map:**

If the in-memory approach is preferred for speed, lazy-load the module so it is only parsed when the geo routes are actually invoked:

```typescript
// In normalize/route.ts
let ALIAS_MAP: Record<string, string> | null = null

async function getAliasMap() {
  if (!ALIAS_MAP) {
    const mod = await import('@/lib/geo/aliases')
    ALIAS_MAP = mod.ALIAS_MAP
  }
  return ALIAS_MAP
}
```

---

### Issue 11 🟡 P2 — Debug `console.log` committed in production client code

**File:** `app/dashboard/DashboardClient.tsx` · Line 22

```typescript
// CURRENT — ships to every user's browser console
console.log("[CLIENT] DASHBOARD_CLIENT_RENDERED")
```

This log fires in production on every dashboard render for every user. While harmless, it exposes internal component names to any user who opens DevTools and is contrary to the `removeConsole` compiler option already configured in `next.config.js` (which only removes `console.log` at build time — this one will remain in development builds and any non-production Vercel preview deployments).

**Fix:**

Remove the line entirely. If render debugging is needed in development:

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log("[CLIENT] DASHBOARD_CLIENT_RENDERED")
}
```

---

### Issue 12 🟢 P3 — Admin panel missing `CSP` and `HSTS` headers

**File:** `gymflow-admin/next.config.js`

The admin panel has a minimal `headers()` config with only three headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`). The main app has a full Content Security Policy and `Strict-Transport-Security`. The admin panel — which has access to all gym data and support tickets — has neither.

**Fix:**

```javascript
// gymflow-admin/next.config.js
const adminSecurityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/(.*)', headers: adminSecurityHeaders }]
  },
}
```

---

## Performance Impact Summary

The table below maps each issue to its estimated latency contribution in a real production scenario (50 active users, mixed mobile/desktop):

| Issue | Latency Impact | Frequency |
|-------|---------------|-----------|
| 10s polling (Issue 3) | +100–200ms per auth check; 12 req/min/user just from polling | Every 10s per open tab |
| Full memberships scan (Issue 4) | +300–800ms on "month" filter click; scales with gym size | On filter toggle |
| 768 KB logo PNG (Issue 5) | +1.5–3s on first load on a 3G/4G mobile connection | Every first page load |
| New member page re-fetches (Issue 6) | +80–200ms per interaction (member ID blur, submit) | On every form interaction |
| Sentry 100% sampling (Issue 7) | +5–15ms overhead per request; quota exhaustion risk | Every request |
| Missing compound indexes (Issues 8–9) | +10–50ms per dashboard load as data grows | Every dashboard page load |
| `aliases.ts` bundle (Issue 10) | +20–80ms cold start on geo API routes | Cold starts |

---

## Confirmed Working (From Previous Audits)

The following previously identified issues are confirmed fixed in this build and require no further action:

- ✅ `gymflow-admin /api/check-db` authentication (now has `verifyRequestAuth` guard)
- ✅ Cache invalidation after member add / payment / import — all mutation paths covered
- ✅ RLS `idx_gyms_id_owner` compound index — present in schema
- ✅ Attendance route member IDOR — ownership check in place
- ✅ Rate limiting on all API routes including attendance
- ✅ `support_tickets` UPDATE RLS policy — present
- ✅ `AppShell` — `getGymActiveStatus` and `getUnreadAdminMessages` are cached via `cacheWrapper`
- ✅ DAL memoization via `React.cache()` — `getAuthUser` and `getGym` deduplicated per render
- ✅ Dashboard RPC (`get_gym_dashboard`) — Postgres-side aggregation, JS fallback present
- ✅ `removeConsole` in production builds — configured in `next.config.js`
- ✅ `optimizePackageImports` for `lucide-react` and `date-fns`
- ✅ ExcelJS kept server-side via `serverExternalPackages`
- ✅ Chunk splitting for Supabase and date-fns bundles
- ✅ Middleware fast-path — non-protected routes skip auth check immediately

---

## Fix Priority Roadmap

### Phase 1 — Do Before Any Real Traffic (P0/P1)

1. **Rotate Sentry DSN** and move to env var (Issue 1)
2. **Remove `sendDefaultPii: true`** (Issue 2)
3. **Reduce polling from 10s to 60s** or switch to Realtime subscription (Issue 3)
4. **Add date filter to dashboard month query** (Issue 4)
5. **Replace `<img>` with `<Image>`** and compress logo.png to <20 KB (Issue 5)

### Phase 2 — Before Scaling Past 100 Users (P1/P2)

6. **Consolidate NewMemberPage fetches** to a single mount-time init (Issue 6)
7. **Set `tracesSampleRate: 0.1`** in production Sentry config (Issue 7)
8. **Add compound database indexes** `(gym_id, date)` and `(gym_id, end_date)` (Issues 8–9)

### Phase 3 — Ongoing Hygiene (P2/P3)

9. **Migrate aliases.ts** to DB lookup or lazy-load (Issue 10)
10. **Remove debug console.log** from DashboardClient (Issue 11)
11. **Add full security headers** to gymflow-admin (Issue 12)

---

## SQL Migration for Issues 8 & 9

Save this as `supabase/migrations/20260627_perf_indexes.sql`:

```sql
-- Performance indexes for Issues 8 & 9
-- Compound index for attendance queries (gym + date together)
CREATE INDEX IF NOT EXISTS idx_attendance_gym_date
  ON attendance(gym_id, date);

-- Compound index for membership expiry queries (gym + end_date together)
-- This supersedes the single-column idx_memberships_end_date for gym-scoped queries
CREATE INDEX IF NOT EXISTS idx_memberships_gym_end_date
  ON memberships(gym_id, end_date);

-- Optional: also add (gym_id, pending_amount) for the dues query in dashboard
CREATE INDEX IF NOT EXISTS idx_members_gym_dues
  ON members(gym_id, pending_amount)
  WHERE pending_amount > 0; -- Partial index: only rows with actual dues
```

---
