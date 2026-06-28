# GymFlow — Audit Remediation Log

**This document:** Verified status of fixes as of the latest codebase upload, checked directly against source.

---

## 🚀 Recent: Performance Audit (Navigation Latency)
**Source audit:** `outstanding issues.md` (Performance Audit - Navigation Latency)

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | 🔴 Critical | `AppShell` data-fetch waterfall | ✅ Fixed |
| 2 | 🔴 Critical | Auth validated twice per navigation | ✅ Fixed |
| 3 | 🟠 High | `getGym()` hits Postgres on every navigation | ✅ Fixed |
| 4 | 🟠 High | Router cache disabled for dynamic routes | ✅ Fixed |
| 5 | 🟡 Medium | `revalidate = 0` on Members page | ✅ Fixed |
| 6 | 🟡 Medium | `AppShell` queries run sequentially | ✅ Fixed |

### Confirmed Performance Fixes

#### Issue 1 & 6 — `AppShell` Calls Parallelized
**File:** `components/layout/AppShell.tsx`
`getUnreadAdminMessages` was running sequentially after the first `Promise.all`, adding unnecessary latency. Now `getGymActiveStatus` and `getUnreadAdminMessages` run concurrently in one `Promise.all` after the gym is fetched.

#### Issue 2 — `getAuthUser()` Uses Local Session
**File:** `lib/dal.ts`
Switched from `supabase.auth.getUser()` (network round-trip) to `supabase.auth.getSession()` (local JWT validation). Middleware already performs the authoritative server-side check, so this safely removes one full network round-trip from every page render.

#### Issue 3 — `getGym()` Cached in Redis
**File:** `lib/dal.ts`, `app/account/actions.ts`, `app/account/AccountClient.tsx`, `app/members/new/page.tsx`
`getGym()` was hitting Postgres on every navigation. It is now wrapped in `cacheWrapper` with a 120s TTL. To prevent stale data, a new Server Action `invalidateGymCache()` was created and wired into all client components that mutate the `gyms` table (`handleUpdateGymName`, `handleUpdateGymInfo`, and `handleSaveNewPlan`).

#### Issue 4 — Client Router Cache Enabled
**File:** `next.config.js`
Added `experimental.staleTimes` with `dynamic: 30` and `static: 180` to enable the client-side router cache. This prevents Next.js from unconditionally triggering a full RSC round-trip for recently-visited pages.

#### Issue 5 — Removed `revalidate = 0`
**File:** `app/members/page.tsx`
Removed `export const revalidate = 0`. The data fetch is already Redis-cached with a 300s TTL and all mutation paths properly invalidate the cache. The explicit opt-out was actively fighting the cache by forcing a full Server Component re-execute on every hit.

---

## 🛡️ Previous: Security & General Audit
**Source audit:** Previous issues (27 June 2026, 12 issues)

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | 🔴 P0 | Sentry DSN hardcoded (client) | ✅ Fixed |
| 2 | 🔴 P0 | `sendDefaultPii: true` (client) | ✅ Fixed |
| 3 | 🟠 P1 | 10s polling in `ShellGuard.tsx` | ✅ Fixed |
| 4 | 🟠 P1 | Dashboard month filter — full table scan | ✅ Fixed |
| 5 | 🟠 P1 | `logo.png` 786 KB, raw `<img>` | ⚠️ Partial |
| 6 | 🟠 P1 | `NewMemberPage` re-fetches auth/gym repeatedly | ✅ Fixed |
| 7 | 🟠 P1 | `tracesSampleRate: 1` (client) | ✅ Fixed |
| 8 | 🟡 P2 | Missing index `(gym_id, date)` on `attendance` | ✅ Fixed |
| 9 | 🟡 P2 | Missing index `(gym_id, end_date)` on `memberships` | ✅ Fixed |
| 10 | 🟡 P2 | `aliases.ts` (58 KB) parsed at cold start | ✅ Fixed |
| 11 | 🟡 P2 | Debug `console.log` in `DashboardClient` | ✅ Fixed |
| 12 | 🟢 P3 | Admin panel missing CSP/HSTS | ✅ Fixed |
| A | 🔴 New | `sentry.server.config.ts` / `sentry.edge.config.ts` not updated | ✅ Fixed |
| B | 🟠 New | Logo source file still oversized after Issue 5 fix | ⚠️ Partial |
| C | 🟡 New | `handleSaveNewPlan` redundant `SELECT` before `UPDATE` | ✅ Fixed |

### Open Items & Action Items
1. 🔴 Rotate the Sentry DSN in the Sentry dashboard.
2. 🟠 Run `logo.png` through a PNG compressor to bring it under ~40 KB.
3. 🟠 Remove the duplicate `gymflow-admin/public/logo.png`.
4. 🟡 Confirm `supabase db push` has been run against the live database for `20260627_perf_indexes.sql`.