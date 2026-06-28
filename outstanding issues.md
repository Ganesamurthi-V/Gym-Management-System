# GymFlow — Performance Audit (Navigation Latency)

**Audience:** This document is written for an AI coding agent (Antigravity) to read and act on directly. Every issue includes: the exact file, the exact problem, why it causes the symptom, and the precise fix to implement. Do not skip the "Why this causes the symptom" sections — they explain how the issues compound, which matters for getting the fix order right.

**Symptom under investigation:** Every page in the app (Dashboard, Members, Payments, Dues, Attendance, Inventory) takes 1.5–3 seconds to load on every sidebar navigation, showing a full skeleton loading state each time. This happens **even on pages with almost no data** (e.g. the Dues page with exactly 1 row took as long as the Payments page with 20 rows), which rules out query/data-volume as the cause and points at fixed per-navigation overhead.

**Root cause, in one sentence:** The auth + gym-context lookup chain runs as real, uncached network round-trips to Supabase multiple times on every single navigation, because (a) the root layout's data-fetching component re-executes on every route change, (b) Next.js 15's client router cache is configured to never cache dynamic navigations, and (c) the gym record lookup has no cache layer at all.

---

## Issue 1 — `AppShell` re-runs its full data-fetch chain on every navigation (🔴 Critical — primary cause)

**File:** `components/layout/AppShell.tsx`, wired into `app/layout.tsx`

**What's happening:**

```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SmoothScrollProvider>
          <AppShell>{children}</AppShell>   {/* <-- async Server Component, root layout */}
        </SmoothScrollProvider>
        ...
```

```tsx
// components/layout/AppShell.tsx
export default async function AppShell({ children }) {
  const { user } = await getAuthUser()                          // Supabase auth round-trip #1 (this request)
  ...
  const [gymResult, activeStatusResult] = await Promise.all([
    getGym(user.id),                                             // DB round-trip — NOT cached (see Issue 3)
    getGymActiveStatus(user.email ?? ''),                        // Redis-cached RPC, 120s TTL
  ])
  ...
  if (gym) {
    const { count } = await getUnreadAdminMessages(gym.id)        // Redis-cached, 30s TTL — but runs SEQUENTIALLY after the Promise.all, not inside it
  }
  ...
}
```

`AppShell` is mounted in the **root layout**, wrapping every route in the app. Because it's an `async` Server Component, Next.js has to re-render it as part of the React Server Component (RSC) payload for every navigation that isn't served entirely from the client router cache. The video evidence (full skeleton → content cycle on every click, ~1.5–2.5s, regardless of destination page's data size) shows this is happening on every single navigation, not just on hard reloads.

**Why this causes the symptom:**
This single component fires 3–4 sequential/semi-sequential network calls (auth check, gym lookup, active-status RPC, unread-count query) before React can even start resolving the destination page's own data. Since it sits above every route in the tree, this cost is paid on every navigation — which is exactly why the delay is constant regardless of which page you go to or how much data that page has.

**Fix:**

1. **Parallelize `getUnreadAdminMessages` into the existing `Promise.all`** instead of running it after:

```tsx
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()

  let gym = null
  let isActive = true
  let unreadCount = 0

  if (user) {
    const [gymResult, activeStatusResult] = await Promise.all([
      getGym(user.id),
      getGymActiveStatus(user.email ?? ''),
    ])
    gym = gymResult.gym
    isActive = activeStatusResult.isActive !== false

    if (gym) {
      // Run this in parallel too — don't block on gym/active-status to fire it.
      // Restructure as a single Promise.all of all three independent calls.
    }
  }
  ...
}
```

  Better: restructure so all three (`getGym`, `getGymActiveStatus`, and the unread count once you have a gym id candidate) are not artificially serialized. Since `getUnreadAdminMessages` needs `gym.id`, the cleanest fix is to fetch `gym` first, then fire `getGymActiveStatus` and `getUnreadAdminMessages` together:

```tsx
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()

  let gym = null
  let isActive = true
  let unreadCount = 0

  if (user) {
    const { gym: gymResult } = await getGym(user.id)
    gym = gymResult

    const [activeStatusResult, unreadResult] = await Promise.all([
      getGymActiveStatus(user.email ?? ''),
      gym ? getUnreadAdminMessages(gym.id) : Promise.resolve({ count: 0 }),
    ])
    isActive = activeStatusResult.isActive !== false
    unreadCount = unreadResult.count ?? 0
  }

  return (
    <ShellGuard initialUser={user} initialGym={gym} initialIsActive={isActive} initialUnreadCount={unreadCount}>
      {children}
    </ShellGuard>
  )
}
```

  This turns 1 sequential chain of ~4 calls into 1 call (`getGym`) + 2 parallel calls — cuts roughly a third off this component's own latency.

2. **The bigger structural fix — stop re-running this on every navigation at all.** This data (user, gym, active-status, unread-count) does not need to be fetched fresh on every route change. Two valid approaches, pick one:

   - **Option A (lowest-risk, recommended first step):** Move the unread-count + active-status polling entirely to the client side, fetched once on mount inside `ShellGuard` (which already has a `useEffect` running every 60s for the active-status check — extend that same interval/effect to also fetch unread count) instead of doing it server-side per navigation. Keep `getAuthUser()` + `getGym()` server-side in `AppShell` since you need `gym.id`/`gym.name` for the initial render, but drop `getGymActiveStatus` and `getUnreadAdminMessages` from `AppShell` and let `ShellGuard`'s existing polling effect own both. This removes 2 of the 4 calls from the per-navigation hot path immediately.

   - **Option B (more thorough):** Once Issue 3 (caching `getGym`) is fixed, the remaining calls in `AppShell` become cheap (Redis round-trips, ~10-30ms each, instead of Postgres queries). Combined with Option A this brings the `AppShell` contribution down to near-zero. Do both.

---

## Issue 2 — Auth is validated twice per navigation: once in middleware, once in the DAL (🔴 Critical)

**Files:** `middleware.ts`, `lib/dal.ts`

**What's happening:**

```ts
// middleware.ts — runs on every request to a protected route
const { data: { user } } = await supabase.auth.getUser()
```

```ts
// lib/dal.ts — runs again inside the Server Component tree (AppShell, every layout, every page)
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
})
```

`supabase.auth.getUser()` is not a local JWT decode — by design it makes a network call to the Supabase Auth server to revalidate the token on every call (this is intentional in Supabase's API for security: `getUser()` is the "trust no one, always verify" method, as opposed to `getSession()` which trusts the local cookie/JWT without a round-trip).

`React.cache()` on `getAuthUser` deduplicates calls **within the same render pass of a single request** — so all the `getAuthUser()` calls inside `AppShell`, the route's `layout.tsx`, and the route's `page.tsx` correctly collapse into one network call per request. But middleware runs in a **separate execution context** (the Edge/Node middleware layer, before the React render even starts), so `React.cache()` cannot deduplicate across it. That means every navigation pays for **two** real auth round-trips: one in middleware, one in the DAL.

**Why this causes the symptom:**
Two sequential network round-trips to Supabase's auth server, on every navigation, before any page-specific data fetching even begins. This is pure latency tax, unrelated to what page you're going to.

**Fix:**

Pass the already-verified user from middleware into the request so the DAL doesn't need to re-verify. The simplest robust approach: have middleware set a header with the verified user id (or just rely on the fact that middleware already confirmed the session is valid and let the DAL use the cheaper `getSession()` instead of `getUser()` for the in-render calls, since middleware already did the expensive verification for this request).

Recommended fix — keep `getUser()` in middleware (it's the right place for the security-critical check, and it already redirects unauthenticated users before any rendering happens), but change `lib/dal.ts`'s `getAuthUser` to use `getSession()` instead of `getUser()` for the in-render reads, since by the time a Server Component is rendering, middleware has already verified the session for this request:

```ts
// lib/dal.ts
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  return { user: session?.user ?? null, error }
})
```

`getSession()` reads the JWT from cookies and validates its signature/expiry locally — no network call. Since middleware has already done the authoritative server-side check for this request (and redirects to `/auth/login` if invalid), it's safe for the DAL to trust the local session for the remainder of this same request. This removes one full network round-trip from every navigation.

**Caveat to flag in the PR:** confirm this doesn't weaken any check that specifically relies on `getUser()`'s server-side revalidation (e.g. detecting a user who was deleted/banned mid-session). If that matters for this app, an alternative is to have middleware attach a custom header (e.g. `x-verified-user-id`) to the request after its own `getUser()` call, and have the DAL read that header instead of calling Supabase again at all. Either approach removes the duplicate network call; the header approach is more correct but is a slightly bigger change.

---

## Issue 3 — `getGym()` has no cache layer — hits Postgres on every navigation (🟠 High)

**File:** `lib/dal.ts`

**What's happening:**

```ts
export const getGym = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, name, onboarding_completed, owner_id, created_at, onboarding_data')
    .eq('owner_id', userId)
    .single()
  return { gym, error }
})
```

Compare this to `getGymActiveStatus` and `getUnreadAdminMessages` in the same file, which both wrap their query in `cacheWrapper(key, ttlSeconds, fn)` (Redis-backed, see `lib/cache.ts`). `getGym` only has `React.cache()`, which — as explained in Issue 2 — only dedupes within a single request. Across navigations, this is a fresh Postgres query every time.

**Why this causes the symptom:**
The gym record (name, onboarding status, onboarding_data) almost never changes between page loads. Re-fetching it from Postgres on every navigation is pure waste, and it's called from `AppShell` (root layout, every page), the layout files (`app/payments/layout.tsx`, `app/members/layout.tsx`, etc.), and most `page.tsx` files — meaning it's one of the most frequently-executed queries in the whole app, and the only one in this hot path without a cache.

**Fix:**

Wrap it in `cacheWrapper`, same pattern as the other DAL functions in this file:

```ts
export const getGym = cache(async (userId: string) => {
  return cacheWrapper(`user:${userId}:gym`, 120, async () => {
    const supabase = await createClient()
    const { data: gym, error } = await supabase
      .from('gyms')
      .select('id, name, onboarding_completed, owner_id, created_at, onboarding_data')
      .eq('owner_id', userId)
      .single()
    return { gym, error }
  })
})
```

**Cache invalidation note:** anywhere the app updates the `gyms` row (onboarding completion, gym name change, `onboarding_data` updates — e.g. the `handleSaveNewPlan` flow fixed in the previous audit round) must call `invalidatePattern(`user:${userId}:gym`)` or `deleteCache(...)` after the write, or the UI will show stale gym data for up to 120 seconds after an update. Search the codebase for all Supabase `.update()` / `.upsert()` calls targeting the `gyms` table and add the corresponding cache invalidation next to each one. Known locations to check: `app/onboarding/OnboardingWizard.tsx`, `app/members/new/page.tsx` (handleSaveNewPlan), any account/settings update path in `app/account/AccountClient.tsx`.

---

## Issue 4 — Next.js Router cache is configured to never cache dynamic navigations (🟠 High)

**File:** `next.config.js` (missing config), affects all routes

**What's happening:**

Next.js 15's App Router has a client-side Router Cache that, by default, caches the RSC payload for recently-visited routes for a short window so that re-visiting them (e.g. clicking back, or revisiting a tab) doesn't always trigger a full server round-trip. The relevant setting is `experimental.staleTimes`, and Next.js 15's **out-of-the-box default for dynamic routes is `0` seconds** — meaning every navigation to a dynamic route (which all of these gym-data pages are, since they're per-user and marked `revalidate = 0` in some cases, see Issue 5) is always treated as cache-cold.

`next.config.js` in this repo has no `experimental.staleTimes` override, so it's running on this zero-cache default for every protected route.

**Why this causes the symptom:**
Even if Issues 1–3 are fully fixed, every navigation will still re-trigger a full RSC round-trip with no client-side memoization at all, because the framework itself isn't configured to retain anything between navigations. This is what makes the delay feel constant and "fresh" on every single click, including re-visiting a page you were just on seconds ago.

**Fix:**

Add a `staleTimes` config to allow short-lived caching of dynamic route segments on the client router cache:

```js
// next.config.js
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,   // cache dynamic route RSC payloads for 30s client-side
      static: 180,
    },
    serverActions: { ... }, // keep existing config
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  ...
}
```

**Important tradeoff to flag:** a `dynamic: 30` setting means if a user updates data on one page (e.g. adds a payment) and then navigates to a different page within 30 seconds, they might briefly see a stale RSC payload from the client cache rather than the fresh server render, **unless** the mutation calls `router.refresh()` or the relevant Server Action calls `revalidatePath()`/`revalidateTag()`. Check that mutations in `app/payments/actions.ts`, `app/members/actions.ts`, and `app/inventory/actions.ts` already call `revalidatePath` for their respective routes (this should already be standard Next.js Server Action practice in this codebase — confirm it is, and add it anywhere it's missing) before relying on a longer `staleTimes` value. Start with a conservative value (`dynamic: 30`) and only increase it once revalidation-on-mutation is confirmed everywhere.

---

## Issue 5 — `export const revalidate = 0` on the Members page disables all caching for that route segment (🟡 Medium)

**File:** `app/members/page.tsx`

**What's happening:**

```ts
export const revalidate = 0
```

This explicitly opts the Members route out of Next.js's Full Route Cache and Data Cache, forcing a fully dynamic server render on every single request to this route — stacking on top of Issues 1, 2, and 4 rather than mitigating any of them. Note that `getMembersData` inside this same file is already wrapped in `cacheWrapper` (Redis, 300s TTL) — so the data fetch itself is cached — but `revalidate = 0` still forces Next.js to re-execute the whole Server Component function (including the now-cheap-but-still-present `getAuthUser`/`getGym` calls and the cache lookup itself) on every hit, rather than potentially serving a cached RSC output.

**Why this causes the symptom:**
This is a smaller contributor than Issues 1–4, but it's actively working against the fixes above. There's no comment in the code explaining why `revalidate = 0` was chosen here specifically (it's not present on the Payments or Dashboard pages), which suggests it may have been added reactively to fix a stale-data bug rather than as a deliberate performance decision.

**Fix:**

Remove `export const revalidate = 0` unless there's a specific reason it's needed (check git history / commit message for this line first — if it was added to fix a real staleness bug, that bug needs a `revalidatePath('/members')` call at the actual mutation site instead of disabling caching for the whole route). If no clear reason is found, delete the line and rely on the existing `cacheWrapper` (300s TTL) plus proper `revalidatePath` calls in `app/members/actions.ts` for correctness.

---

## Issue 6 — `getUnreadAdminMessages` and `getGymActiveStatus` run sequentially after gym resolution instead of fully in parallel (🟡 Medium — overlaps with Issue 1, listed separately for clarity)

**File:** `components/layout/AppShell.tsx`

Already covered in the Issue 1 fix above. Flagging separately here because it's a distinct, independently-verifiable change: confirm after the fix that `getGymActiveStatus` and `getUnreadAdminMessages` are in the same `Promise.all` (or otherwise running concurrently), not two sequential `await` statements. This is a quick win once `getGym` no longer blocks ahead of it.

---

## Fix Priority Order

Apply in this order — later fixes depend on earlier ones being in place to be safe/effective:

1. **Issue 3** — add `cacheWrapper` to `getGym()`. Lowest risk, immediate win, and de-risks Issue 4 (since `staleTimes` becomes less load-bearing once the underlying data fetch is already fast).
2. **Issue 1** — parallelize `AppShell`'s calls, and move active-status/unread-count polling client-side (Option A). Biggest single win since this runs on every navigation.
3. **Issue 2** — switch `getAuthUser()` in the DAL to `getSession()`. Removes one full network round-trip per navigation. Do this after confirming with the team whether `getUser()`'s server-revalidation behavior is relied upon anywhere security-sensitive.
4. **Issue 5** — remove `revalidate = 0` from the Members page, after checking it's not masking a real bug.
5. **Issue 4** — add `staleTimes` config, only after confirming `revalidatePath`/`revalidateTag` calls exist on all the relevant mutations (payments, members, inventory, dues actions). Doing this last and only after the above is safest, since a misconfigured client cache combined with missing revalidation calls would show stale data to users, which is a worse problem than slow loads.

## Suggested Verification After Fixes

- Re-record the same navigation sequence from the original video (Members → Payments → Dues → Attendance → Inventory → Dashboard) and confirm the skeleton duration drops to well under 500ms per navigation.
- Check `lib/logger.ts`'s `RequestLogger.summary()` output (already instrumented in `app/dashboard/page.tsx` and `app/members/page.tsx`) in server logs after each fix — the `authMs` and `redisGetMs`/`dataMs` fields will show directly whether each fix is landing as expected. Add the same `RequestLogger` instrumentation to `app/payments/page.tsx`, `app/dues/page.tsx`, `app/inventory/page.tsx`, and `app/attendance/page.tsx` if not already present, so all six pages are equally observable.