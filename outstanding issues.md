# GymFlow — New Performance & Security Findings
**Date:** June 26, 2026
**Branch:** `speed`
**Scope:** Issues not covered in the original audit, remediation doc, or `outstanding issues.md`. All three previously-fixed issues were re-verified and remain correctly fixed.

---

## Summary

This pass went beyond the dashboard/members/payments pages already covered and looked at the global shell (runs on every navigation), middleware, the inventory module, CSP, and API routes not yet reviewed. Six new issues were found:

| # | Issue | Severity | Type |
|---|---|---|---|
| 1 | `AppShell` re-fetches gym status & unread count on every navigation, uncached | 🟠 HIGH | Performance |
| 2 | Inventory page cache returns a double-JSON-encoded string instead of data | 🔴 CRITICAL | Performance / Correctness |
| 3 | CSP `connect-src` blocks Google Places API calls | 🟠 HIGH | Functional / Security-adjacent |
| 4 | `/api/import/confirm` has no rate limit and no row cap | 🟠 HIGH | Security / Performance |
| 5 | `/api/attendance` imports `checkRateLimit` but never calls it; no member-gym ownership check | 🟡 MEDIUM | Security |
| 6 | Bulk import and gym deletion don't invalidate Redis cache | 🟡 MEDIUM | Performance |

---

## 🔴 Issue 1 — Inventory Cache Returns a Double-Encoded String (Breaks the Page Silently)

### What's the problem?

`lib/api/inventory.ts` calls `JSON.stringify()` manually before storing in Redis, then expects to get the original object/array back on a cache hit:

```ts
// lib/api/inventory.ts
const cachedData = await redis.get(cacheKey)
if (cachedData) {
  return cachedData as any[]   // ← assumes this is already an array
}
// ...
await redis.set(cacheKey, JSON.stringify(items), { ex: CACHE_EXPIRY })  // ← manually stringified
```

This is inconsistent with every other cache usage in the codebase. `lib/cache.ts` (used by the dashboard, members, and payments pages) passes the raw object straight to `redis.set()`:

```ts
// lib/cache.ts — the correct pattern used everywhere else
await redis.set(key, data, { ex: ttlSeconds })   // no manual stringify
```

The `@upstash/redis` client (`^1.38.0`) already serializes/deserializes JSON internally. Calling `JSON.stringify()` yourself before `redis.set()` means the value gets encoded twice — once by your code, once by the client. On `redis.get()`, the client only undoes one layer of encoding, so what comes back is the **JSON string itself**, not the parsed array.

### Why it matters

`app/inventory/page.tsx` calls `getCachedInventory(gym.id)` and immediately does:
```ts
items = allItems.filter(item => { ... })
```

On a cache **miss** (first visit, or after the 10-minute TTL expires), this works fine — `allItems` is a real array straight from Supabase. On a cache **hit** (every visit within 10 minutes of the last), `allItems` is a string, `.filter` throws a `TypeError`, the surrounding `try/catch` silently swallows it, and `items` falls back to `[]`.

**Net effect: the inventory list appears empty to the gym owner for up to 10 minutes after the first load of any given session, even when the gym has stock.** This is the most severe issue in this pass — it's not a slowdown, it's a silent data-availability bug that looks like "we have no inventory."

The same double-encoding bug exists in `getCachedInventoryItem` and `getCachedInventorySales`, which feed the inventory detail page (`app/inventory/[id]/page.tsx`). A cache hit there means `product.product_name` is accessed on a string, which would either throw (caught and shown as a 404 via `notFound()`) or return `undefined`, depending on exactly where the parsed value lands.

### Fix

Remove the manual `JSON.stringify()` calls in `lib/api/inventory.ts` and let the Upstash client handle serialization, matching the pattern already used in `lib/cache.ts`:

```ts
export async function getCachedInventory(gymId: string) {
  const cacheKey = `inventory:${gymId}`

  const cachedData = await redis.get<any[]>(cacheKey)
  if (cachedData) {
    return cachedData
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching inventory from Supabase:', error)
    throw error
  }

  const items = data || []
  await redis.set(cacheKey, items, { ex: CACHE_EXPIRY })   // no JSON.stringify
  return items
}
```

Apply the same change to `getCachedInventoryItem` and `getCachedInventorySales` (remove `JSON.stringify(...)` from the `redis.set()` calls and remove the manual cast on `redis.get()`).

**Verification after fixing:** load `/inventory`, wait, reload within 10 minutes (forces a cache hit), and confirm items still render. The original bug would only show up on the *second* load, not the first — that's likely why it slipped through manual testing.

---

## 🟠 Issue 2 — `AppShell` Hits the Database Twice on Every Page Navigation, With No Caching

### What's the problem?

`components/layout/AppShell.tsx` wraps the entire app (root layout) and runs on every full page load:

```ts
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()
  // ...
  const [gymResult, activeStatusResult] = await Promise.all([
    getGym(user.id),
    getGymActiveStatus(user.email ?? '')   // → RPC call: check_gym_active
  ])
  // ...
  const { count } = await getUnreadAdminMessages(gym.id)  // → count query on admin_messages
  // ...
}
```

`getGymActiveStatus` and `getUnreadAdminMessages` (in `lib/dal.ts`) are wrapped in `React.cache()`, which only deduplicates calls **within a single request** — it provides zero caching across page navigations. Unlike the dashboard, members, and payments pages (which use `cacheWrapper` from `lib/cache.ts` with a 300-second Redis TTL), these two calls hit the database fresh on literally every page load, including simple navigations like clicking from Dashboard to Members.

### Why it matters

This is the single most frequently-executed piece of server code in the app — it runs before every page's own content loads, on every click. Two extra round trips (an RPC call plus a count query) on every navigation adds latency to every single page switch, which is broader in impact than any of the per-page caching already done, since it affects all pages, not just one.

`check_gym_active` is unlikely to change more than once a day (it reflects subscription/account status), and the unread message count only needs to update within a few seconds of a real change — both are excellent candidates for the same Redis caching pattern already proven out elsewhere in the codebase.

### Fix

Wrap both in `cacheWrapper` with a short TTL (these need to feel fresh, so keep it tighter than the 300s page-level TTL — 30–60s is reasonable for unread count, longer for active status):

```ts
// lib/dal.ts
import { cacheWrapper } from '@/lib/cache'

export const getGymActiveStatus = cache(async (email: string) => {
  return cacheWrapper(`active_status:${email}`, 120, async () => {
    const supabase = await createClient()
    const { data: isActive, error } = await supabase.rpc('check_gym_active', { p_email: email })
    return { isActive, error }
  })
})

export const getUnreadAdminMessages = cache(async (gymId: string) => {
  return cacheWrapper(`unread_count:${gymId}`, 30, async () => {
    const supabase = await createClient()
    const { count, error } = await supabase
      .from('admin_messages')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .is('read_at', null)
    return { count, error }
  })
})
```

If you add this, also invalidate `unread_count:${gymId}` from wherever messages get marked as read (`app/account/notifications/page.tsx`) so the badge doesn't appear stuck for up to 30 seconds after clearing it.

---

## 🟠 Issue 3 — CSP `connect-src` Blocks Google Places Autocomplete Network Calls

### What's the problem?

`next.config.js` sets this CSP header:

```js
"connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://content-crawdad-120459.upstash.io",
```

The Google Maps JavaScript SDK is loaded via a `<script>` tag (covered by `script-src`, which does allow `maps.googleapis.com`) in both `GooglePlacesAutocomplete.tsx` and `OnboardingWizard.tsx`. But once loaded, the SDK's `AutocompleteService.getPlacePredictions()` and `PlacesService.getDetails()` calls make their own `fetch`/`XHR` requests to Google's backend (`maps.googleapis.com` and related domains) — and those are governed by `connect-src`, not `script-src`. `maps.googleapis.com` is missing from `connect-src`.

### Why it matters

In browsers that strictly enforce CSP, every autocomplete keystroke and every place-detail lookup will be blocked by the browser itself, not by any application code. The component does have a fallback path (`apiError` state, manual text entry), but the CSP block doesn't set `apiError` — it just causes the underlying network call to silently fail, so the user sees a non-functional autocomplete dropdown that never shows suggestions, with no visible explanation. This affects both the member-creation flow (`GooglePlacesAutocomplete.tsx`) and onboarding (`OnboardingWizard.tsx`).

### Fix

Add the Google Maps API domains to `connect-src` in `next.config.js`:

```js
"connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://content-crawdad-120459.upstash.io https://maps.googleapis.com https://maps.gstatic.com",
```

After deploying, test the address autocomplete field in a browser with CSP reporting enabled (check the DevTools console for `Refused to connect` errors) to confirm no further domains are needed.

---

## 🟠 Issue 4 — `/api/import/confirm` Has No Rate Limit and No Row-Count Cap

### What's the problem?

```ts
// app/api/import/confirm/route.ts
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'   // imported...

export async function POST(req: NextRequest) {
  // ...
  const { rows, gym_id } = body
  if (!Array.isArray(rows) || rows.length === 0) { ... }
  // ...never calls checkRateLimit, and never checks rows.length against a maximum
  const { data, error } = await supabase.from('members').insert(rows.map(...))
  // ...
}
```

`checkRateLimit` is imported but never invoked — this route has no per-user throttle at all, unlike every comparable mutation route in the app (members, payments, attendance-adjacent routes, inventory). There's also no upper bound on `rows.length`; the entire array from the request body is mapped and inserted in a single `.insert()` call regardless of size.

### Why it matters

This is the highest-volume write endpoint in the app — it's designed for bulk import, which makes the lack of limits more consequential than on a single-record route. A malicious or buggy client (or a legitimate user with a very large CSV) can:
- Send an arbitrarily large `rows` array in one request, generating a single, very large `INSERT` that could be slow, memory-heavy, or hit a Supabase request-size limit unpredictably.
- Call the endpoint repeatedly with no cooldown, since there's no rate limiter actually checking anything.

### Fix

Add the rate-limit check (the import already exists, it's just unused) and a sane row cap:

```ts
const MAX_IMPORT_ROWS = 500   // tune to your actual CSV size expectations

export async function POST(req: NextRequest) {
  // ...
  const { allowed } = await checkRateLimit(user.id, '/api/import/confirm', 5)
  if (!allowed) {
    return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })
  }

  const { rows, gym_id } = body
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Rows are required' } }, { status: 400 })
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: `Maximum ${MAX_IMPORT_ROWS} rows per import` } }, { status: 400 })
  }
  // ... rest unchanged
}
```

For very large legitimate imports, consider chunking client-side (e.g. 500 rows per request, called repeatedly) rather than raising the cap indefinitely.

---

## 🟡 Issue 5 — `/api/attendance`: Unused Rate-Limit Import, No Member-Ownership Check

### What's the problem?

```ts
// app/api/attendance/route.ts
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'   // imported, never called

export async function POST(req: NextRequest) {
  // ...
  const { member_id, date, status } = body
  const gym = await getGymForUser(supabase, user.id)
  if (!gym) return NextResponse.json(..., { status: 404 })

  const { data, error } = await supabase
    .from('attendance')
    .upsert({ member_id, date, gym_id: gym.id }, { onConflict: 'member_id,date' })
    // ...
}
```

Same dead-import pattern as Issue 4 — `checkRateLimit` is imported but not used. Separately, the route trusts `member_id` from the request body without verifying it belongs to `gym.id`. The RLS `INSERT` policy on `attendance` only checks that `gym_id` matches the caller's own gym — it does not check that `member_id` belongs to that `gym_id`, since `members` and `attendance` are different tables and the policy doesn't cross-reference them.

### Why it matters

This is lower severity than Issue 4 because `member_id` is a UUID (hard to guess) and the blast radius is limited to attendance records, not financial or PII data. But it's a real gap: a caller who knows (or brute-forces/leaks) another gym's `member_id` could mark attendance against it using their own `gym_id`, creating a cross-tenant data integrity issue (an attendance row pointing to a member in a different gym than the one the row claims). It's also simply inconsistent with the rest of the codebase, which checks ownership explicitly at the app layer as defense-in-depth even where RLS already covers the common case (see fix 3.2 in the original audit, which added exactly this kind of check to `GET /api/members/[id]`).

### Fix

```ts
export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/attendance', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    const { member_id, date, status } = body

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    // Verify the member belongs to this gym before marking attendance
    const { data: member } = await supabase.from('members').select('gym_id').eq('id', member_id).single()
    if (!member || member.gym_id !== gym.id) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('attendance')
      .upsert({ member_id, date, gym_id: gym.id }, { onConflict: 'member_id,date' })
      .select('id')
      .single()

    // ... rest unchanged
  }
}
```

---

## 🟡 Issue 6 — Bulk Import and Gym Deletion Don't Invalidate the Cache

### What's the problem?

Following the same class of bug as the previously-fixed cache invalidation gaps:

- `app/api/import/confirm/route.ts` inserts potentially hundreds of new members but never invalidates `membersList` or `dashboard` caches. This is the worst version of the staleness bug seen so far — instead of one member being stale, an entire bulk import is invisible on the members list for up to 5 minutes.
- `app/api/account/delete-gym/route.ts` deletes the gym row entirely (cascading to all related tables) but leaves any cached `members_list`, `dashboard`, and `payments_page` Redis keys for that `gym_id` in place until they expire naturally. Low impact since the gym and its owner's session are both gone, but worth a one-line cleanup for hygiene.

### Fix

In `app/api/import/confirm/route.ts`, after the successful insert:
```ts
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

await deleteCache(cacheKeys.membersList(gym.id))
await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))
```

In `app/api/account/delete-gym/route.ts`, after the successful gym delete (optional, but cheap to add):
```ts
import { invalidatePattern } from '@/lib/cache'

await invalidatePattern(`gym:${gym_id}:*`)
```

---

## What Was Re-Verified (Still Correctly Fixed)

The three issues from `outstanding issues.md` were checked again in this upload and remain correctly fixed:
- Cache invalidation in `EditMemberClient.tsx`, `BulkEditClient.tsx`, `app/api/members/[id]/route.ts` (PATCH), `app/api/payments/route.ts` (POST).
- `support_tickets` UPDATE RLS policy present in `supabase-schema.sql`.
- Duplicate `idx_gyms_id_owner` index removed (only one definition remains).

---

## Recommended Fix Order

1. **Issue 1** (inventory cache double-encoding) — silently breaks a whole page, fix immediately.
2. **Issue 4** (import/confirm rate limit + row cap) — unbounded write endpoint, fix this week.
3. **Issue 3** (CSP blocking Places API) — visible feature breakage for users with strict CSP enforcement.
4. **Issue 2** (AppShell caching) — affects every page switch; biggest aggregate latency win available.
5. **Issue 5** (attendance rate limit + ownership check) — defense-in-depth, lower urgency.
6. **Issue 6** (bulk import / gym delete cache invalidation) — same pattern as already-fixed issues, quick to apply.