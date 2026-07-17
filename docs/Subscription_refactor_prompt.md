# GymFlow — Subscription System Refactor & Mobile UI Redesign

## Context: What You Are Working With

This is a **Next.js 15 + Supabase** multi-tenant SaaS (`gymflow.sbs`) with a companion **React Native admin mobile app** (`gymflow-mobile`) and a separate **Next.js admin panel** (`gymflow-admin`). The monorepo has three surfaces that all touch subscription state:

| Surface | Location | Role |
|---|---|---|
| Main web app | `/` (root) | Gym owner dashboard + paywall |
| Admin web panel | `/gymflow-admin` | Internal admin operations |
| Admin mobile app | `/gymflow-mobile` | Admin manages subscriptions on-the-go |

Before touching any code, read these files to understand the current architecture:

```
lib/dal.ts                          → getGym(), getSubscriptionState(), Redis cache (120s TTL)
lib/cache.ts                        → invalidateSubscriptionCaches(), cacheWrapper()
lib/cache-keys.ts                   → cache key constants
lib/subscriptionGuard.ts            → requireActiveSubscription() used in API routes
middleware.ts                       → subscription expiry redirect guard
components/layout/AppShell.tsx      → Server component, passes subState to ShellGuard
components/layout/ShellGuard.tsx    → Client guard, 60s polling via check_gym_active RPC
app/subscription/SubscriptionClient.tsx  → Gym owner paywall + payment upload UI
app/api/subscription/status/route.ts     → Mobile app polls this
app/api/subscription/request/route.ts   → Gym owner submits payment proof
app/api/admin/subscription-requests/[id]/route.ts → Web admin approve/reject
app/api/cron/subscription/route.ts  → Daily cron: expires trials + lapsed subs
gymflow-admin/lib/cache.ts          → invalidateSubscriptionCachesForOwner()
gymflow-admin/app/api/admin/gyms/[id]/subscription/activate/route.ts
gymflow-mobile/lib/api/subscription.api.ts
gymflow-mobile/src/screens/GymSubscriptionScreen.tsx
supabase/migrations/add_subscription.sql
supabase/migrations/20260717000000_admin_subscription_management.sql
```

---

## Problem Statement

After admin activates or renews a subscription, the gym owner:
- Still sees the paywall on the web app
- Still gets redirected to `/subscription`
- Mobile app still shows the expired state

Root causes identified from codebase audit:

1. **Dual cache invalidation gap**: The main app caches the gym row at `user:{userId}:gym` (120s TTL) AND the active status verdict at `active_status:{email}` (120s TTL). Both must be busted together. `gymflow-admin`'s routes already call `invalidateSubscriptionCachesForOwner()` correctly, but the legacy `app/api/admin/subscription-requests/[id]/route.ts` (web admin approve flow) only invalidates after fetching owner data — verify it busts **both** keys.

2. **`getSubscriptionState()` is client-side but computed from server-cached data**: `ShellGuard` receives `initialSubscriptionStatus` from the server render only once. After admin approves a payment, the client does not know to re-check until the 60s poll fires or the user hard-refreshes.

3. **Paywall redirect loop**: `middleware.ts` checks `subscription_status` live from Supabase but `ShellGuard` checks the stale `initialSubscriptionStatus` prop. These can diverge within the 120s cache window — middleware lets the user through (sees fresh DB = active), but ShellGuard redirects them back to `/subscription` (sees stale prop = expired).

4. **`subscription_status` CHECK constraint** in `add_subscription.sql` only allows `('trial', 'active', 'expired')`. The codebase uses `cancelled` and `suspended` in places. The constraint and TypeScript types are mismatched.

5. **Mobile app**: `GymSubscriptionScreen` uses `fetchSubscriptionDetail` which hits `/api/admin/gyms/[id]/subscription/detail`. After any action (activate, approve, extend trial), the screen calls `loadData(true)` — this is correct. Verify the detail endpoint reads fresh data (no caching layer in `gymflow-admin/app/api/...`).

---

## Task 1 — Audit & Fix Subscription State Consistency

### 1a. Enumerate Every Status Computation

Search the entire monorepo for every place subscription status is computed or checked:

```bash
grep -rn "subscription_status\|isExpired\|subState\|getSubscriptionState\|requireActiveSubscription\|check_gym_active" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next
```

Map each hit to one of these categories:
- **A** — reads from DB directly (middleware, API routes, cron)
- **B** — reads from Redis-cached DAL (`getGym` / `getSubscriptionState`)
- **C** — reads from client-side prop/state (ShellGuard, mobile AsyncStorage)
- **D** — duplicated logic (inline `subscription_status === 'expired'` checks that bypass the shared helper)

Eliminate all **D** hits. Every check must use one of: `getSubscriptionState(gym)`, `requireActiveSubscription(supabase, gymId)`, or the `check_gym_active` RPC.

### 1b. Fix the Cache Invalidation Contract

Every write to any of these columns on `gyms`:
```
subscription_status | trial_ends_at | subscription_ends_at | is_active
```

**Must immediately call `invalidateSubscriptionCaches(ownerId, email)`** (main app) or `invalidateSubscriptionCachesForOwner(supabase, ownerId)` (gymflow-admin). 

Audit every API route that writes to these columns and confirm the invalidation call exists and fires **after** the DB write succeeds, not before.

Files to audit:
```
app/api/admin/subscription-requests/[id]/route.ts  ← approve sets subscription_status='active'
app/api/gyms/[id]/subscription/route.ts            ← PATCH sets subscription fields
app/api/cron/subscription/route.ts                 ← already invalidates; verify
gymflow-admin/app/api/admin/gyms/[id]/subscription/activate/route.ts  ← calls invalidateSubscriptionCachesForOwner
gymflow-admin/app/api/admin/gyms/[id]/subscription/payment/approve/route.ts
gymflow-admin/app/api/admin/gyms/[id]/subscription/expire/route.ts
gymflow-admin/app/api/admin/gyms/[id]/subscription/trial/route.ts
gymflow-admin/app/api/admin/gyms/[id]/subscription/dates/route.ts
```

### 1c. Fix the ShellGuard Stale State Problem

`ShellGuard` currently only re-checks subscription status via `check_gym_active` RPC on focus and every 60 seconds. This means a gym owner who is waiting for admin approval has to wait up to 60 seconds after activation before the paywall drops — or they see the redirect loop described above.

**Fix**: When `ShellGuard` detects `initialSubscriptionStatus === 'expired'` and the user is on `/subscription`, subscribe to Supabase Realtime on the `gyms` table for the current gym row. When `subscription_status` changes to `'active'`, immediately redirect to `/dashboard`.

```typescript
// In ShellGuard useEffect — add this when user is on /subscription with expired status
const supabase = createClient()
const channel = supabase
  .channel(`gym-${initialGym?.id}-subscription`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'gyms',
      filter: `id=eq.${initialGym?.id}`,
    },
    (payload) => {
      if (payload.new.subscription_status === 'active') {
        window.location.href = '/dashboard'
      }
    }
  )
  .subscribe()

return () => { supabase.removeChannel(channel) }
```

Enable Realtime on the `gyms` table in Supabase if not already enabled (check dashboard → Database → Replication).

### 1d. Fix the TypeScript `SubscriptionStatus` Type

The DB constraint in `add_subscription.sql` allows only `('trial', 'active', 'expired')`. The `subscription.api.ts` in mobile defines `SubscriptionStatus = 'trial' | 'active' | 'expired'`.

Do one of:
- **Option A (recommended)**: Add `'cancelled' | 'suspended'` to the DB CHECK constraint in a new migration, add them to `getSubscriptionState()` in `lib/dal.ts`, and update the TypeScript union everywhere.
- **Option B**: Remove all references to `'cancelled'` and `'suspended'` in business logic if they are unused.

Pick whichever matches the actual product intent — check if `cancelled` or `suspended` appears in any API response or UI label. If yes, do Option A.

---

## Task 2 — Centralize `getSubscriptionState` as the Single Truth

`getSubscriptionState()` in `lib/dal.ts` is already the correct central function. It handles:
- `active` + `subscription_ends_at` lapse check (before cron flips it)
- `trial` + `trial_ends_at` expiry
- Legacy gyms with no status column (treated as `active`)

**Ensure this function is the only place the expiry logic lives.** The same logic is currently duplicated inline in:
- `middleware.ts` (the `isExpired` block) — replace with a call to `getSubscriptionState`
- `lib/subscriptionGuard.ts` — replace with a call to `getSubscriptionState`
- `ShellGuard.tsx` (the `checkAuth` inline block) — replace with a call to `getSubscriptionState`

After deduplication, `getSubscriptionState` is the single authoritative function. Any future status logic change only needs to happen in one place.

Refactored `middleware.ts` pattern:
```typescript
// Instead of inline isExpired block:
const subState = getSubscriptionState(gym)
if (subState.isExpired) {
  // redirect to /subscription
}
```

Note: `middleware.ts` cannot import from `lib/dal.ts` directly due to the Edge runtime. Extract just the pure computation part of `getSubscriptionState` (which takes a gym object and returns state — no DB calls) into `lib/subscription-utils.ts` with `export const runtime = 'edge'` compatibility, and import that in both middleware and dal.

---

## Task 3 — Paywall Logic Correctness

The paywall at `/subscription` and the middleware redirect must agree on when to block access.

Current bug: `middleware.ts` and `ShellGuard` both independently decide whether the subscription is expired. They can reach different conclusions during the 120s cache window.

**Rule**: Middleware is the authoritative gate. ShellGuard is a UX layer only (shows the trial banner, handles the Realtime subscription activation). ShellGuard must **never redirect to `/subscription`** — only middleware should redirect.

Remove the redirect logic from `ShellGuard`'s `checkAuth`:
```typescript
// REMOVE this from ShellGuard:
} else if (isExpired) {
  window.location.href = '/subscription'
}
```

The `check_gym_active` poll in ShellGuard exists to detect **account banning** (is_active = false). For subscription expiry, the middleware already handles it on the next navigation. These are two different concerns — keep them separate.

---

## Task 4 — Mobile App: `GymSubscriptionScreen` Redesign

**Do not modify the API layer for the mobile screen.** `fetchSubscriptionDetail`, the action functions (`activateSubscription`, `extendTrial`, `approvePayment`, etc.), and the `loadData` refresh pattern are all correct. Only the UI needs to change.

The current screen is a single `ScrollView` with 14 sections rendered sequentially. Redesign it as a **tab-based layout** with 4 tabs to eliminate scrolling and improve information hierarchy.

### Tab Structure

```
[ Overview ] [ Billing ] [ History ] [ Settings ]
```

Use `react-native` `Pressable`-based tab bar (no external tab library). Animate tab content with `Animated.View` fade transitions.

---

### Tab 1: Overview

**Hero Summary Card** — top of screen, no scroll needed to see key info:

```
┌─────────────────────────────────────────────┐
│  [Avatar Initial]   Gym Name                │
│                     📍 City                  │
│                                             │
│  ● ACTIVE          MONTHLY PLAN             │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Started  │  │ Expires  │  │ Days Left│  │
│  │ 1 Jun    │  │ 1 Jul    │  │  14 days │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
```

- Status dot color: emerald for active, amber for trial, red for expired
- Days remaining badge color: green > 14 days, amber 1–14, red 0

**Quick Actions** — 2×3 grid of tappable action chips below the summary card:

```
[ ✓ Activate Monthly ] [ 📅 Activate Yearly ] [ ★ Activate Lifetime ]
[ ⏱ Extend Trial +7 ] [ 🔄 Reset Trial     ] [ ✕ Expire Now       ]
```

Each chip triggers the existing `confirmAction` → `doAction` flow. No scroll needed.

**Pending Payment Alert** — only rendered when `pendingRequest` exists. Sits between Quick Actions and Usage Stats:

```
┌─────────────────────────────────────────── ⚠ ─┐
│  Payment Proof Pending Verification            │
│  Submitted: 15 Jul · Txn: 4036XXXX           │
│  [ 🖼 View Screenshot ]                       │
│  [ ✓ Approve — Monthly ] [ ✕ Reject ]        │
└────────────────────────────────────────────────┘
```

**Usage Stats** — 4-column stat grid:

```
┌────────┬────────┬────────┬────────┐
│ 142    │ ₹2.4L  │  1,832 │  320   │
│Members │Revenue │Attend. │WA msgs │
└────────┴────────┴────────┴────────┘
```

---

### Tab 2: Billing

**Payment Information** card with `InfoRow` layout:
- Last Amount, Method, Transaction ID, Payment Date, Status

**Subscription Dates** — the 4 `DateCard` components for manual date editing, unchanged from current implementation. Sticky "Save Changes" bar appears when dates are dirtied.

**Trial Information** (conditional, only if `subscription_status === 'trial'`):
- Trial start/end dates
- Extend trial buttons: `+3d`, `+7d`, `+14d`, `Custom`

---

### Tab 3: History

**Subscription Timeline** — vertical timeline showing all `timeline` audit log entries (already fetched from `fetchSubscriptionDetail`). Reuse the existing `TimelineItem` component. Lazy-render: show first 10, "Show more" button reveals the rest.

**Renewal History** — compact card list showing only activations (the `renewalHistory` filtered array from current code).

---

### Tab 4: Settings

**Admin Notes** — `TextInput` with Done Editing button. Dirty state triggers the sticky save bar.

**Internal Flags** — all 6 `Switch` toggles unchanged.

**Security Information** — owner email, last login, email verified status.

**Danger Zone** — all 6 danger actions unchanged.

---

### Implementation Notes for the Tab UI

```typescript
// Tab state
const [activeTab, setActiveTab] = useState<'overview' | 'billing' | 'history' | 'settings'>('overview')

// Tab bar — sticky at top below screen header
const TABS = [
  { key: 'overview', label: 'Overview', icon: 'activity' },
  { key: 'billing',  label: 'Billing',  icon: 'credit-card' },
  { key: 'history',  label: 'History',  icon: 'list' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
] as const
```

The FABSpeedDial and StickyBottomBar remain — they are functional and needed. Remove the `ScrollView` wrapper at the screen root and replace with a `View` with the tab bar at top and a `ScrollView` per tab (so each tab has its own independent scroll position).

Keep all existing sub-components: `SectionHeader`, `InfoRow`, `Divider`, `StatusChip`, `ConfirmDialog`, `DateCard`, `TimelineItem`, `QuickActionBtn`. Only the layout shell changes.

---

## Task 5 — Database: Fix Status Constraint Mismatch

Create migration `supabase/migrations/20260718_subscription_status_expand.sql`:

```sql
-- Expand subscription_status to include cancelled and suspended
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_subscription_status_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled', 'suspended'));

-- Also expand plan_type if needed
ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_plan_type_check;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_plan_type_check
  CHECK (plan_type IN ('trial', 'monthly', 'quarterly', 'yearly', 'lifetime'));
```

Update `getSubscriptionState()` in `lib/dal.ts` to handle `cancelled` and `suspended` as expired states:

```typescript
if (status === 'cancelled' || status === 'suspended') {
  return { status: status as const, daysLeft: 0, isExpired: true }
}
```

Update `SubscriptionStatus` type in `gymflow-mobile/lib/api/subscription.api.ts`:
```typescript
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled' | 'suspended'
```

---

## Task 6 — Cron Job: Add Expired Paid Subscription Handling

The cron at `app/api/cron/subscription/route.ts` already handles both trial and active lapse. Verify:

1. Lifetime plans (`subscription_ends_at IS NULL`) are never expired by the cron — the `.lt('subscription_ends_at', ...)` filter correctly excludes NULLs.
2. After expiry, the cron calls `invalidateSubscriptionCaches` for each affected gym. Verify it fetches the owner's email for the `active_status:` key invalidation — it does via `supabase.auth.admin.getUserById`. Confirm this still works if `getUserById` returns null (gym deleted but DB row lingering).

No logic changes needed if the above verifies correctly. Document the verification result in a comment.

---

## Task 7 — Verify the gymflow-admin Cache Contract

`gymflow-admin` runs as a separate Next.js app but shares the **same Upstash Redis instance** as the main app. Cache keys must match exactly:

Main app (`lib/cache-keys.ts`):
```typescript
gym: (userId: string) => `user:${userId}:gym`
activeStatus: (email: string) => `active_status:${email}`
```

`gymflow-admin/lib/cache.ts`:
```typescript
`user:${userId}:gym`          // must match exactly
`active_status:${email}`      // must match exactly
```

Run a grep to confirm the string literals are identical. If `cache-keys.ts` is the source of truth in the main app, import from a shared package or hardcode-verify both sides match. Do not refactor to a shared package in this task — just verify and document.

---

## Deliverables Checklist

Before marking this task complete, verify each item:

**Subscription Logic**
- [ ] `getSubscriptionState()` is the single expiry computation function — no inline duplicates remain
- [ ] Middleware imports the pure computation from `lib/subscription-utils.ts` (Edge-compatible)
- [ ] Every DB write to subscription fields is followed by cache invalidation of both keys
- [ ] `ShellGuard` no longer redirects to `/subscription` — only subscribes to Realtime when on that page
- [ ] Realtime channel on `gyms` table activates instant paywall removal on `status → active`
- [ ] `SubscriptionStatus` TypeScript type includes `cancelled` and `suspended`
- [ ] DB CHECK constraint updated in migration

**Mobile UI**
- [ ] `GymSubscriptionScreen` uses 4-tab layout (Overview, Billing, History, Settings)
- [ ] Overview tab shows hero card + quick actions + pending alert + usage stats without scrolling
- [ ] All existing action functions (`activateSubscription`, `extendTrial`, `approvePayment`, etc.) are unchanged
- [ ] `ConfirmDialog`, `FABSpeedDial`, `StickyBottomBar` are retained and functional
- [ ] Each tab has its own independent `ScrollView`

**No Regressions**
- [ ] `requireActiveSubscription()` in `lib/subscriptionGuard.ts` still works identically for API route guards
- [ ] Cron endpoint still invalidates caches after expiry
- [ ] `app/api/subscription/status/route.ts` (mobile polling endpoint) returns correct state
- [ ] Admin web panel `AdminSubscriptionList` approve/reject still calls `invalidateSubscriptionCaches`

---

## Do Not Touch

- WhatsApp automation, outbox, queue (`lib/whatsapp/`, `app/api/whatsapp/`)
- Member management, payments, attendance, dues
- Geo normalization (`lib/geo/`)
- Import pipeline (`lib/import/`)
- Landing page (`/landing-page`)
- Auth flow beyond what's described above
- The `gymflow-admin` UI (only its API routes matter for this task)

---

## Test Scenarios to Manually Verify After Implementation

1. **Trial → Active (web)**: Admin approves payment in `gymflow-admin`. Open gym owner's browser — within 5 seconds (Realtime), paywall drops and dashboard loads. No manual refresh.
2. **Trial → Active (mobile)**: Admin activates in mobile app → `loadData(true)` fires → screen shows active state.
3. **Active → Expired (cron simulation)**: Manually call `POST /api/cron/subscription` → gym status flips → next navigation redirects to `/subscription`.
4. **Active subscription visit `/subscription`**: Should show "Your subscription is active" card, not the paywall form.
5. **Stale cache during active sub**: Even if Redis cache has `expired`, Realtime subscription ensures immediate state update.
6. **`cancelled` status**: Gym with `subscription_status = 'cancelled'` redirected to paywall correctly.