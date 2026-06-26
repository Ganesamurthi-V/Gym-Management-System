# GymFlow — Final Production-Readiness Audit
**Date:** June 26, 2026
**Branch:** `speed`
**Scope:** Full codebase review — verification of all previously identified fixes, plus a fresh pass for new issues introduced by recently added features (geo clustering/search, member attendance log, route-group layouts).

---

## Executive Summary

All 9 previously identified issues (3 from the initial outstanding-issues pass, 6 from the follow-up performance/security pass) are confirmed fixed and correctly implemented in this build, **with one exception**: the RLS covering index (`idx_gyms_id_owner`) was supposed to be de-duplicated down to one copy, but both copies were removed instead — the index no longer exists at all. This is a regression of a previously-fixed item.

Beyond that, this pass reviewed every file not yet examined in prior rounds, with particular attention to code added since the last review (`/api/geo/cluster-detect`, `/api/geo/search`, the member attendance log page, and the three route-group layouts). Five new issues were found, ranging from a broken redirect path to a CPU-heavy synchronous loop reachable with attacker-controlled input.

**Overall assessment:** The codebase is close to production-ready. Nothing found in this pass is a data-exposure or auth-bypass vulnerability — RLS, ownership checks, and rate limiting are consistently applied across the routes reviewed. The issues below are correctness, performance, and hygiene items that should be cleared before the next deploy, in the order listed.

| # | Issue | Severity | Status |
|---|---|---|---|
| R1 | `idx_gyms_id_owner` covering index removed entirely (regression) | 🟠 HIGH | New regression |
| N1 | `members/attendance/page.tsx` redirects to non-existent `/login` route | 🟡 MEDIUM | New |
| N2 | `members/attendance/page.tsx` bypasses DAL, duplicates auth already done by layout | 🟡 MEDIUM | New |
| N3 | `detectDatasetCluster` runs an O(districts) fallback loop per unmatched input, up to 5000 inputs per request | 🟡 MEDIUM | New |
| N4 | `RequestLogger.summary()` logs at `error` level on every successful page load in production | 🟢 LOW | New |
| N5 | `payments/layout.tsx` is a no-op passthrough — no auth guard at the layout level | 🟢 LOW | New (informational) |

---

## Part 1 — Verification of Previously Identified Issues

### From the first remediation pass (audit → remediation → outstanding-issues.md)

| # | Issue | Verified Status |
|---|---|---|
| 2.1 | `getAllTimePayments` server action had no auth check | ✅ Fixed — auth + ownership gate runs before cache lookup |
| 2.2 | `AccountMenu` re-fetched gym on every auth state change | ✅ Fixed — guard checks `initialGymId && initialGymName` |
| 2.3 / Issue 1 (round 2) | Redis cache never invalidated after member/payment mutations | ✅ Fixed in all paths checked: `EditMemberClient.tsx`, `BulkEditClient.tsx`, `app/api/members/[id]/route.ts` (PATCH), `app/api/payments/route.ts` (POST), plus the cache-result is now checked and logged with `console.warn` on failure |
| 3.1 / 3.6 | DAL not adopted in `account/`, `inventory/[id]`, `members/bulk-edit` | ✅ Fixed — all use `getAuthUser`/`getGym` from `lib/dal.ts` |
| 3.2 | `GET /api/members/[id]` missing `gym_id` filter (IDOR) | ✅ Fixed — `.eq('gym_id', gym.id)` present |
| 3.3 | Duplicate `attendance` RLS enable statement | ✅ Fixed — single statement only |
| 3.4 / 5.2 | `support/clear` used inline service-role client; `support_tickets` UPDATE policy missing | ✅ Fixed — route uses standard client; `CREATE POLICY "Gym owners can update their support tickets" ... FOR UPDATE` is present in `supabase-schema.sql` |
| 3.5 | `ShellGuard` props typed `any` | ✅ Fixed — typed with `User \| null` and inferred `GymRow` |
| 3.7 | `invalidateInventoryCache`/`invalidateInventoryItemCache` had no auth check | ✅ Fixed — `checkGymOwnership` guard present |
| 3.8 | Health endpoint leaked raw Supabase error object | ✅ Fixed — returns `error.code` only |
| 4.1 | DAL `getGym()` missing `onboarding_data` | ✅ Fixed — field present in select |
| 4.2 | Members page: DB sort immediately overridden by JS sort | ✅ Fixed — `.order('created_at')` kept for query shape, secondary `localeCompare` sort added in JS |
| 4.3 | `ShellGuard` `useEffect` re-ran on every navigation | ✅ Fixed — split into two effects, `pathname` removed from the interval-setup dependency array |
| 4.4 | `cacheWrapper` logged 4x per operation; `globalCacheStats` broken in serverless | ✅ Fixed — logs gated behind `NODE_ENV === 'development'`, `globalCacheStats` removed |
| **5.1** | **No covering index on `gyms(id, owner_id)` for RLS subquery** | ❌ **Regressed — see R1 below** |
| 6.2 | `_reports_archived/` inside `app/` directory | ✅ Fixed — moved to `_archived/` at repo root |
| 6.3 | `/api/import` stub silently returned fake success | ✅ Fixed — returns `501 NOT_IMPLEMENTED` |
| 7.1 | Cache TTL too short (60s) for daily-access pattern | ✅ Fixed — 300s on dashboard, members, payments pages |
| 7.2 | `ADMIN_EMAIL` unset gave misleading `403` | ✅ Fixed — explicit `500`/redirect with `[ADMIN GATE]` log |

### From the second pass (new-findings.md)

| # | Issue | Verified Status |
|---|---|---|
| 1 | Inventory cache double-JSON-encoded, silently broke the page on cache hits | ✅ Fixed — `JSON.stringify`/manual parsing removed from `lib/api/inventory.ts`; raw objects passed to `redis.get`/`redis.set` |
| 2 | `AppShell` hit the DB twice per navigation with zero caching | ✅ Fixed — `getGymActiveStatus` and `getUnreadAdminMessages` now wrapped in `cacheWrapper` (120s / 30s TTL); unread-count cache is also invalidated on the notifications page when messages are read |
| 3 | CSP `connect-src` blocked Google Places API network calls | ✅ Fixed — `https://maps.googleapis.com` and `https://maps.gstatic.com` added |
| 4 | `/api/import/confirm` had no rate limit, no row cap | ✅ Fixed — `checkRateLimit` called, `MAX_IMPORT_ROWS = 500` enforced |
| 5 | `/api/attendance` had unused rate-limit import, no member-gym ownership check | ✅ Fixed — rate limit now called, member ownership verified before upsert |
| 6 | Bulk import and gym deletion didn't invalidate cache | ✅ Fixed — `import/confirm` invalidates `membersList`/`dashboard`; `delete-gym` calls `invalidatePattern(gym:${gym_id}:*)` |

---

## Part 2 — Regression Found

### 🟠 R1 — `idx_gyms_id_owner` Covering Index Was Fully Removed, Not De-Duplicated

**File:** `supabase-schema.sql`

**What happened:** A previous pass found this index defined twice (once near the top of the schema file with the other core indexes, once again under a "[Migration 18]" block near the bottom) and asked for the duplicate to be removed, leaving one copy. In this build, **neither copy exists**:

```bash
$ grep -c "idx_gyms_id_owner" supabase-schema.sql
0
```

This silently undoes the original fix (5.1 from the first audit): a covering index on `gyms(id, owner_id)` to support the RLS subquery pattern used on every protected table:

```sql
EXISTS (SELECT 1 FROM gyms WHERE id = <table>.gym_id AND owner_id = auth.uid())
```

**Why it matters:** At current scale this has no visible impact — `gyms` has a primary-key index on `id` alone, which is enough for a single-tenant lookup. But as the platform grows, every RLS-protected query on `members`, `memberships`, `attendance`, `admin_messages`, etc. re-runs this subquery per row, and the covering index removes the extra heap lookup. This is a "fix it now while it's free" item, not an urgent one — but since it was previously identified, fixed, and has now silently disappeared, it's worth re-applying and double-checking against the live database (the index may or may not still exist there, depending on whether `DROP INDEX` was also run, which would be a bigger problem than just the schema file going stale).

**Fix:** Re-add the index once, with its explanatory comment, and confirm no `DROP INDEX idx_gyms_id_owner` was run against production:

```sql
-- Covering index for the RLS subquery pattern used on every protected table:
-- EXISTS (SELECT 1 FROM gyms WHERE id = table.gym_id AND owner_id = auth.uid())
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
```

Run this directly in the Supabase SQL Editor to guarantee it exists on the live table regardless of what's in the file, then verify with:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'gyms';
```

---

## Part 3 — New Issues Found in This Pass

### 🟡 N1 — `members/attendance/page.tsx` Redirects to a Route That Doesn't Exist

**File:** `app/members/attendance/page.tsx`

```ts
const { data: { user } } = await supabase.auth.getUser()
// ...
if (!user) redirect('/login')
```

The actual login page in this app lives at `/auth/login` — that's the path used consistently by `middleware.ts`, `dashboard/layout.tsx`, `members/layout.tsx`, and every other auth check in the codebase. This one file uses `/login`, which has no matching route.

**Why it matters:** If this redirect ever actually fires (see N2 below for why it normally won't), the user lands on Next.js's `not-found.tsx` page instead of the login form — a dead end with no way back into the app except manually editing the URL.

**Fix:**
```ts
if (!user) redirect('/auth/login')
```

---

### 🟡 N2 — `members/attendance/page.tsx` Duplicates Auth Already Handled by the Layout, Bypassing the DAL

**File:** `app/members/attendance/page.tsx`

This page sits under `app/members/`, which already has `members/layout.tsx`:

```ts
// app/members/layout.tsx — already runs for every page under /members/*
const { user } = await getAuthUser()
if (!user) redirect('/auth/login')
```

But `app/members/attendance/page.tsx` re-implements its own auth and gym lookup from scratch, using raw Supabase calls instead of the DAL:

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()   // raw, not getAuthUser()
// ...
if (!user) redirect('/login')   // also see N1
// ...
const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()  // raw, not getGym()
if (!gym) redirect('/onboarding')
```

This is exactly the pattern that fixes 3.1/3.6 (from the original audit) addressed everywhere else in the app — but this page was added afterward and wasn't brought in line with it.

**Why it matters:**
- **Performance:** an extra, undeduped `auth.getUser()` round trip and an extra raw `gyms` query on every visit to this page, on top of the one the layout already did. `React.cache()` only dedupes calls to the *same function reference* — calling `supabase.auth.getUser()` directly here is a different call site than `getAuthUser()`, so there's no sharing between the layout's check and this page's check within the same request.
- **Consistency/maintainability:** this is the only page under `/members/*` not using the DAL, which makes the codebase harder to audit at a glance (the original audit specifically flagged this kind of inconsistency as a code-quality risk).
- **The dead-redirect bug in N1** only exists because this page does its own auth check instead of trusting the layout — removing the duplicate check removes the bug along with the redundant work.

**Fix:** Remove the redundant auth/gym lookup entirely and rely on the layout, or at minimum switch to the DAL:

```ts
import { getAuthUser, getGym } from '@/lib/dal'

export default async function AttendanceLogPage() {
  const logger = new RequestLogger('ATTENDANCE_LOG')
  try {
    logger.start('AUTH')
    const { user } = await getAuthUser()
    logger.end('AUTH')
    if (!user) redirect('/auth/login')   // unreachable in practice — layout already guards this

    logger.start('QUERY gyms')
    const { gym } = await getGym(user.id)
    logger.end('QUERY gyms')
    if (!gym) redirect('/onboarding')

    const logs = await getAttendanceLogs(gym.id, logger)
    // ...
  }
}
```

Since `members/layout.tsx` already redirects unauthenticated users before this page renders, the cleanest version removes the `if (!user)` branch entirely and trusts the layout — but keeping a DAL-based check as defense-in-depth (matching the pattern used elsewhere, e.g. `GET /api/members/[id]`) is also reasonable if you'd rather not rely solely on the layout.

---

### 🟡 N3 — `detectDatasetCluster` Has an O(districts) Fallback Scan Per Unmatched Input, Up to 5000 Inputs Per Request

**Files:** `lib/geo/clustering.ts`, `app/api/geo/cluster-detect/route.ts`

`POST /api/geo/cluster-detect` accepts up to 5000 input strings per request (`inputs.slice(0, 5000)`) and runs each one through `detectDatasetCluster`. Most inputs resolve via fast lookups (`ALIAS_TO_DISTRICT[n]`, `ALIAS_MAP[n]`, `PONDY_LOCALITY_SIGNALS.has(n)` — all O(1) hash lookups). But any input that misses all three falls through to:

```ts
for (const [district, state] of Object.entries(DISTRICT_STATE)) {
  if (n.includes(district) || district.includes(n)) {
    districtVotes[district] = (districtVotes[district] ?? 0) + 1
    stateVotes[state] = (stateVotes[state] ?? 0) + 1
    break
  }
}
```

This iterates all ~42 districts and does two substring checks per district, for every input that didn't match a known alias. The feature is explicitly designed for messy, real-world area-name data during bulk import — which means a meaningful fraction of inputs in a real CSV are exactly the kind of unmatched, free-text strings that hit this slow path. In the worst case (5000 inputs, mostly unmatched), that's on the order of ~200,000+ substring-comparison operations in a single synchronous function call, executing on the Node.js event loop within one request.

**Why it matters:** This isn't going to take the server down on its own, but it's a real, reachable CPU-bound hot path — gated only by the existing rate limit (`ROUTE_LIMITS.DEFAULT`, 30 req/min/user), not by any cost-aware throttling. On a serverless platform (Vercel), a slow request like this also holds a function instance open longer, which has direct cost and concurrency implications under load. It's the kind of endpoint worth load-testing with adversarial input (e.g., 5000 random unmatched strings) before relying on it during a real bulk-import flow with thousands of rows.

**Fix options (in order of effort):**
1. **Cheapest:** lower the `.slice(0, 5000)` cap to something closer to realistic single-import batch sizes (e.g., 500, matching `MAX_IMPORT_ROWS` already used in `/api/import/confirm`) — bulk imports already happen in capped batches, so the clustering call should match that cap rather than allowing 10x more.
2. **Better:** build the district-matching fallback into a single pre-tokenized lookup structure (e.g., a trie or a `Map` of substrings to districts) at module load time instead of re-iterating `Object.entries(DISTRICT_STATE)` per call.
3. **Most robust:** short-circuit the fallback loop once a "good enough" match is found for a meaningful fraction of inputs (e.g., stop after the first 500 inputs already vote decisively for one district), since the function only needs the *top* cluster, not a perfectly exhaustive count.

---

### 🟢 N4 — `RequestLogger.summary()` Logs at `error` Level on Every Successful Request in Production

**File:** `lib/logger.ts`

```ts
// Log summary as error to bypass Vercel filters in production, use log in dev
if (process.env.NODE_ENV === 'production') {
  console.error(JSON.stringify(log))
} else {
  console.log(JSON.stringify(log))
}
```

This is called via `logger.summary()` at the end of every dashboard, members, and payments page render — including fully successful ones with no errors. The comment makes the intent explicit: this is a deliberate workaround to get visibility into Vercel's log filtering, which normally suppresses plain `console.log` output at the default log level.

**Why it matters:** `next.config.js` strips plain `console.log` in production but explicitly preserves `console.error` and `console.warn` (`removeConsole: { exclude: ['error', 'warn'] }`), so this pattern does work as intended for getting the summary logged. But it means every successful page load now emits an `error`-severity log line. If Sentry, Vercel's own alerting, or any third-party log-based alerting is configured to treat `console.error` output as a signal worth paging on or tracking as an error-rate metric, this will permanently inflate that signal with non-errors, making real errors harder to distinguish (alert fatigue) and skewing any "error rate" dashboards that count `error`-level log volume.

**Fix:** Use a dedicated log level/tag instead of borrowing `error` severity, and configure the actual log destination (Vercel log drains, or a structured logging service) to capture `info`-level logs if visibility is the real goal:

```ts
// Use a structured prefix so this can be filtered/searched without polluting error-rate metrics
console.log(`[METRICS] ${JSON.stringify(log)}`)
```

If the underlying problem is that Vercel's dashboard hides `console.log` by default, the better fix is adjusting Vercel's log level/drain configuration (or routing structured logs through Sentry's `captureMessage` with an `info` level, which `RequestLogger.error()` already demonstrates the pattern for) rather than mislabeling routine telemetry as errors.

---

### 🟢 N5 — `payments/layout.tsx` Is a No-Op Passthrough (Informational, Not a Vulnerability)

**File:** `app/payments/layout.tsx`

```ts
export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

Unlike `members/layout.tsx` and `dashboard/layout.tsx`, which both perform an auth check and redirect unauthenticated users, `payments/layout.tsx` does nothing — it's a pure passthrough. This is **not a security gap** in practice: `app/payments/page.tsx` itself calls `getAuthUser()`/`getGym()` via the DAL and returns `null` if there's no user, and `middleware.ts` already includes `/payments` in `PROTECTED_PREFIXES`, so unauthenticated requests are redirected to `/auth/login` before they ever reach this layout or page.

**Why it's worth noting anyway:** it's an inconsistency that could become a real gap later — if a new page or route segment is ever added under `/payments/*` that doesn't independently check auth (the way the new `members/attendance/page.tsx` very nearly didn't get layout-level protection right, see N1/N2), there would be nothing at the layout level to catch it. `members/layout.tsx` and `dashboard/layout.tsx` both demonstrate the safer pattern. Bringing `payments/layout.tsx` in line with them costs nothing and removes a latent inconsistency:

```ts
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/dal'

export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')
  return <>{children}</>
}
```

---

## Part 4 — Areas Reviewed With No Issues Found

For completeness, the following were specifically checked in this pass and found to be correctly implemented:

- **`/api/geo/search`** — auth check, rate limit, query-length gate, `limit` parameter clamped to a max of 50, delegates the actual fuzzy matching to a Postgres RPC rather than doing it in Node. No issues.
- **`/api/geo/cluster-detect`** — auth check, rate limit, and an input-count cap are all present (see N3 for a performance note on what happens *within* that cap).
- **`/api/admin` page and `admin/layout.tsx`** — correctly gated by the `ADMIN_EMAIL` check fixed in the original audit (7.2); uses `createAdminClient()` deliberately to bypass RLS for cross-tenant aggregate stats, which is the correct and intentional use of the service-role client for an internal admin-only dashboard.
- **`app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`** — well-built error boundaries, properly report to Sentry, no information leakage in the user-facing copy.
- **`app/api/account/delete-data/route.ts`, `app/api/account/delete-gym/route.ts`** — both verify gym ownership (`.eq('owner_id', user.id)`) before any destructive operation.
- **`app/api/onboarding/complete/route.ts`** — correctly scopes both the update path (`.eq('owner_id', user.id)`) and the insert path (always sets `owner_id: user.id` from the session) — no IDOR.
- **`components/location/GooglePlacesAutocomplete.tsx`** — properly debounced (300ms), minimum character threshold before firing, uses Google session tokens correctly, has a graceful fallback path when the API fails to load.

---

## Recommended Fix Order Before Next Deploy

1. **R1** — Re-add `idx_gyms_id_owner` to the schema file and confirm it exists on the live database. Quick, zero-risk, previously-verified fix that simply needs to be re-applied.
2. **N1** — One-line fix (`/login` → `/auth/login`). Trivial but directly user-facing if it ever triggers.
3. **N2** — Bring `members/attendance/page.tsx` onto the DAL pattern, which also resolves N1 as a side effect.
4. **N3** — At minimum, lower the `cluster-detect` input cap to match `MAX_IMPORT_ROWS` (500) for consistency and reduced worst-case latency. The trie/lookup-table optimization can follow as a non-blocking improvement.
5. **N5** — Add the auth guard to `payments/layout.tsx` for defense-in-depth consistency. Not urgent, no current exposure.
6. **N4** — Reclassify the routine metrics log away from `error` severity. Not urgent, but worth doing before relying on error-rate alerting in production.