# AI Handoff — GymFlow Subscription / Trial System
**Date:** 2026-07-16
**Session scope:** Fixed expired-trial routing, hardened subscription cache handling, diagnosed mobile admin 404.
**Project root:** `C:\Gym Management system\gymflow` (note: the CLI session ran from `/tmp`; the actual project is here)

---

## 1. Project Architecture (what any agent needs to know first)

This repo contains **three apps** plus a landing page:

| App | Path | Deployed at | Purpose |
|---|---|---|---|
| Main app | `gymflow/app/...` | (main domain) | Next.js 15 app for gym owners |
| Admin panel | `gymflow/gymflow-admin/` | `https://admin.gymflow.sbs` | **Separate** Next.js project (port 3001), platform super-admin |
| Mobile admin | `gymflow/gymflow-mobile/` | React Native app | Admin app for phone, talks to `admin.gymflow.sbs` |
| Landing page | `gymflow/landing-page/` | — | Vite/React marketing site |

- Database: Supabase (Postgres + Auth + Storage). Multi-tenant via RLS keyed on `gyms.owner_id = auth.uid()`.
- Cache: Upstash Redis, **shared by main app and admin panel** (both read the same `UPSTASH_REDIS_REST_URL`).
- Cron: Vercel Cron (`vercel.json`) — `/api/cron/subscription` daily at `0 0 * * *`, `/api/cron/whatsapp` at `30 3 * * *`.
- A code graph exists at `graphify-out/GRAPH_REPORT.md` (built from commit `cd46c9e0`, regenerate with `graphify update .`). The `graphify` CLI skill is not installed in Claude sessions; read the report file directly.

### Auth secrets (three different ones — do not confuse)
| Env var | Where | Used for |
|---|---|---|
| `ADMIN_PASSWORD` | main app | Bearer token check on main app's `/api/admin/*` and `/api/gyms/*` routes |
| `ADMIN_PANEL_SECRET` | gymflow-admin | Password login + JWT session cookie + Bearer for API-to-API (`gymflow-admin/lib/auth.ts` → `verifyRequestAuth()`) |
| `CRON_SECRET` | main app | `x-cron-secret` header or Bearer on cron routes |

---

## 2. Subscription Model (business rules)

- New account → onboarding completes → gym row created with a **14-day trial**
  (`app/api/onboarding/complete/route.ts:110`, duration overridable via `TRIAL_DURATION_DAYS` env).
- `gyms` columns: `subscription_status` (`trial | active | expired`), `plan_type` (`trial | monthly | yearly | lifetime`), `trial_started_at`, `trial_ends_at`, `subscription_started_at`, `subscription_ends_at`.
- **Lifetime plans store `subscription_ends_at = NULL` → never lapse.**
- Trial expiry → user must land on `/subscription` (shows "Your Trial Has Expired" + UPI payment flow), **stays logged in**.
- Admin deactivation (`gyms.is_active = false`) → user is signed out to `/auth/login?error=blocked` ("Your access is blocked by admin").
- **These two states must never be conflated** — that was the original bug (see §3).
- Payment flow: owner uploads UPI payment proof → `subscription_requests` row (`pending`) → admin approves → gym becomes `active` with computed `subscription_ends_at`.
- Payment proofs live in private Storage bucket `payment-proofs`, path-scoped per user; UPI details + prices in `platform_settings` (single row, id=1).
- Legacy gyms created before the migration were backfilled to `active`/`monthly` so they're never locked out.

### Enforcement points (all must agree — there are FIVE)
1. `middleware.ts` — server-side redirect of expired users to `/subscription` on protected prefixes.
2. `lib/subscriptionGuard.ts` → `requireActiveSubscription()` — 403 `SUBSCRIPTION_REQUIRED` for API routes.
3. `lib/dal.ts` → `getSubscriptionState(gym)` — computes state for AppShell/banner/subscription page.
4. `components/layout/ShellGuard.tsx` — client-side: initial-load check + 60s polling of `check_gym_active` RPC + focus listener.
5. Postgres RPC `check_gym_active(p_email)` — returns `false` for deactivated, expired-trial, AND lapsed-paid accounts.

The RPC returns a bare boolean, so callers that get `false` must re-query `gyms` (`subscription_status`, `trial_ends_at`, `subscription_ends_at`, `is_active`) to distinguish expired (→ `/subscription`) from deactivated (→ signOut + `/auth/login?error=blocked`).

---

## 3. Work Done This Session (chronological)

### 3.1 Fixed: expired trials showed "access blocked by admin" instead of subscription page
**Root cause:** `check_gym_active` returns `false` for both expired and admin-deactivated gyms. `ShellGuard.tsx`'s initial-page-load branch treated every `false` as "blocked" → signOut → login page with the blocked error. (The 60s polling branch already distinguished them; only the initial-load branch was wrong.)

Changes:
- `components/layout/ShellGuard.tsx` — initial-load branch now checks `initialSubscriptionStatus === 'expired'` → redirect to `/subscription` without signing out; only genuinely deactivated accounts get signOut + blocked message. Added `initialSubscriptionStatus` to the effect dependency array.
- `middleware.ts` — added `/inventory` and `/account` to `PROTECTED_PREFIXES` (they were unguarded, expired users could still browse them). Changed the subscription-page exemption from exact `!== '/subscription'` to `!pathname.startsWith('/subscription')` to prevent redirect loops on future sub-routes.

### 3.2 SQL migration (user ran / must run in Supabase SQL editor)
`supabase/migrations/add_subscription.sql` was rewritten to a **safe-to-re-run** version (DROP POLICY IF EXISTS before each CREATE POLICY). Contents: gyms subscription columns + backfill + indexes + `subscription_requests` + `platform_settings` + `payment-proofs` bucket/policies + updated `check_gym_active`. The user pasted this into Supabase — file on disk reflects it, indented by 2 spaces (user's edit).

### 3.3 Complete cache handling for expired trial and subscription
**Root problem:** subscription state is cached in Redis under **two** keys with 120s TTL:
- `user:{userId}:gym` — gym row (`lib/dal.ts` `getGym`) — used by middleware guard, AppShell, banner
- `active_status:{email}` — RPC verdict (`lib/dal.ts` `getGymActiveStatus`) — used by AppShell → ShellGuard

Every write path was busting only the first key, so admin approvals/blocks/expiry could serve stale state for up to 2 minutes.

Changes:
- `lib/cache-keys.ts` — added `cacheKeys.gym(userId)` and `cacheKeys.activeStatus(email)` (keys centralized, no more hand-typed strings).
- `lib/cache.ts` — new `invalidateSubscriptionCaches(userId, email?)` deletes both keys in parallel. **Rule: any write to `subscription_status`, `trial_ends_at`, `subscription_ends_at`, or `is_active` MUST call this.**
- Wired into:
  - `app/api/admin/subscription-requests/[id]/route.ts` (approve/reject — looks up owner email via `auth.admin.getUserById`)
  - `app/api/cron/subscription/route.ts` (per affected gym)
  - `app/api/gyms/[id]/status/route.ts` (admin block/unblock — previously busted NOTHING)
  - `app/api/onboarding/complete/route.ts` (gym creation — prevents a cached null/stale gym row lingering)

**Second gap fixed: paid subscriptions never expired.** The cron only flipped trials. A monthly/yearly subscriber whose `subscription_ends_at` passed kept access forever. Added the lapsed-paid check (`status='active' AND subscription_ends_at IS NOT NULL AND subscription_ends_at < now()`) consistently to:
- `app/api/cron/subscription/route.ts` — second UPDATE flips lapsed `active` gyms to `expired`; response now `{expired, trials, subscriptions}`
- `middleware.ts` (also now selects `subscription_ends_at`)
- `lib/subscriptionGuard.ts`
- `lib/dal.ts` `getSubscriptionState()`
- `components/layout/ShellGuard.tsx` polling branch
- `supabase/migrations/add_subscription.sql` §7 RPC — **user must re-run this updated RPC in Supabase SQL editor:**

```sql
CREATE OR REPLACE FUNCTION check_gym_active(p_email text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN g.is_active = false                   THEN false
      WHEN g.subscription_status = 'expired'     THEN false
      WHEN g.subscription_status = 'trial'
           AND g.trial_ends_at < now()           THEN false
      WHEN g.subscription_status = 'active'
           AND g.subscription_ends_at IS NOT NULL
           AND g.subscription_ends_at < now()    THEN false
      ELSE true
    END
  FROM auth.users u
  JOIN gyms g ON g.owner_id = u.id
  WHERE u.email = p_email
  LIMIT 1;
$$;
```

`npx tsc --noEmit` passed after all changes.

### 3.4 Diagnosed (NOT yet fixed): mobile admin 404 on subscription detail
Mobile log: `GET /api/admin/gyms/{id}/subscription/detail → 404` (while `/api/gyms` and `/api/gyms/{id}` return 200).

**Root cause — routes built in the wrong app.** Nine admin subscription-management routes exist in the **main app**:
```
app/api/admin/gyms/[id]/subscription/
  detail/ activate/ trial/ expire/ notes/ dates/ danger/
  payment/approve/ payment/reject/
```
But the mobile app's axios baseURL is `https://admin.gymflow.sbs` (`gymflow-mobile/lib/api/client.ts:8`, env override `ADMIN_API_BASE`), i.e. the **gymflow-admin** deployment — which has NO `/api/admin/*` routes at all (only `auth`, `check-db`, `dashboard`, `gyms`, `logs`, `support`). Hence 404.

Two further mismatches lurk behind the 404:
1. **Auth:** the main-app routes check `Bearer <ADMIN_PASSWORD>`, but mobile logs in via gymflow-admin `/api/auth` (validates `ADMIN_PANEL_SECRET`) and then stores **the password itself** as its bearer token (`gymflow-mobile/lib/api/auth.api.ts`). gymflow-admin routes accept this via `verifyRequestAuth()` (`gymflow-admin/lib/auth.ts` — cookie JWT or `Bearer ADMIN_PANEL_SECRET`). Unless `ADMIN_PASSWORD === ADMIN_PANEL_SECRET`, the ported routes must use `verifyRequestAuth()`.
2. **DB:** the detail route selects `admin_notes`, `is_vip`, `login_disabled`, `last_payment_*` etc. and queries `subscription_audit_logs` + `gym_usage_stats` — all created by `supabase/migrations/20260717000000_admin_subscription_management.sql`. If that migration hasn't run, the route 500s even when reachable.

**Recommended fix (user has NOT yet approved — ask before doing):**
- Port the 9 route files to `gymflow-admin/app/api/admin/gyms/[id]/subscription/…` (exact paths the mobile client calls).
- Swap auth to `verifyRequestAuth()`.
- After any status change, bust `user:{ownerId}:gym` + `active_status:{email}` in the shared Redis (gymflow-admin can — same Upstash instance; mirror `invalidateSubscriptionCaches`, or reimplement in `gymflow-admin/lib/cache.ts`).
- Run `20260717000000_admin_subscription_management.sql` in Supabase.
- Redeploy gymflow-admin. Optionally delete the dead copies from the main app.

---

## 4. Current State / Outstanding Work

### Done & type-checked (uncommitted)
- ShellGuard expired-vs-blocked routing fix
- Middleware protected-prefix + loop fixes
- Two-key cache invalidation everywhere + `invalidateSubscriptionCaches` helper
- Lapsed-paid-subscription expiry in all five enforcement points + cron
- `add_subscription.sql` rewritten (re-runnable, includes lapsed-paid RPC)

### User must do
1. Run the updated `check_gym_active` RPC (§3.3 SQL) in Supabase — **required**, otherwise lapsed paid subs aren't caught by the RPC path.
2. Run `20260717000000_admin_subscription_management.sql` in Supabase (prerequisite for the mobile admin subscription screens).
3. Commit the working tree — it also contains **pre-session uncommitted edits** (login page RPC→direct query change with fixed error copy, and a `SubscriptionClient` redesign with step wizard) that should be tested and committed together.
4. **Redeploy gymflow-admin** — the ported subscription routes only exist on `admin.gymflow.sbs` after a deploy.

### Done (follow-up session, 2026-07-16): §3.4 port completed
- The 9 subscription routes now live in `gymflow-admin/app/api/admin/gyms/[id]/subscription/…` (exact paths the mobile client calls). Dead copies deleted from the main app (`app/api/admin/gyms/` removed; `app/api/admin/subscription-requests/` untouched).
- Auth swapped from `Bearer ADMIN_PASSWORD` to `verifyRequestAuth()` (cookie JWT or `Bearer ADMIN_PANEL_SECRET`).
- Cache invalidation: `gymflow-admin/lib/cache.ts` gained `invalidateSubscriptionCaches(userId, email?)` + `invalidateSubscriptionCachesForOwner(supabase, ownerId)` (resolves email via `auth.admin.getUserById`). Called after every gym write that touches `subscription_status` / `trial_ends_at` / `subscription_ends_at` / `is_active`: activate, trial, expire, dates, danger (incl. delete_gym), payment/approve. Not needed for notes (flags only) or payment/reject (request row only).
- `gymflow-admin/middleware.ts` hardened: now also accepts `Bearer ADMIN_PANEL_SECRET` (mirrors `verifyRequestAuth`), and unauthenticated `/api/*` requests get JSON 401 instead of an HTML redirect to `/auth`. Previously mobile only worked because React Native happened to persist the session cookie; after the 8h cookie expiry, API calls would have been 307-redirected.
- `npx tsc --noEmit` passes in both projects; `next build` in gymflow-admin succeeds and the manifest lists all 9 `/api/admin/gyms/[id]/subscription/*` routes.

### Testing recipes
```sql
-- Force-expire a trial gym for testing:
UPDATE gyms SET trial_ends_at = now() - interval '1 day'
WHERE name = 'YOUR TEST GYM NAME' AND subscription_status = 'trial';

-- Inspect states:
SELECT name, subscription_status, plan_type, trial_ends_at, subscription_ends_at, is_active FROM gyms;
```
Expected: expired-trial login → lands on `/subscription` with "Your Trial Has Expired" (NOT the blocked message); blocked gym (`is_active=false`) → signOut + "Your access is blocked by admin"; admin approval → access restored on next request (no 120s wait).

```bash
# Manual cron trigger:
curl -X POST https://<main-domain>/api/cron/subscription -H "x-cron-secret: $CRON_SECRET"

# Type check (from gymflow/):
npx tsc --noEmit
```

---

## 5. Key Files Index

| File | Role |
|---|---|
| `middleware.ts` | Auth + subscription redirect guard (protected prefixes list at top) |
| `lib/dal.ts` | `getAuthUser`, `getGym` (cached), `getGymActiveStatus` (cached), `getSubscriptionState` |
| `lib/cache.ts` | Redis wrappers + `invalidateSubscriptionCaches` |
| `lib/cache-keys.ts` | All Redis key builders |
| `lib/subscriptionGuard.ts` | `requireActiveSubscription` for API routes |
| `components/layout/AppShell.tsx` | Server component: fetches user/gym/active-status → ShellGuard |
| `components/layout/ShellGuard.tsx` | Client guard: initial check + 60s poll + focus listener |
| `components/layout/TrialBanner.tsx` | Days-left banner (shown for trial/expired) |
| `app/subscription/page.tsx` + `SubscriptionClient.tsx` | Trial-expired / payment page |
| `app/api/subscription/request/route.ts` | Owner uploads payment proof |
| `app/api/subscription/status/route.ts` | Mobile-facing status endpoint |
| `app/api/admin/subscription-requests/[id]/route.ts` | Admin approve/reject (main app) |
| `app/api/cron/subscription/route.ts` | Daily expiry cron (trials + lapsed paid) |
| `app/api/gyms/[id]/status/route.ts` | Admin block/unblock (`is_active`) |
| `app/api/onboarding/complete/route.ts` | Gym creation + trial start |
| `app/api/admin/gyms/[id]/subscription/*` | 9 admin routes **in wrong app** — to be ported to gymflow-admin |
| `supabase/migrations/add_subscription.sql` | Core subscription migration (re-runnable) |
| `supabase/migrations/20260717000000_admin_subscription_management.sql` | Audit logs, usage stats, flags columns |
| `gymflow-admin/lib/auth.ts` | `verifyRequestAuth` (cookie JWT or Bearer ADMIN_PANEL_SECRET) |
| `gymflow-mobile/lib/api/client.ts` | Axios base (`admin.gymflow.sbs`), token interceptor |
| `gymflow-mobile/lib/api/subscription.api.ts` | All mobile subscription API calls + types |
| `docs/GymFlow_Subscription_Implementation.md` | Original feature design doc |

## 6. Gotchas for the Next Agent
- Working directory trap: sessions may start in `/tmp` — the repo is at `C:\Gym Management system\gymflow` (path contains spaces; quote it).
- Not a git-bash-visible repo root at `/tmp`; run git commands inside the project dir.
- `getGym` caches for 120s — after ANY `gyms` write, invalidate via `invalidateSubscriptionCaches` (or at minimum `deleteCache('user:{id}:gym')`), or middleware will act on stale rows.
- `active_status` cache key is **email-keyed**; admin-side writes need `auth.admin.getUserById(owner_id)` to get the email before busting it.
- `getSubscriptionState` computes expiry from timestamps, so it degrades gracefully if the cron is late — but the RPC path (ShellGuard poll) only knows what the SQL function checks; keep them in sync.
- Three different admin secrets (§1) — check which app a route lives in before choosing the auth check.
- The `graphify-out/` directory is large and partially stale; don't trust it over the actual code.
