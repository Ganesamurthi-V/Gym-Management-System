# GymFlow — Speed Branch: Full Codebase Audit Report
**Date:** June 26, 2026  
**Branch:** `speed`  
**Scope:** Performance, Database, Multi-Tenant Isolation, Security, Production Readiness, Code Quality

---

## Executive Summary

The speed branch shows real, meaningful progress from the original codebase. The two critical security vulnerabilities from the prior audit (unauthenticated debug routes exposing service-role data) are **gone**. The DAL (`lib/dal.ts`) with `React.cache()` is correctly implemented and wired into the five core page routes. The CSP headers are fixed. Payments pagination (12-month default + `getAllTimePayments` on demand) is properly implemented.

What remains is a second tier of issues — some introduced by this branch, some inherited and not yet addressed — across four areas: a new auth vulnerability in a server action, incomplete DAL adoption across the app, a cache poisoning gap on every mutation, and several schema/database hygiene issues. None are as severe as the prior critical bugs, but two of the new ones are worth fixing before the next production deploy.

---

## Severity Key

| Level | Meaning |
|---|---|
| 🔴 CRITICAL | Fix before next deploy. Data exposure or auth bypass possible. |
| 🟠 HIGH | Fix this sprint. Correctness or security impact. |
| 🟡 MEDIUM | Fix soon. Performance or code hygiene degradation over time. |
| 🟢 LOW | Nice to fix. Consistency, maintainability. |
| ✅ FIXED | Was flagged in prior audit, now correctly resolved. |

---

## Section 1 — What's Fixed (Prior Audit Items)

These were the top findings from the previous audit. All confirmed resolved.

| Finding | Status |
|---|---|
| `/api/check-columns` and `/api/check-realtime` — unauthenticated service-role data dump | ✅ Deleted |
| Triple `auth.getUser()` on `/dashboard` and `/members` | ✅ Fixed via `lib/dal.ts` + `React.cache()` |
| Duplicate `gyms` table lookup in layout + page | ✅ Collapsed into single `getGym()` call |
| Payments page: unbounded query, no cache | ✅ 12-month window + `cacheWrapper` + `getAllTimePayments` server action |
| CSP missing `wss://*.supabase.co` (Realtime blocked) | ✅ Fixed in `next.config.js` |
| CSP missing `worker-src` (Sentry Replay blocked) | ✅ Fixed in `next.config.js` |
| `schema.sql` duplicate `inventory_sales` + `workout_programs` table definitions | ✅ Resolved — only one definition each now |
| Rate limiting missing on `support/clear`, `support/ticket`, `inventory/sell`, `inventory/delete` | ✅ All four routes now have `checkRateLimit` |
| `app/api/members/route.ts` — no explicit `gym_id` filter (RLS-only) | ✅ Fixed — now explicitly `.eq('gym_id', gym.id)` |

---

## Section 2 — New Issues Introduced in This Branch

These did not exist (or were not exposed) in the original codebase.

---

### 🔴 2.1 — `getAllTimePayments` Server Action Has No Auth Check

**File:** `app/payments/actions.ts`

```ts
export async function getAllTimePayments(gymId: string) {
  const cacheKey = `gym:${gymId}:payments_page:allTime`
  
  return cacheWrapper(cacheKey, 300, async () => {
    const supabase = await createClient()
    
    const [paymentsRes, productSalesRes] = await Promise.all([
      supabase.from('memberships').select('*, member:members(...)').eq('gym_id', gymId)...
      supabase.from('inventory_sales').select('*').eq('gym_id', gymId)...
    ])
    ...
  })
}
```

**The problem:** This is a `'use server'` action that accepts a `gymId` string from the caller — which in this case is `PaymentsClient.tsx`, a **client component**. Server actions are callable from the browser via POST to a Next.js-generated endpoint. There is **zero authentication check** inside the function before hitting the database. Anyone who knows (or guesses) a valid `gym_id` UUID can call this server action directly and receive a full dump of all memberships and inventory sales for that gym, bypassing RLS because the anon-key Supabase client is used and RLS itself uses `auth.uid()` — which is only populated if a valid session cookie is present in the request. A direct server action call without a session cookie will have no `auth.uid()`, and the RLS policy `EXISTS (SELECT 1 FROM gyms WHERE id = ... AND owner_id = auth.uid())` will evaluate to `false`, **blocking the query** — so RLS does protect you here.

**However**, there is a second problem: the result is cached in Redis under `gym:${gymId}:payments_page:allTime` for **300 seconds**. If an authenticated user legitimately calls this, the full payment history is cached. A second request by any caller (authenticated or not) for the same `gymId` key will receive the **cached data directly from Redis, bypassing RLS entirely** — because `cacheWrapper` returns cached data without re-running the Supabase query.

**Fix:** Add an auth + ownership check at the top of the function, before the cache lookup:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'

export async function getAllTimePayments(gymId: string) {
  // Auth gate — must come before cache lookup
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: gym } = await supabase
    .from('gyms').select('id').eq('id', gymId).eq('owner_id', user.id).single()
  if (!gym) throw new Error('Forbidden')

  const cacheKey = `gym:${gymId}:payments_page:allTime`
  return cacheWrapper(cacheKey, 300, async () => {
    // ... existing queries
  })
}
```

---

### 🟠 2.2 — `AccountMenu` Still Does a Full Client-Side Gym Fetch on Auth State Changes

**File:** `components/layout/AccountMenu.tsx`, lines 27–74

The component correctly initialises state from `initialEmail`, `initialGymId`, `initialGymName`, and `initialUnreadCount` props (the AppShell fix working as intended). However, `onAuthStateChange` fires for **every** auth event — including the initial `INITIAL_SESSION` event that fires on mount — and the guard condition is:

```ts
if (session.user.email === initialEmail && initialGymId) {
  // use props — correct
} else {
  fetchForUser(session.user.id, session.user.email ?? '')  // fires a gym + unread fetch
}
```

The `else` branch contains a full `supabase.from('gyms')` query followed by an `admin_messages` count query. This fires on **every page navigation** for any session where the email doesn't exactly match `initialEmail` (e.g. if the server rendered with a stale session or props weren't passed). More importantly, there is also a missing dependency in the condition — `currentUserId.current` de-duplicates by user ID, but `initialEmail` is checked for the early-return, not `initialGymId` being populated. If `initialGymId` is `null` for any reason (gym not yet created, edge case in onboarding), the `fetchForUser` branch fires unconditionally on every auth state event. This is not as severe as the original client-side-only waterfall, but it still introduces a potential double gym fetch per page navigation under certain conditions.

**Fix:** Change the guard to also check `initialGymId && initialEmail`:

```ts
if (session.user.id === currentUserId.current) return  // already handled this user
currentUserId.current = session.user.id

const isSameUser = session.user.email === initialEmail
const haveAllProps = initialGymId && initialGymName

if (isSameUser && haveAllProps) {
  setEmail(initialEmail ?? null)
  setGymId(initialGymId ?? null)
  setGymName(initialGymName ?? null)
  setUnreadCount(initialUnreadCount ?? 0)
} else {
  fetchForUser(session.user.id, session.user.email ?? '')
}
```

---

### 🟡 2.3 — Redis Cache Is Never Invalidated After Mutations (Members, Payments)

**Files:** `app/api/members/route.ts` (POST), `app/members/new/page.tsx`, all membership/payment creation paths

The `cacheWrapper` on `members_list` (60s TTL) and `payments_page:12mo` (60s TTL) caches page data after a cache miss. Nothing in the codebase calls `deleteCache` or `invalidatePattern` after adding/editing a member, adding a payment, or marking dues paid. This means:

- Add a new member → members page shows **stale data for up to 60 seconds**
- Renew a membership → payments page shows **stale data for up to 60 seconds**
- Mark a due as paid → dues page (not cached) updates immediately, but members list still shows old `pending_amount`

Inventory is the only area where cache invalidation is correctly wired (`invalidateInventoryCache` is called in `inventory/new/page.tsx` and `api/inventory/sell/route.ts`).

**Fix:** Add cache invalidation to the mutation paths. A clean pattern is a shared helper:

```ts
// lib/cache-keys.ts
export const cacheKeys = {
  membersList: (gymId: string) => `gym:${gymId}:members_list`,
  dashboard:   (gymId: string, date: string) => `gym:${gymId}:dashboard:${date}`,
  payments12mo:(gymId: string) => `gym:${gymId}:payments_page:12mo`,
  paymentsAll: (gymId: string) => `gym:${gymId}:payments_page:allTime`,
}
```

Then in each mutation route:
```ts
// After successful member insert in POST /api/members
await deleteCache(cacheKeys.membersList(gym.id))
await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))

// After new membership/payment
await deleteCache(cacheKeys.payments12mo(gym.id))
await deleteCache(cacheKeys.paymentsAll(gym.id))
await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))
```

---

## Section 3 — Inherited Issues Not Yet Addressed

These were present in the original codebase and were not part of the speed branch's scope. Listed here for completeness.

---

### 🟠 3.1 — DAL Adoption Is Incomplete: 15+ Pages Still Use Raw `auth.getUser()`

**Files:** `app/account/notifications/page.tsx`, `app/account/page.tsx`, `app/account/layout.tsx`, `app/inventory/[id]/page.tsx`, `app/members/[id]/MemberDetailClient.tsx`, `app/members/[id]/edit/EditMemberClient.tsx`, `app/members/bulk-edit/page.tsx`, `app/members/attendance/page.tsx`, `app/members/attendance/actions.ts`, `app/members/actions.ts` (×2), `app/members/new/page.tsx` (×2), `app/import/edit/page.tsx` (×2), `app/import/review/page.tsx`

The DAL was correctly applied to the five highest-traffic pages (`dashboard`, `members`, `payments`, `dues`, `attendance`). But 15+ call sites across the app still call `supabase.auth.getUser()` directly. These are mostly server actions (which run per-request and cannot benefit from `React.cache()`) and client components (same reason), so the dedup doesn't apply there — but the ones in **server pages** do still pay the unnecessary extra network round trip.

**Specifically impacted server-side pages** (where React.cache() _would_ deduplicate):
- `app/account/notifications/page.tsx` — raw auth + raw gym lookup, both uncached
- `app/account/page.tsx` — raw auth
- `app/account/layout.tsx` — raw auth
- `app/inventory/[id]/page.tsx` — raw auth + raw gym lookup
- `app/members/bulk-edit/page.tsx` — raw auth

**Fix:** Swap `supabase.auth.getUser()` to `getAuthUser()` from `lib/dal.ts` in the server-side pages listed above. Client components and server actions cannot benefit from this and should be left as-is.

---

### 🟠 3.2 — `app/api/members/[id]` GET Route: No `gym_id` Filter (IDOR Vulnerability)

**File:** `app/api/members/[id]/route.ts`, lines 19–29

```ts
const { data, error } = await supabase
  .from('members')
  .select('id, name, phone, age, gender, member_number, legacy_member_id, created_at')
  .eq('id', id)   // ← only filters by member ID, no gym_id check
  .single()
```

The GET handler for a single member does **not** check that the requested member belongs to the requesting user's gym. The PATCH handler on the same file does have this check (`memberCheck.gym_id !== gym.id`), but GET does not. RLS on `members` uses `EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())` which **does** protect this via the database, but this is a defense-in-depth gap: no app-layer validation means that if RLS were ever misconfigured, this endpoint would silently leak member PII (name, phone, age) for any member in the system given only their UUID.

**Fix:**

```ts
const gym = await getGymForUser(supabase, user.id)
if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

const { data, error } = await supabase
  .from('members')
  .select('id, name, phone, age, gender, member_number, legacy_member_id, created_at')
  .eq('id', id)
  .eq('gym_id', gym.id)  // ← add this
  .single()
```

---

### 🟡 3.3 — `supabase-schema.sql` Still Has Duplicate `ALTER TABLE attendance ENABLE ROW LEVEL SECURITY`

**File:** `supabase-schema.sql`, lines 95 and 97

```sql
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;   -- line 95
                                                     -- line 96 (blank)
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;   -- line 97 (duplicate)
```

This is a no-op duplicate — idempotent in Postgres. It won't cause a runtime error, but it signals the schema file is still being maintained by hand-appending rather than through proper migrations, and it will confuse anyone reading the schema to understand what's been enabled. The `inventory_sales` / `workout_programs` duplicate table definitions from the prior audit were fixed, but this one was missed.

**Fix:** Remove line 97.

---

### 🟡 3.4 — `support/clear` Route: Inline `createClient` with Service Role Key

**File:** `app/api/support/clear/route.ts`, lines 29–33

```ts
const serviceRoleClient = (await import('@supabase/supabase-js')).createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

The comment explains why this was done ("bypass missing RLS UPDATE policies for these tables"), which is a legitimate reason. However, creating an inline service role client in a route handler instead of using the shared `lib/supabase/admin.ts` is inconsistent — `lib/supabase/admin.ts` already exists exactly for this purpose, has the same credentials, and is the single place that documents the service role usage. The dynamic `import()` also adds a cold-start overhead on the first call. More importantly, the comment says "missing RLS UPDATE policies" — this implies the underlying issue (no UPDATE policy on `admin_messages`) is a known gap that should be fixed in a migration rather than worked around with a service role bypass.

**Fix (two parts):**
1. Replace the inline `createClient` with `import { createAdminClient } from '@/lib/supabase/admin'`
2. Add an explicit UPDATE RLS policy to `admin_messages` in a migration, then switch this route back to the anon client. The policy already exists in the schema file for the "mark messages as read" case — extend it to cover `is_cleared_by_owner` updates as well.

---

### 🟡 3.5 — `ShellGuard` Props Are Typed `any`

**File:** `components/layout/ShellGuard.tsx`, lines 27–28

```ts
interface ShellGuardProps {
  children: React.ReactNode
  initialUser: any   // ← any
  initialGym: any    // ← any
  ...
}
```

`initialUser` should be typed as `User | null` from `@supabase/supabase-js`. `initialGym` should use the inferred return type from `lib/dal.ts`'s `getGym()`. Using `any` here defeats TypeScript strict mode for the most security-critical component in the app (the one deciding whether to show the dashboard or redirect to login), and means the compiler won't catch a breaking change in the shape of the user/gym object.

**Fix:**

```ts
import type { User } from '@supabase/supabase-js'

type GymRow = Awaited<ReturnType<typeof getGym>>['gym']

interface ShellGuardProps {
  children: React.ReactNode
  initialUser: User | null
  initialGym: GymRow
  initialIsActive: boolean
  initialUnreadCount: number
}
```

---

### 🟡 3.6 — `account/notifications/page.tsx` Does Not Use DAL and Runs Redundant Auth + Gym Lookup

**File:** `app/account/notifications/page.tsx`, lines 13–21

```ts
const { data: { user } } = await supabase.auth.getUser()  // raw auth, no DAL
...
const { data: gym } = await supabase.from('gyms').select('id')...  // raw gym lookup
```

This page also doesn't have a layout that runs auth, so it pays one auth round trip and one gym lookup every visit — both uncached. On a page that marks messages as read and fetches the full message history, this is the highest-traffic non-dashboard page in the app. Switching to the DAL brings it into the same dedup scope as the core pages.

**Fix:** Same as 3.1 — swap to `getAuthUser()` and `getGym()` from `lib/dal.ts`.

---

### 🟢 3.7 — `invalidateInventoryCache` Server Action Has No Auth Check

**File:** `app/inventory/actions.ts`

```ts
export async function invalidateInventoryCache(gymId: string) {
  await redis.del(`inventory:${gymId}`)
}
```

This is a `'use server'` function that deletes a Redis key for any `gymId` passed to it. It's only called from `inventory/new/page.tsx` (client component, post-save) so in practice it's fine — but as a server action callable from the browser, anyone can call it with any gym ID and force a cache miss for that gym's inventory on the next page load (a cache-busting DoS). It doesn't expose data, but it degrades performance for targeted gyms.

**Fix:** Add an auth + ownership check before deleting, same pattern as the `getAllTimePayments` fix above.

---

### 🟢 3.8 — Health Endpoint Leaks Internal Infrastructure Details

**File:** `app/api/health/route.ts`

The response body includes `latency_ms` and `timestamp` which is fine. However, on failure it returns the raw Supabase error object:

```ts
return NextResponse.json({ 
  status: 'unhealthy',
  database: 'error',
  error: error,   // ← raw Supabase error object, may include connection string fragments
  timestamp: ...
}, { status: 503 })
```

The raw Supabase error can include `message`, `hint`, `details` — fields that sometimes contain partial SQL, table names, or error codes that aid reconnaissance. This is a public unauthenticated endpoint (intended for uptime monitoring).

**Fix:** Return only a sanitised error code on failure:

```ts
return NextResponse.json({ 
  status: 'unhealthy',
  database: 'error',
  error: error?.code ?? 'DB_ERROR',  // code only, not full error object
  timestamp: new Date().toISOString()
}, { status: 503 })
```

---

## Section 4 — Performance

---

### 🟠 4.1 — `getGym()` in DAL Returns Only 4 Fields, But Some Pages Need More

**File:** `lib/dal.ts`, line 11

```ts
export const getGym = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, name, onboarding_completed, owner_id')
    ...
})
```

The prior audit corrected `dashboard/layout.tsx`'s narrower select (which only fetched `onboarding_completed`) to instead use a full row from the DAL. The DAL select was set to these four fields. This is fine for all current callers. However, `onboarding_data` (used by `members/new/page.tsx` to populate gym plan defaults) is fetched separately with a second direct `supabase.from('gyms')` query because it's not in the DAL's select. This means `members/new/page.tsx` effectively runs two gym lookups per page visit — one via DAL (deduped) and one raw (not deduped). If `onboarding_data` is needed at all it should be in the DAL's select, even if most callers ignore the field.

**Fix:** Add `onboarding_data` to the DAL's `select` string. Callers that don't need it will simply ignore the extra column — the query cost is negligible.

---

### 🟡 4.2 — Members Page: CLIENT-SIDE Sort After Server-Side `.order('name')`

**File:** `app/members/page.tsx`, lines 65–68

The members query uses `.order('name')` (alphabetical), but the aggregation step immediately re-sorts by status:

```ts
.sort((a, b) => {
  const order = { expiring: 0, active: 1, expired: 2 }
  return order[a.status] - order[b.status]
})
```

This is correct behaviour — status sort takes precedence — but the database `.order('name')` sort is now completely discarded (members within each status group have no guaranteed order). The database is doing unnecessary sort work that is immediately overwritten in JS. With `PAGE_SIZE = 200` this is negligible, but it's a misleading code pattern.

**Fix:** Either remove `.order('name')` from the query (let JS handle all ordering), or add a secondary JS sort by name within each status group: `|| a.name.localeCompare(b.name)`.

---

### 🟡 4.3 — `ShellGuard` `useEffect` Dependency Array Includes `pathname`

**File:** `components/layout/ShellGuard.tsx`, line 85

```ts
}, [isShellless, pathname, initialUser, initialIsActive])
```

Including `pathname` in the dependency array means this `useEffect` re-runs on **every page navigation**, re-registering the `window.addEventListener('focus', checkAuth)` and re-starting the `setInterval(checkAuth, 10000)`. The cleanup function correctly removes the old listener and clears the old interval, so there's no leak — but the pattern creates unnecessary listener churn: every navigation tears down and rebuilds both the focus listener and the 10-second interval (resetting the timer). The interval should only be set up once on mount.

**Fix:** Split into two effects: one for the one-time auth/active check and interval setup (no `pathname` dependency), and one for the `isShellless` exclusion logic.

---

### 🟡 4.4 — `cacheWrapper` `console.log` Fires on Every Cache Hit/Miss in Production

**File:** `lib/cache.ts`

```ts
console.log(`CACHE HIT: ${key}`)
console.log(`CACHE MISS: ${key}`)
console.log(`[CACHE][Event] ${type}: ${key} - ${durationMs}ms`)
console.log(`[CACHE] Hits: ${globalCacheStats.hits} | Misses: ...`)
```

Four `console.log` calls fire on every single cache operation. `next.config.js` has `removeConsole` set to `{ exclude: ['error', 'warn'] }` for production builds, which will remove plain `console.log` calls — so these **are** stripped in production. However:

1. The `globalCacheStats` object is module-level state on the server. In a multi-worker/serverless environment (Vercel), each cold-start gets its own `globalCacheStats` — the running totals are meaningless and reset with every function invocation.
2. In development, these logs add significant noise to every request trace, making it harder to see real logs.

**Fix:** Gate the stat logging behind `process.env.NODE_ENV === 'development'`, or remove `globalCacheStats` entirely since it doesn't work correctly in serverless anyway.

---

## Section 5 — Database & Schema

---

### 🟡 5.1 — RLS Subquery Pattern Has No Supporting Function Index

**All tables with RLS policies**

Every RLS policy in the schema uses this pattern:

```sql
EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid())
```

This subquery runs on **every row** evaluated by any query on any protected table. The `gyms` table has an index on `id` (primary key) but no composite index on `(id, owner_id)` together. For a small tenant (one gym row per user), the index on `id` alone is sufficient and the `AND owner_id = auth.uid()` filter on a single-row result set costs nothing. However, as the platform grows (more gyms, more queries hitting the same RLS check in parallel), a covering index becomes worthwhile.

**Fix (low urgency, add in next migration):**

```sql
CREATE INDEX IF NOT EXISTS idx_gyms_owner_id ON gyms(owner_id);
-- or a covering index if you want to avoid the heap lookup:
CREATE INDEX IF NOT EXISTS idx_gyms_id_owner ON gyms(id, owner_id);
```

---

### 🟡 5.2 — `admin_messages` Has No UPDATE RLS Policy for `is_cleared_by_owner`

**File:** `supabase-schema.sql`, admin_messages RLS section

There is an UPDATE policy for marking messages as read:

```sql
CREATE POLICY "Gym owners can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (EXISTS (...))
```

This policy allows any update to `admin_messages` where the gym matches — including updating `is_cleared_by_owner`. So the comment in `support/clear/route.ts` saying "bypass missing RLS UPDATE policies" is **incorrect** — the UPDATE policy exists. The service role client usage in that route is unnecessary. This was likely added as a workaround for a bug that has since been fixed by the migration.

**Fix:** Remove the service role bypass in `support/clear/route.ts` and use the regular anon client. Verify in the Supabase dashboard that the UPDATE policy is active on the correct table.

---

### 🟢 5.3 — `geo_localities` and `geo_aliases` Have SELECT-Only RLS (No INSERT/UPDATE/DELETE)

**File:** `supabase-schema.sql`, lines 351–356

```sql
CREATE POLICY "Authenticated users can read localities"
  ON geo_localities FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read aliases"
  ON geo_aliases FOR SELECT USING (auth.uid() IS NOT NULL);
```

These are global reference tables (locality names, normalised aliases). SELECT-only for all authenticated users is correct and intentional per the comment "Only service role or admins should modify." However, there is **no DENY INSERT/UPDATE/DELETE policy** — in Postgres RLS, when `ENABLE ROW LEVEL SECURITY` is on and no matching policy exists for an operation, the default is DENY. So mutation is implicitly blocked by absence of policy, which is correct. This is worth documenting explicitly so future maintainers don't add a permissive policy thinking they're filling a gap.

**Recommendation (no code change, doc only):** Add a comment above these policies:

```sql
-- INSERT/UPDATE/DELETE on geo_localities and geo_aliases is intentionally blocked for regular users.
-- Use the service role (admin client) for bulk seed operations only.
```

---

## Section 6 — Code Quality

---

### 🟢 6.1 — `lib/supabase/queries.ts` (`getGymForUser`) Is Now Redundant With the DAL

**File:** `lib/supabase/queries.ts`

`getGymForUser(supabase, userId)` is used in 6 API route files. The DAL's `getGym(userId)` does the same thing (and more — it's cached within a request). The difference is that `getGymForUser` takes an already-created client as a parameter (useful in API routes where the client is already created for auth) while `getGym` creates its own client internally. Both are correct patterns for their contexts.

The issue is inconsistency: some routes use `getGymForUser`, others directly query `gyms` inline. This makes it harder to audit gym ownership checks at a glance.

**Recommendation:** Keep `getGymForUser` for API routes (correct pattern — no need to create a second client). Standardise all page server components to use `getGym` from the DAL. Document the distinction in `queries.ts`:

```ts
/**
 * For use in API Route Handlers only — accepts an existing client.
 * For Server Components / Server Actions, use getGym() from lib/dal.ts instead.
 */
export async function getGymForUser(supabase: SupabaseClient, userId: string) { ... }
```

---

### 🟢 6.2 — `_reports_archived/` Directory Should Not Be in the Repo

**File:** `app/_reports_archived/`

This folder contains a full page route (`page.tsx`, `layout.tsx`, `loading.tsx`, `ReportsClient.tsx`) prefixed with `_` to prevent Next.js from routing it. It still compiles, still imports dependencies, still adds to the build graph, and contains `supabase.auth.getUser()` (uncached, not DAL), a hardcoded `revalidate = 300`, and a large client component. It should either be deleted or moved outside the `app/` directory (e.g. `_archived/reports/` at the repo root) so Next.js doesn't include it in the build.

---

### 🟢 6.3 — `import/route.ts` Is a Stub That Does Nothing

**File:** `app/api/import/route.ts`

```ts
// Logic for parsing/validating import rows would go here
// For now, return a success wrapper as this is an audit of the handler structure

return NextResponse.json({
  success: true,
  data: { message: 'Import started', row_count: body.rows?.length ?? 0 },
})
```

The real import logic lives in `app/api/import/confirm/route.ts`. This stub handler will always return `success: true` with zero processing, regardless of what's in the body. If any client code calls `/api/import` (rather than `/api/import/confirm`) it will silently succeed and discard the data. This needs to either be wired to the actual import pipeline or deleted.

---

## Section 7 — Production Readiness

---

### 🟠 7.1 — No Cache Warming Strategy: First Request After Cold Start Is Slow

All `cacheWrapper` calls operate as read-through cache — the first request after a cold start (or after the 60-second TTL expires) hits Supabase directly with no user feedback. For the dashboard, members, and payments pages, this means the first visitor after cache expiry gets the full latency of the original waterfall. There is no background revalidation, no SWR-style stale-while-revalidate, and no cache warming on deploy.

**For a gym SaaS**, the access pattern is typically a single owner visiting once a day in the morning — meaning every visit is likely a cold cache. The 60-second TTL is potentially adding complexity (Redis cost, invalidation bugs from 2.3 above) without delivering the latency benefit it implies, because the owner's first visit of the day is always a miss anyway.

**Recommendation:** Either extend the TTL to 5–15 minutes (so the cache persists across a typical session, not just within one minute) or implement a revalidation webhook that fires after mutations. The current 60-second TTL is the worst of both worlds: short enough that it usually misses, long enough to show stale data after an add/edit.

---

### 🟡 7.2 — `ADMIN_EMAIL` Environment Variable Is a Weak Admin Gate

**Files:** `app/api/geo/seed/route.ts`, `app/admin/layout.tsx`

Both admin-gated routes use:

```ts
if (user.email !== process.env.ADMIN_EMAIL) {
  return 403
}
```

This is correct for a single-operator SaaS, but has a few risks:
- If `ADMIN_EMAIL` is not set, `process.env.ADMIN_EMAIL` is `undefined`, and `user.email !== undefined` is always `true`, **blocking all users including the admin**. There's no fail-open risk here, but a misconfigured env var silently locks out the admin with no helpful error.
- Email is not immutable — a user can potentially change their email in Supabase Auth, and then the check would fail until the env var is updated.

**Fix:** Log a warning if `ADMIN_EMAIL` is unset, and return a `500` (not `403`) so it's immediately visible during setup rather than silently failing:

```ts
if (!process.env.ADMIN_EMAIL) {
  console.error('ADMIN_EMAIL env var is not set — admin routes are inaccessible')
  return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
}
if (user.email !== process.env.ADMIN_EMAIL) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

---

### 🟢 7.3 — No Automated Tests

The codebase has zero test files (`*.test.ts`, `*.spec.ts`, `__tests__/`). Every verification step in the remediation plans has been manual. The highest-risk areas with no test coverage are:

- RLS policies (a migration mistake could silently expose cross-tenant data)
- Cache invalidation logic (stale data bugs are invisible without load testing)
- Server action auth gates (the `getAllTimePayments` issue above went unnoticed)
- The `getAllTimePayments` server action fix itself (regression risk)

**Minimum recommended coverage:**
1. Integration test for `getAllTimePayments` with an unauthenticated call — should throw, not return data
2. Integration test for `GET /api/members/:id` with a cross-tenant member ID — should return 404
3. Unit test for `cacheWrapper` — verify that a cache hit does not re-run the fetch function

---

## Summary Table

| # | Issue | Severity | File(s) |
|---|---|---|---|
| 2.1 | `getAllTimePayments` — no auth check, stale cache served without re-auth | 🔴 CRITICAL | `app/payments/actions.ts` |
| 2.2 | `AccountMenu` — re-fetches gym on every auth state event in some conditions | 🟠 HIGH | `components/layout/AccountMenu.tsx` |
| 2.3 | Cache never invalidated after member/payment mutations | 🟡 MEDIUM | `app/api/members/route.ts`, `app/members/new/` |
| 3.1 | DAL not adopted in 5 server pages (redundant raw auth calls) | 🟠 HIGH | `account/`, `inventory/[id]`, `members/bulk-edit` |
| 3.2 | `GET /api/members/[id]` — no `gym_id` isolation (IDOR, RLS-only protection) | 🟠 HIGH | `app/api/members/[id]/route.ts` |
| 3.3 | Duplicate `ALTER TABLE attendance ENABLE ROW LEVEL SECURITY` in schema | 🟡 MEDIUM | `supabase-schema.sql` line 97 |
| 3.4 | `support/clear` uses inline service role client instead of shared admin client | 🟡 MEDIUM | `app/api/support/clear/route.ts` |
| 3.5 | `ShellGuard` props typed as `any` | 🟡 MEDIUM | `components/layout/ShellGuard.tsx` |
| 3.6 | `notifications/page.tsx` — raw auth + raw gym, not using DAL | 🟡 MEDIUM | `app/account/notifications/page.tsx` |
| 3.7 | `invalidateInventoryCache` server action — no auth check | 🟢 LOW | `app/inventory/actions.ts` |
| 3.8 | Health endpoint leaks raw Supabase error object | 🟢 LOW | `app/api/health/route.ts` |
| 4.1 | `getGym()` in DAL missing `onboarding_data` field — causes second gym lookup | 🟠 HIGH | `lib/dal.ts` |
| 4.2 | Members page: DB `.order('name')` immediately overridden by JS sort | 🟡 MEDIUM | `app/members/page.tsx` |
| 4.3 | `ShellGuard` useEffect re-runs on every `pathname` change | 🟡 MEDIUM | `components/layout/ShellGuard.tsx` |
| 4.4 | `cacheWrapper` logs 4 `console.log`s per operation (stripped in prod, noisy in dev) | 🟡 MEDIUM | `lib/cache.ts` |
| 5.1 | No index on `gyms(owner_id)` to support RLS subquery | 🟡 MEDIUM | `supabase-schema.sql` |
| 5.2 | `support/clear` service role workaround for UPDATE policy that actually exists | 🟡 MEDIUM | `app/api/support/clear/route.ts` |
| 5.3 | `geo_localities`/`geo_aliases` — no DENY policy comment, implicit block undocumented | 🟢 LOW | `supabase-schema.sql` |
| 6.1 | `getGymForUser` vs `getGym` — two functions doing same job, inconsistent usage | 🟢 LOW | `lib/supabase/queries.ts` |
| 6.2 | `_reports_archived/` still in `app/` directory, compiles into build | 🟢 LOW | `app/_reports_archived/` |
| 6.3 | `app/api/import/route.ts` is a stub that silently succeeds | 🟢 LOW | `app/api/import/route.ts` |
| 7.1 | 60s TTL too short for single-owner daily access pattern; no cache warming | 🟠 HIGH | `lib/cache.ts`, all page queries |
| 7.2 | `ADMIN_EMAIL` env var unset → 500 not 403, no helpful error | 🟡 MEDIUM | `app/api/geo/seed/route.ts`, `app/admin/layout.tsx` |
| 7.3 | No automated tests — critical paths verified manually only | 🟢 LOW | (entire codebase) |

---

## Recommended Fix Order

**This week (before next deploy):**
1. **2.1** — Auth gate on `getAllTimePayments` (30 mins, high impact)
2. **3.2** — Add `gym_id` filter to `GET /api/members/[id]` (10 mins)
3. **4.1** — Add `onboarding_data` to DAL `getGym()` select (5 mins)

**This sprint:**
4. **2.3** — Cache invalidation on member/payment mutations
5. **3.1** + **3.6** — Swap remaining server pages to DAL
6. **2.2** — Fix `AccountMenu` auth state re-fetch condition
7. **7.1** — Extend cache TTL to 5–15 minutes
8. **5.2** — Remove unnecessary service role bypass in `support/clear`

**Backlog:**
9. **3.3**, **3.4**, **3.5**, **4.3**, **4.4** — code quality and consistency items
10. **7.2** — ADMIN_EMAIL guard hardening
11. **7.3** — Add first integration tests for auth gates and cache logic
12. **6.2**, **6.3** — Archived code cleanup