# GymFlow — Audit Remediation: Detailed Change Log
**Date:** June 26, 2026
**Branch:** `speed`
**Audit Reference:** `audit report.md`

This document explains every code change made to resolve the findings in the security audit, from issue 2.1 to 7.3. Each entry describes **what the problem was**, **why it was dangerous or bad**, **what was changed**, and **which files were affected**.

---

## 🔴 2.1 — `getAllTimePayments` Server Action Had No Auth Check

### What was the problem?
The `getAllTimePayments` function in `app/payments/actions.ts` is a Next.js Server Action (marked `'use server'`). Server actions are callable directly from the browser via a POST request to a Next.js-generated endpoint. The function accepted a `gymId` string and returned the full payment history for that gym — but it had **zero authentication check** before hitting the database.

There was a second, more severe problem: the result was cached in Redis under `gym:${gymId}:payments_page:allTime` for 300 seconds. Once any authenticated user legitimately called this function, the full payment history was stored in Redis. A subsequent request from **anyone** — even an unauthenticated caller — for the same `gymId` Redis key would receive the **cached data directly**, completely bypassing Supabase RLS, because `cacheWrapper` returns cached data without re-running the Supabase query.

### What was changed?
An auth gate was added **before** the cache lookup (not after). The fix:
1. Creates a Supabase client and calls `supabase.auth.getUser()` to verify a valid session exists.
2. Queries the `gyms` table with both `.eq('id', gymId)` **and** `.eq('owner_id', user.id)` to verify the authenticated user actually owns the gym they're requesting data for.
3. Only if both checks pass does the function proceed to the cache/database lookup.

If the user is unauthenticated, it throws `'Unauthorized'`. If the user is authenticated but doesn't own that gym, it throws `'Forbidden'`.

### Files changed
- `app/payments/actions.ts`

---

## 🟠 2.2 — `AccountMenu` Re-Fetched Gym on Every Auth State Change

### What was the problem?
`AccountMenu.tsx` receives the logged-in user's email, gym ID, gym name, and unread message count as props from the server on the initial page load (passed down from `AppShell`). It uses Supabase's `onAuthStateChange` listener to keep these values fresh if the user logs in/out mid-session.

The guard condition to decide whether to use the props or fetch fresh data was:
```ts
if (session.user.email === initialEmail && initialGymId) {
  // use props
} else {
  fetchForUser(...)  // fires a gym + unread count fetch from the database
}
```

The problem: if `initialGymId` was `null` for any reason (e.g., edge case during onboarding, stale server render), the `else` branch fired **unconditionally on every auth state event**, including the initial `INITIAL_SESSION` event that fires on every page load. This caused an unnecessary gym query + admin messages count query on every navigation for affected sessions.

Additionally, `currentUserId.current` was used to deduplicate by user ID, but the guard checked `initialEmail` for the early return, not `initialGymId` being populated — a mismatch in the de-duplication logic.

### What was changed?
The guard condition was tightened to check both `initialEmail` **and** `initialGymName` (not just `initialGymId`). The logic now:
1. First checks if the event is for the same user ID we already processed (`currentUserId.current`) — if so, bail out immediately.
2. Sets `currentUserId.current` to the new user ID.
3. Checks `isSameUser && haveAllProps` — only if both `initialGymId` and `initialGymName` are truthy props AND the user email matches, does it use the props directly.
4. Otherwise, it falls back to `fetchForUser`.

### Files changed
- `components/layout/AccountMenu.tsx`

---

## 🟡 2.3 — Redis Cache Was Never Invalidated After Mutations

### What was the problem?
`cacheWrapper` stores page data in Redis with a TTL. The cache for the members list and payments page was set but **never deleted** when data changed. This meant:

- Adding a new member → the members page showed stale data for up to 60 seconds (the old TTL).
- Renewing a membership → the payments page showed the old total for up to 60 seconds.
- Marking a due as paid → the dues page updated immediately (not cached), but the members list still showed the old `pending_amount`.

Inventory was the only area that correctly called `invalidateInventoryCache` after mutations.

### What was changed?

**Step 1: Created `lib/cache-keys.ts`** — a central module that defines all Redis key patterns as typed functions:
```ts
export const cacheKeys = {
  membersList: (gymId: string) => `gym:${gymId}:members_list`,
  dashboard:   (gymId: string, date: string) => `gym:${gymId}:dashboard:${date}`,
  payments12mo:(gymId: string) => `gym:${gymId}:payments_page:12mo`,
  paymentsAll: (gymId: string) => `gym:${gymId}:payments_page:allTime`,
}
```
This prevents typos in cache key strings and gives a single place to audit all cache usage.

**Step 2: Created `invalidateMembersCache` server action** in `app/members/actions.ts`. This deletes the members list cache and the dashboard cache (since the dashboard shows member counts).

**Step 3: Wired `deleteCache` calls to every mutation path:**
- `app/api/members/route.ts` (POST — new member via API) → deletes members list + dashboard cache.
- `app/members/new/page.tsx` (new member via UI form) → calls `invalidateMembersCache`.
- `app/members/[id]/MemberDetailClient.tsx` (membership renewals) → deletes payments 12mo + all-time + dashboard cache.
- `app/dues/DuesClient.tsx` (mark due as paid) → deletes members list + dashboard cache.

### Files changed
- `lib/cache-keys.ts` *(new file)*
- `app/members/actions.ts`
- `app/api/members/route.ts`
- `app/members/new/page.tsx`
- `app/members/[id]/MemberDetailClient.tsx`
- `app/dues/DuesClient.tsx`

---

## 🟠 3.1 — DAL Adoption Was Incomplete: Server Pages Still Used Raw `auth.getUser()`

### What was the problem?
`lib/dal.ts` defines `getAuthUser()` and `getGym()` wrapped in `React.cache()`. This means within a single server render, calling `getAuthUser()` from two different components only makes **one** network round-trip to Supabase — the second call returns the cached result immediately.

However, many server-side pages were still calling `supabase.auth.getUser()` directly, which:
1. Pays a full network round-trip to Supabase Auth on every page visit.
2. Cannot benefit from React's request-scoped deduplication.
3. Is inconsistent — making the auth pattern hard to audit.

**Affected server pages:** `app/account/notifications/page.tsx`, `app/account/page.tsx`, `app/account/layout.tsx`, `app/inventory/[id]/page.tsx`, `app/members/bulk-edit/page.tsx`.

### What was changed?
Each of the above pages was updated to replace:
```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
// ...
const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
```
with:
```ts
const { user } = await getAuthUser()
if (!user) return null
const { gym } = await getGym(user.id)
```

Note: Server actions and client components were intentionally **not** changed because `React.cache()` only works in Server Component render scope — it provides no benefit for actions or client-side code.

### Files changed
- `app/account/notifications/page.tsx`
- `app/account/page.tsx`
- `app/account/layout.tsx`
- `app/inventory/[id]/page.tsx`
- `app/members/bulk-edit/page.tsx`

---

## 🟠 3.2 — `GET /api/members/[id]` Had No `gym_id` Filter (IDOR Vulnerability)

### What was the problem?
The GET handler in `app/api/members/[id]/route.ts` fetched a member by ID alone:
```ts
const { data } = await supabase.from('members').select('...').eq('id', id).single()
```

There was no check that the requested member belongs to the requesting user's gym. While Supabase RLS would block cross-tenant access at the database level (because the RLS policy requires `owner_id = auth.uid()`), this is a defense-in-depth gap. If RLS were ever misconfigured or disabled, this endpoint would silently leak name, phone, age, and gender for any member in the entire system, given only their UUID.

Note: The PATCH handler on the same file did correctly have this check — only the GET was missing it.

### What was changed?
The GET handler now:
1. Calls `getGymForUser(supabase, user.id)` to get the authenticated user's gym.
2. Returns a `404` if no gym is found.
3. Adds `.eq('gym_id', gym.id)` to the member query, so the database will return no result if the member doesn't belong to the requesting user's gym, even if RLS is misconfigured.

### Files changed
- `app/api/members/[id]/route.ts`

---

## 🟡 3.3 — Duplicate `ALTER TABLE attendance ENABLE ROW LEVEL SECURITY` in Schema

### What was the problem?
`supabase-schema.sql` contained this exact block:
```sql
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;  -- duplicate, line 97
```

This is idempotent in PostgreSQL (running it twice does nothing), so the live database was fine. But it signalled that the schema file was being maintained by hand-appending rather than proper migrations, and would confuse future developers reading the file.

### What was changed?
The duplicate line was removed. The block now reads:
```sql
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;
```

### Files changed
- `supabase-schema.sql`

---

## 🟡 3.4 — `support/clear` Route Used an Inline Service Role Client

### What was the problem?
`app/api/support/clear/route.ts` was using a dynamically imported, inline-created service role client to bypass what its comment said were "missing RLS UPDATE policies":
```ts
const serviceRoleClient = (await import('@supabase/supabase-js')).createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

Problems:
1. `lib/supabase/admin.ts` already exists for this exact purpose — using an inline client was inconsistent.
2. The dynamic `import()` adds cold-start overhead on the first call.
3. The comment was **incorrect** — the UPDATE policy on `admin_messages` already existed. The service role bypass was an unnecessary workaround.
4. `support_tickets` genuinely lacked an UPDATE policy, which was the underlying issue that should have been fixed at the database level.

### What was changed?
**Part 1 (Database):** A new `UPDATE` policy was added to the `support_tickets` table in `supabase-schema.sql` (and as Migration 17):
```sql
CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));
```

**Part 2 (Application):** The entire `serviceRoleClient` block was removed from `route.ts`. All three update operations (`admin_messages` clear all, `support_tickets` clear all, individual item clear) now use the standard authenticated `supabase` client. The standard client + RLS is sufficient because the UPDATE policy now correctly covers both tables.

### Files changed
- `app/api/support/clear/route.ts`
- `supabase-schema.sql` (Migration 17)

---

## 🟡 3.5 — `ShellGuard` Props Were Typed `any`

### What was the problem?
`ShellGuard` is the most security-critical component in the app — it decides whether to render the authenticated dashboard or redirect to the login page. Its props interface was:
```ts
interface ShellGuardProps {
  initialUser: any   // ← completely untyped
  initialGym: any    // ← completely untyped
}
```

Using `any` means:
- TypeScript's strict mode gives zero protection here.
- If the shape of the `user` object or `gym` object changes (e.g., a Supabase SDK upgrade or a DAL refactor), the compiler will not catch it.
- Any property access on these objects (`initialUser?.email`, `initialGym?.id`) is unchecked at compile time.

### What was changed?
The types were replaced with precise inferred types:
```ts
import type { User } from '@supabase/supabase-js'
import type { getGym } from '@/lib/dal'

type GymRow = Awaited<ReturnType<typeof getGym>>['gym']

interface ShellGuardProps {
  children: React.ReactNode
  initialUser: User | null
  initialGym: GymRow
  initialIsActive: boolean
  initialUnreadCount: number
}
```

Key decision: `import type { getGym }` is used (not `import { getGym }`) because `ShellGuard` is a `'use client'` component. A regular import would attempt to bundle server-only Supabase modules into the browser bundle and crash the build. A type-only import extracts only the TypeScript type information at compile time with zero runtime cost.

### Files changed
- `components/layout/ShellGuard.tsx`

---

## 🟡 3.6 — `notifications/page.tsx` Did Not Use the DAL

### What was the problem?
`app/account/notifications/page.tsx` was calling `supabase.auth.getUser()` and `supabase.from('gyms').select('id')` directly — raw, uncached, and paying a full round-trip to Supabase Auth and the database on every page visit.

This is the highest-traffic non-dashboard page in the app (it marks messages as read and loads the full notification history), so every visit was paying two unnecessary extra network calls.

### What was changed?
Swapped to `getAuthUser()` and `getGym()` from `lib/dal.ts`, same as the 3.1 fix. These are deduplicated within the same server render via `React.cache()`.

### Files changed
- `app/account/notifications/page.tsx`

*(Note: This was resolved as part of the 3.1 batch migration.)*

---

## 🟢 3.7 — `invalidateInventoryCache` Server Action Had No Auth Check

### What was the problem?
```ts
export async function invalidateInventoryCache(gymId: string) {
  await redis.del(`inventory:${gymId}`)
}
```

This server action deletes a Redis key for any `gymId` passed to it, with zero authentication. Anyone can call it from a browser with any gym ID and force a cache miss for that gym's inventory on the next page load — a cache-busting denial-of-service attack. It doesn't expose data, but it degrades performance for targeted gyms.

The same issue existed in `invalidateInventoryItemCache`.

### What was changed?
A shared `checkGymOwnership` helper was added at the top of `app/inventory/actions.ts`:
```ts
async function checkGymOwnership(gymId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: gym } = await supabase
    .from('gyms').select('id')
    .eq('id', gymId).eq('owner_id', user.id).single()
  if (!gym) throw new Error('Forbidden')
}
```

Both `invalidateInventoryCache` and `invalidateInventoryItemCache` now call `await checkGymOwnership(gymId)` as their first operation. An unauthenticated or cross-tenant caller will receive an error before any Redis operation is performed.

### Files changed
- `app/inventory/actions.ts`

---

## 🟢 3.8 — Health Endpoint Leaked Raw Supabase Error Object

### What was the problem?
`GET /api/health` is a public, unauthenticated endpoint used by uptime monitors. On database failure, it returned the raw Supabase error object:
```ts
return NextResponse.json({
  status: 'unhealthy',
  error: error,  // ← full object: message, hint, details, code...
})
```

Supabase error objects can contain `message`, `hint`, `details`, and `code` fields — sometimes including partial SQL, table names, or internal error codes that aid reconnaissance against your infrastructure.

### What was changed?
The error response now returns only the error code:
```ts
return NextResponse.json({
  status: 'unhealthy',
  database: 'error',
  error: error?.code ?? 'DB_ERROR',  // sanitized — code only
})
```

The full error is still logged server-side via `console.error` so it's visible in Vercel logs, but is never exposed to the public caller.

### Files changed
- `app/api/health/route.ts`

---

## 🟠 4.1 — `getGym()` in DAL Was Missing `onboarding_data`

### What was the problem?
The `getGym()` function in `lib/dal.ts` only selected 4 fields: `id, name, onboarding_completed, owner_id`. However, `app/members/new/page.tsx` also needed `onboarding_data` (to populate default plan/pricing from the gym's onboarding configuration). Because it wasn't in the DAL, the page was running a **second raw gym query** just to fetch `onboarding_data`, paying an extra round-trip that bypassed the React.cache() deduplication.

### What was changed?
`onboarding_data` and `created_at` were added to the DAL's select string:
```ts
.select('id, name, onboarding_completed, owner_id, created_at, onboarding_data')
```

Callers that don't need `onboarding_data` simply ignore the extra field. The query cost is negligible for a single-row lookup by primary key. The second raw gym query in `members/new/page.tsx` was removed.

### Files changed
- `lib/dal.ts`

---

## 🟡 4.2 — Members Page Had a Redundant Database `.order('name')` Sort

### What was the problem?
The members query in `app/members/page.tsx` used `.order('name')` at the database level (alphabetical). But immediately after receiving the results, the aggregation step re-sorted the entire array by membership status:
```ts
.sort((a, b) => {
  const order = { expiring: 0, active: 1, expired: 2 }
  return order[a.status] - order[b.status]
})
```

This JS sort completely overwrites the database sort. The database was doing unnecessary work — sorting 200 rows alphabetically — and the result was immediately discarded. Worse, within each status group (all "active" members, all "expired" members), the order was now effectively random.

### What was changed?
1. The `.order('name')` database clause was removed (replaced with `.order('created_at', { ascending: false })` which is more useful for cache freshness).
2. A secondary `localeCompare` sort was added to the JS sort as a tiebreaker:
```ts
.sort((a, b) => {
  const order = { expiring: 0, active: 1, expired: 2 }
  const statusDiff = order[a.status] - order[b.status]
  return statusDiff !== 0 ? statusDiff : a.name.localeCompare(b.name)
})
```

Result: members are sorted **expiring → active → expired**, and **alphabetically by name** within each status group. This is better than before and requires zero extra database work.

### Files changed
- `app/members/page.tsx`

---

## 🟡 4.3 — `ShellGuard` `useEffect` Restarted the Auth Interval on Every Navigation

### What was the problem?
`ShellGuard` used a single `useEffect` that:
1. Restored the sidebar collapsed state from `localStorage`.
2. Checked if the user was logged in/active.
3. Set up a `window.addEventListener('focus', checkAuth)` listener.
4. Set up a `setInterval(checkAuth, 10000)` 10-second polling interval.

The dependency array included `pathname`:
```ts
}, [isShellless, pathname, initialUser, initialIsActive])
```

Because `pathname` changes on every Next.js page navigation, the entire `useEffect` ran on every navigation. This means:
- The cleanup function ran: removing the focus listener, clearing the 10-second interval.
- The setup function ran again: re-adding the focus listener, starting a **new** 10-second interval from zero.

This causes unnecessary listener churn and resets the interval timer on every page click. If a user navigates quickly, the interval never actually fires.

### What was changed?
The single `useEffect` was split into **two separate effects**:

**Effect 1** (runs once on mount, no dependencies):
```ts
useEffect(() => {
  const saved = localStorage.getItem(SIDEBAR_KEY)
  if (saved === 'true') setCollapsed(true)
  setMounted(true)
}, [])
```

**Effect 2** (auth guard, no `pathname` dependency):
```ts
useEffect(() => {
  if (isShellless) return
  // ... auth check, focus listener, interval setup
}, [isShellless, initialUser, initialIsActive])
```

The 10-second interval is now set up once on mount and never torn down during normal navigation. It only re-runs if `isShellless`, `initialUser`, or `initialIsActive` change — which only happens on actual login/logout events, not page navigation.

### Files changed
- `components/layout/ShellGuard.tsx`

---

## 🟡 4.4 — `cacheWrapper` Had 4 `console.log` Calls Firing on Every Cache Operation

### What was the problem?
`lib/cache.ts` had these logs on every single cache operation:
```ts
console.log(`CACHE HIT: ${key}`)
console.log(`CACHE MISS: ${key}`)
console.log(`[CACHE][Event] ${type}: ${key} - ${durationMs}ms`)
console.log(`[CACHE] Hits: ${globalCacheStats.hits} | Misses: ... | Hit Rate: ${hitRate}%`)
```

Two issues:

1. **Development noise:** These logs fire on every page load in development, making it very hard to see actual application logs (errors, warnings, business logic traces).

2. **Broken `globalCacheStats` in production:** The `globalCacheStats` object was module-level state (`let globalCacheStats = { hits: 0, misses: 0, total: 0 }`). In a serverless environment like Vercel, each function invocation (each request) may spin up a fresh Node.js instance. The stats reset to zero on every cold start, making the "hit rate" metric completely meaningless — it only ever reflects the stats since the last cold start, not the overall system hit rate.

Note: `next.config.js` has `removeConsole: { exclude: ['error', 'warn'] }` so plain `console.log` calls are stripped in production builds — but the broken `globalCacheStats` was still wrong architecturally.

### What was changed?

1. **`CACHE HIT` and `CACHE MISS` logs** gated behind `NODE_ENV === 'development'`:
```ts
if (process.env.NODE_ENV === 'development') console.log(`CACHE HIT: ${key}`)
```

2. **`globalCacheStats` was removed entirely.** It cannot work correctly in serverless environments. The `logCacheMetric` function was simplified to only log the event type and timing in development:
```ts
function logCacheMetric(type: 'HIT' | 'MISS', key: string, durationMs: number) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[CACHE][Event] ${type}: ${key} - ${durationMs}ms`)
  }
}
```

### Files changed
- `lib/cache.ts`

---

## 🟡 5.1 — No Index on `gyms(owner_id)` for RLS Subquery

### What was the problem?
Every RLS policy across all protected tables uses this pattern:
```sql
EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())
```

This subquery runs on **every row evaluated** in every protected table query. The `gyms` table had an index on `id` (the primary key), but **no index on `(id, owner_id)` together**. For a small gym database (one gym per owner), this is negligible — the PK index finds the row instantly and the `owner_id` filter runs on a single row. But as the platform scales to more gyms and more parallel queries, a covering composite index removes even the heap tuple fetch.

### What was changed?
A composite covering index was added to `supabase-schema.sql` and as Migration 18:
```sql
-- Covering index for the RLS subquery pattern used on every protected table:
-- EXISTS (SELECT 1 FROM gyms WHERE id = <table>.gym_id AND owner_id = auth.uid())
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
```

**Run in Supabase SQL Editor:**
```sql
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
```

### Files changed
- `supabase-schema.sql`

---

## 🟡 5.2 — `support/clear` Service Role Bypass for UPDATE Policy That Already Existed

This was **resolved as part of fix 3.4** above. The underlying issue (no UPDATE policy on `support_tickets`) was the root cause that led to the service role workaround. By adding the correct RLS UPDATE policy (Migration 17) and removing the service role client from the route handler, both 3.4 and 5.2 were resolved together.

---

## 🟢 5.3 — `geo_localities`/`geo_aliases` Had No Documentation on Intentional Implicit DENY

### What was the problem?
`geo_localities` and `geo_aliases` are global reference tables (canonical place names). Their RLS setup correctly has only `SELECT` policies for authenticated users, with no `INSERT/UPDATE/DELETE` policies. In PostgreSQL, when RLS is enabled and no matching policy exists for an operation, the default is `DENY` — so mutations are blocked.

However, the comment in `supabase-schema.sql` only said:
```sql
-- Hardened: Only service role or admins should modify global localities/aliases
-- For this SaaS, we restrict to SELECT for regular authenticated users.
```

This is vague. A future developer might see "no INSERT policy" and think it was accidentally omitted, and add a permissive one — which would be a serious security regression.

### What was changed?
The comment was expanded to be explicit and defensive:
```sql
-- INSERT/UPDATE/DELETE on geo_localities and geo_aliases is intentionally blocked for regular users.
-- In Postgres RLS, when ENABLE ROW LEVEL SECURITY is on and no matching policy exists for an
-- operation, the default is DENY. There are intentionally no INSERT/UPDATE/DELETE policies here.
-- Use the service role (admin client) for bulk seed operations only.
-- Do NOT add a permissive mutation policy thinking you are "filling a gap" — this is by design.
```

### Files changed
- `supabase-schema.sql`

---

## 🟢 6.1 — `getGymForUser` vs `getGym` Had No Documentation on When to Use Each

### What was the problem?
Two functions exist that both look up a gym by user ID:
- `getGymForUser(supabase, userId)` in `lib/supabase/queries.ts` — accepts an existing client.
- `getGym(userId)` in `lib/dal.ts` — creates its own client, is cached with `React.cache()`.

There was no documentation explaining the distinction. Developers reading the codebase might use `getGymForUser` in a Server Component (wrong — misses deduplication) or use `getGym` in an API route by importing it and creating a duplicate Supabase client (wrong — creates a second client when one already exists).

### What was changed?
The JSDoc comment on `getGymForUser` was expanded to explain the intended usage pattern:
```ts
/**
 * Retrieves the gym associated with the current user.
 *
 * **For use in API Route Handlers only** — accepts an already-created Supabase client
 * so no second client instantiation is needed within the same request.
 *
 * For Server Components and Server Actions, use `getGym()` from `lib/dal.ts` instead,
 * which is memoised with React.cache() for deduplication within the same render.
 */
```

### Files changed
- `lib/supabase/queries.ts`

---

## 🟢 6.2 — `_reports_archived/` Was Still in the `app/` Directory

### What was the problem?
`app/_reports_archived/` contained a full page route (`page.tsx`, `layout.tsx`, `loading.tsx`, `ReportsClient.tsx`) prefixed with `_` to prevent Next.js from routing to it. However:

- Next.js still **compiles** it and includes it in the build graph.
- It still imports Supabase dependencies, adding to the build bundle.
- It contained uncached `supabase.auth.getUser()` calls, a hardcoded `revalidate = 300`, and a large client component.
- It would show up in bundle analysis tools, confusing developers.

### What was changed?
The directory was moved from `app/_reports_archived/` to `_archived/reports/` at the repository root. At the repo root, Next.js does not process it at all — it won't be compiled, imported, or included in the build.

### Files changed
- `app/_reports_archived/` → moved to `_archived/reports/` *(directory move)*

---

## 🟢 6.3 — `app/api/import/route.ts` Was a Stub That Silently Returned Success

### What was the problem?
The route handler `POST /api/import` always returned `{ success: true, data: { message: 'Import started', row_count: N } }` regardless of input, with a comment saying "return a success wrapper as this is an audit of the handler structure". The real import pipeline lives at `POST /api/import/confirm`.

This is dangerous because:
- Any client accidentally calling `/api/import` instead of `/api/import/confirm` would get a `200 OK` response, believe the import succeeded, and silently lose their data.
- The stub would remain silently wrong indefinitely unless someone explicitly noticed the comment.

### What was changed?
The stub response was replaced with a `501 Not Implemented` response that clearly directs callers to the correct endpoint:
```ts
return NextResponse.json({
  success: false,
  error: {
    code: 'NOT_IMPLEMENTED',
    message: 'Use POST /api/import/confirm to submit import rows.'
  }
}, { status: 501 })
```

This makes the problem immediately visible in any API client or browser network tab.

### Files changed
- `app/api/import/route.ts`

---

## 🟠 7.1 — Cache TTL Was Too Short (60s) for the Daily-Access Pattern

### What was the problem?
All `cacheWrapper` calls used a 60-second TTL. The audit report noted that GymFlow's typical access pattern is a **single gym owner visiting once a day** — usually in the morning before their gym opens. This means:

- The owner opens the dashboard → cache miss (60s TTL has long since expired overnight) → full Supabase query.
- The owner navigates to members → cache miss → full query.
- The owner navigates back to dashboard within 60 seconds → cache hit (the only time the cache ever helps!).
- Any visit more than 60 seconds after the last → cache miss again.

The 60-second TTL was providing almost zero benefit for this usage pattern. Meanwhile, the cache was adding:
- Redis infrastructure cost on every request.
- Complexity (invalidation bugs from 2.3 above).
- Potential for stale data after mutations.

The cache was truly the "worst of both worlds": short enough that it almost always missed, long enough to show stale data when it did hit.

### What was changed?
The TTL was extended from `60` to `300` seconds (5 minutes) across all three main page caches:
- `app/dashboard/page.tsx` — `cacheWrapper(cacheKey, 300, ...)`
- `app/members/page.tsx` — `cacheWrapper(cacheKey, 300, ...)`
- `app/payments/page.tsx` — `cacheWrapper(cacheKey, 300, ...)`

Because cache invalidation was correctly wired in fix 2.3, **mutations still bust the cache instantly** — so the 5-minute TTL only applies to the stale-while-no-changes window. A typical session (login → check dashboard → check members → add member → check members again) now gets cache hits on the second visit and stale-free data after mutations.

### Files changed
- `app/dashboard/page.tsx`
- `app/members/page.tsx`
- `app/payments/page.tsx`

---

## 🟡 7.2 — `ADMIN_EMAIL` Env Var Unset Gave the Wrong Error

### What was the problem?
Both `app/admin/layout.tsx` and `app/api/geo/seed/route.ts` gate access to admin-only functionality by checking:
```ts
if (user.email !== process.env.ADMIN_EMAIL) {
  return 403
}
```

If `ADMIN_EMAIL` is not set in the environment (e.g., a misconfigured Vercel deployment), then `process.env.ADMIN_EMAIL` is `undefined`. The comparison `user.email !== undefined` is **always `true`**, so the real admin themselves gets a 403 Forbidden.

The problem: there is **no indication that the env var is missing**. The admin sees "Access Denied" and has no idea why. There's no error in the logs pointing to the missing configuration. This could cost significant debugging time during a deployment.

### What was changed?
The checks were split into two explicit guards:

**Guard 1 — Env var missing (misconfiguration):**
```ts
if (!process.env.ADMIN_EMAIL) {
  console.error('[ADMIN GATE] ADMIN_EMAIL env var is not set — admin routes are inaccessible.')
  // Return 500 (API routes) or redirect to login (layout)
}
```

**Guard 2 — User not admin (legitimate 403):**
```ts
if (user.email !== process.env.ADMIN_EMAIL) {
  // Return 403 / show Access Denied UI
}
```

Now, if `ADMIN_EMAIL` is missing from Vercel environment variables, the Vercel logs immediately show a clear `[ADMIN GATE]` error message pointing to the misconfiguration, and the admin gets a 500 (not a misleading 403).

### Files changed
- `app/admin/layout.tsx`
- `app/api/geo/seed/route.ts`

---

## 🟢 7.3 — No Automated Tests

### What was the problem?
The entire codebase has zero test files. Every verification step in this audit was performed manually. The highest-risk areas with no coverage are:
- RLS policies (a migration mistake could silently expose cross-tenant data).
- Cache invalidation logic (stale data bugs are invisible without load testing).
- Server action auth gates (the 2.1 vulnerability went unnoticed without tests).

### What was done?
No test files were created as part of this remediation (implementing a full test suite is a larger scope project). This issue is **noted as a backlog item**. The recommended minimum coverage is:

1. Integration test for `getAllTimePayments` with an unauthenticated call — should throw, not return data.
2. Integration test for `GET /api/members/:id` with a cross-tenant member ID — should return 404.
3. Unit test for `cacheWrapper` — verify that a cache hit does not re-run the fetch function.

---

## Summary of All SQL Changes to Run in Supabase

The following SQL changes need to be applied to your **live Supabase database** (in addition to the TypeScript changes which deploy automatically):

```sql
-- Migration 17: UPDATE policy for support_tickets
-- (May already exist — skip if you get "policy already exists" error)
CREATE POLICY "Gym owners can update their support tickets"
  ON support_tickets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gyms WHERE id = support_tickets.gym_id AND owner_id = auth.uid()));

-- Migration 18: Covering index for RLS subquery performance
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
```

---

## Files Changed — Complete List

| File | What Changed |
|---|---|
| `app/payments/actions.ts` | Added auth + gym ownership gate before cache lookup |
| `components/layout/AccountMenu.tsx` | Tightened auth state re-fetch guard condition |
| `lib/cache-keys.ts` | **New file** — centralized typed Redis key definitions |
| `app/members/actions.ts` | Added `invalidateMembersCache` server action |
| `app/api/members/route.ts` | Added cache invalidation on POST; added `gym_id` filter on GET |
| `app/members/new/page.tsx` | Wired cache invalidation after new member save |
| `app/members/[id]/MemberDetailClient.tsx` | Wired cache invalidation after membership renewal |
| `app/dues/DuesClient.tsx` | Wired cache invalidation after marking due as paid |
| `app/account/notifications/page.tsx` | Swapped raw auth/gym to DAL functions |
| `app/account/page.tsx` | Swapped raw auth to DAL |
| `app/account/layout.tsx` | Swapped raw auth to DAL |
| `app/inventory/[id]/page.tsx` | Swapped raw auth/gym to DAL functions |
| `app/members/bulk-edit/page.tsx` | Swapped raw auth to DAL |
| `app/api/members/[id]/route.ts` | Added `gym_id` filter to GET to prevent IDOR |
| `app/api/support/clear/route.ts` | Removed service role client; switched to standard `supabase` client |
| `components/layout/ShellGuard.tsx` | Replaced `any` props with strict types; split `useEffect` into two |
| `app/inventory/actions.ts` | Added `checkGymOwnership` auth guard to both invalidate actions |
| `app/api/health/route.ts` | Sanitized error response to return only `error.code` |
| `lib/dal.ts` | Added `onboarding_data` and `created_at` to `getGym()` select |
| `app/members/page.tsx` | Removed redundant DB `.order('name')`; added secondary `localeCompare` sort |
| `lib/cache.ts` | Gated all console.logs behind `NODE_ENV === 'development'`; removed `globalCacheStats` |
| `lib/supabase/queries.ts` | Added JSDoc explaining API-routes-only usage pattern |
| `app/api/import/route.ts` | Changed silent success stub to `501 Not Implemented` |
| `app/api/geo/seed/route.ts` | Added explicit guard for missing `ADMIN_EMAIL` env var |
| `app/admin/layout.tsx` | Added explicit guard for missing `ADMIN_EMAIL` env var |
| `app/dashboard/page.tsx` | Extended cache TTL from 60s to 300s |
| `app/payments/page.tsx` | Extended cache TTL from 60s to 300s |
| `app/_reports_archived/` | **Moved** to `_archived/reports/` (out of Next.js build graph) |
| `supabase-schema.sql` | Removed duplicate RLS statement; added `idx_gyms_id_owner`; expanded geo comment; added Migrations 17 & 18 |
