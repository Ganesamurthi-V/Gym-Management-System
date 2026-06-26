# GymFlow — Full Codebase Audit Report

**Stack:** Next.js 15 (App Router) · React 18 · Supabase (Postgres + Auth + RLS) · Upstash Redis · Sentry · Vercel
**Scope:** Main app (`/app`, `/lib`, `/components`), admin app (`/gymflow-admin`), database schema & RLS (`/supabase`)
**Date:** June 26, 2026

---

## How to read this report

Issues are grouped by category and tagged with a severity:

- 🔴 **Critical** — security exposure or correctness bug, fix immediately
- 🟠 **High** — real user-facing pain (the "slowness") or meaningful risk
- 🟡 **Medium** — should fix soon, not on fire
- 🟢 **Low / Polish** — code quality, consistency, future-proofing

---

## 1. Performance Issues

### 1.1 🟠 Triple-redundant auth checks on every page navigation
Every protected route re-validates the session **2–3 times** before rendering anything, because the same check is duplicated across three independent layers that don't share state:

| Route | Auth calls | Where they happen |
|---|---|---|
| `/dashboard` | **3×** | `middleware.ts` → `app/dashboard/layout.tsx` → `app/dashboard/page.tsx` |
| `/members` | **3×** | `middleware.ts` → `app/members/layout.tsx` → `app/members/page.tsx` |
| `/payments`, `/dues`, `/attendance`, `/inventory` | **2×** | `middleware.ts` → `page.tsx` |

`supabase.auth.getUser()` is **not** a free local JWT decode — it's a network round-trip to Supabase's Auth server to validate the token. Paying that latency 2–3 times, sequentially, on a single click compounds directly into the "feels slow" experience, even though the actual route-switch animation (confirmed separately) is fast.

The Graphify dependency report generated inside the repo independently flags this exact symptom: `createClient()` is the single most-connected function in the entire codebase (52 edges) — i.e. it's being invoked far more often than the page count would suggest it needs to be.

**Fix:** Hoist the auth check into one shared layout higher in the tree (e.g. a route group `app/(app)/layout.tsx` wrapping all protected routes) so it runs once per navigation. Pass `user`/`gym` down via React context or props instead of re-fetching in every layout and page.

### 1.2 🟠 Duplicate `gyms` table lookup on the same request
`dashboard` and `members` each query `gyms` by `owner_id` **twice** — once in their `layout.tsx`, once again in their `page.tsx` — for the exact same row, on the same request.

**Fix:** Resolve `gym` once in the shared layout (see 1.1) and pass it down. This also gets rid of an entire DB round trip per page load.

### 1.3 🟠 Payments page: unbounded query, zero caching
```ts
// app/payments/page.tsx
// All payments with member info — no limit, needed for accurate sparkline
const { data: payments } = await supabase
  .from('memberships')
  .select('*, member:members(id, name, phone, member_number)')
  .eq('gym_id', gym.id)
  .order('created_at', { ascending: false })
```
This pulls the gym's **entire payment history**, joined with member data, on every visit — no `.limit()`, no pagination, no Redis cache (unlike `dashboard`/`members`, which both use `cacheWrapper`). The same pattern repeats for `inventory_sales` directly below it. This page gets linearly slower as the gym's history grows — it's the single worst-scaling query in the app, and it's on a page people open constantly.

**Fix:** Compute the sparkline server-side (e.g. a `get_payment_sparkline` RPC, similar to the existing `get_gym_dashboard` RPC) instead of shipping every row to the client. Paginate the full payment list the same way `members/page.tsx` does (`PAGE_SIZE = 200`). Wrap both queries in `cacheWrapper`.

### 1.4 🟡 RLS policies use a subquery per row instead of a cached claim
Every policy follows this shape:
```sql
USING (EXISTS (SELECT 1 FROM gyms WHERE id = members.gym_id AND owner_id = auth.uid()))
```
This is correct and safe, but it re-runs a subquery against `gyms` for every row Postgres evaluates, on every query, on every table. At current scale this is invisible; as `members`/`memberships` grow into the tens of thousands of rows per gym, this becomes a real cost on list/report queries.

**Fix (not urgent yet):** Consider caching `gym_id` as a custom JWT claim at login (Supabase supports this via Auth Hooks) so policies can compare `gym_id = auth.jwt() ->> 'gym_id'` directly with no subquery.

### 1.5 🟢 No virtualization on large list views
`MembersClient.tsx` (874 lines) renders up to 200 members directly into the DOM with no windowing/virtualization. Fine today at `PAGE_SIZE = 200`, but worth keeping in mind if that limit is ever raised.

---

## 2. Database Issues

### 2.1 🟡 Duplicate table definitions in the schema file
`supabase-schema.sql` defines both `inventory_sales` and `workout_programs` **twice** (lines ~633 & ~836, and ~679 & ~882 respectively), each with their own `CREATE TABLE IF NOT EXISTS` and a full duplicate set of RLS policies. The `IF NOT EXISTS` guard prevents this from erroring on a second run, but it signals the schema file has drifted from copy-pasting rather than being generated from migrations, and makes it easy to silently apply a stale/conflicting policy block by accident.

**Fix:** Treat `supabase-schema.sql` as a generated snapshot (from `supabase db dump`), not a hand-edited source of truth. Deduplicate now and verify the migrations directory (`/supabase/migrations`, 16 files) is the actual source of truth going forward.

### 2.2 🟡 Inconsistent caching strategy across data-heavy pages
- `dashboard` and `members` → cached via `cacheWrapper` (Redis, 60s TTL) ✅
- `payments`, `inventory`, `dues` → **no caching at all**

There's no written rule for which pages get cached, so it looks accidental rather than designed. Given dues/attendance are already small bounded queries this is low risk for them specifically, but payments (see 1.3) absolutely needs it.

### 2.3 🟢 RPC-with-JS-fallback pattern adds a hidden failure mode
```ts
// app/dashboard/page.tsx
const { data: rpcData, error: rpcError } = await supabase.rpc('get_gym_dashboard', ...)
if (!rpcError && rpcData) return rpcData
// Fallback to JS aggregation if RPC is not yet created in the DB
console.warn('Fallback to JS aggregation for Dashboard...')
```
This is a reasonable migration safety net, but if the RPC silently starts erroring in production (timeout, permissions change, etc.) the app falls back to a much heavier 4-query `Promise.all` + in-memory aggregation path **without anyone noticing**, since it only logs a `console.warn`. Over time this can mean you're paying the "slow path" cost in production while believing the fast RPC is active.

**Fix:** Send a Sentry breadcrumb/event (not just `console.warn`) whenever the fallback path fires, so a regression here is visible.

### 2.4 🟢 Missing indexes were already found and partially fixed
`20260625000000_audit_fixes.sql` added two indexes (`memberships(member_id, created_at)`, `members(gym_id, created_at)`) after an audit. Good that this was caught — but it's worth running a fresh `EXPLAIN ANALYZE` pass against the payments query in 1.3 specifically, since it has no `LIMIT` and the heaviest join in the app.

---

## 3. Multi-Tenant Isolation Issues

The core isolation model is **sound**: every tenant-scoped table (`members`, `memberships`, `attendance`, `inventory`, `inventory_sales`, `workout_programs`, `admin_messages`, `gym_plan_prices`, geo tables) has RLS enabled, and every policy checks `gym_id` against `gyms.owner_id = auth.uid()`. This is the right pattern and it's applied consistently.

That said:

### 3.1 🟠 API routes rely entirely on RLS with no defense-in-depth filter
```ts
// app/api/members/route.ts — GET
const { data, error, count } = await supabase
  .from('members')
  .select('...', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1)
// no .eq('gym_id', gym.id) — relies purely on RLS
```
RLS is currently correct, so this isn't leaking data today. But it means tenant isolation in this route has **exactly one layer of defense**. If a future migration ever disables RLS on `members` for a debugging session and someone forgets to re-enable it, or a service-role client is used here by mistake later, this route would silently return cross-tenant data with no application-level check to catch it.

**Fix:** Add an explicit `.eq('gym_id', gym.id)` filter in API routes even though RLS already enforces it. Redundant by design — that's the point.

### 3.2 🔴 Two debug endpoints bypass RLS entirely and are unauthenticated
This is the most serious finding in the whole audit:

```ts
// app/api/check-columns/route.ts
export async function GET() {
  const supabase = createClient(URL, SERVICE_ROLE_KEY)   // bypasses RLS
  const { data, error } = await supabase.from('support_tickets').select('*')
  return NextResponse.json({ data, error })               // returns it to anyone
}
```
```ts
// app/api/check-realtime/route.ts — same pattern, uses the service role key too
```
Both routes:
- Have **no authentication check** at all.
- Use the **service role key**, which bypasses every RLS policy in the database.
- Return the raw result straight to the HTTP response.

Anyone who finds `yourdomain.com/api/check-columns` can read the entire `support_tickets` table across **every gym**, with no login required. This looks like a debugging script that was never removed before deploy.

**Fix — do this first, before anything else in this report:** Delete both routes, or at minimum gate them behind admin auth + remove the service-role client. Then rotate the Supabase service role key as a precaution, since it's possible to have been called already if it has been live in production at this URL.

### 3.3 🟡 Several authenticated mutation routes skip rate limiting
`delete-gym`, `delete-data`, `inventory/sell`, `inventory/delete`, `support/clear`, `support/ticket` have no rate limit. These are authenticated and ownership-checked (verified for `delete-gym`), so this isn't a tenant-isolation leak, but it's a gap against accidental double-submits and scripted abuse from a compromised single account. Lower severity than 3.2, still worth closing.

### 3.4 🟢 Admin app authority model is coarse
The admin panel (`gymflow-admin`) uses a single shared JWT with one role: `super_admin` (see `lib/auth.ts`). There's no per-admin identity, no granular permissions, and no audit log of which admin performed which action against which gym. Fine for a single-operator tool today; worth revisiting before adding a second admin user.

---

## 4. Production Readiness

### What's already solid
- **Security headers** (`next.config.js`): CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy all configured.
- **Error handling**: `global-error.tsx` shows a sanitized message to users and forwards the real error to Sentry — no stack traces leaked to the client.
- **Sentry wired into both apps** (client, server, edge configs) with source map upload in CI.
- **Secret scanning pre-commit hook** (`scripts/check-secrets.js`) blocks committing real API keys; only `.env.example` files are present in the repo, no live secrets checked in.
- **TypeScript `strict: true`** across the main app.
- **Bundle splitting**: `optimizePackageImports`, manual `splitChunks` for Supabase/date-fns, `exceljs` kept server-only via `serverExternalPackages` — all sensible, deliberate choices.

### Gaps
- 🔴 The two debug routes in 3.2 are a production-readiness blocker on their own — this should be treated as a pre-launch checklist item, not a someday fix.
- 🟡 No visible automated test suite (no `__tests__`, no `*.test.ts` found in the extracted archive). For a system handling payments and member records, even a thin layer of tests around the payment/dues aggregation logic (`getMemberStatus`, `getDaysRemaining`, the dashboard aggregation fallback) would catch regressions that are otherwise only found in production.
- 🟡 `lib/timeout.ts` (a generic `Promise.race` timeout wrapper) exists in the codebase but its actual usage wasn't found wired into any of the slow/unbounded queries identified in Section 1 — it looks like it was added in anticipation of timeout issues but not yet applied where it matters most (e.g. the payments query).
- 🟢 `tsconfig.tsbuildinfo` (332K) and `gymflow-admin/tsconfig.tsbuildinfo` (112K) are committed into the zip — these are local build caches and shouldn't be version-controlled; check they're in `.gitignore`.

---

## 5. Code Quality

### Positives
- Consistent file structure: every route's server `page.tsx` hands off to a colocated `*Client.tsx` component — easy to navigate.
- `RequestLogger` (used in dashboard/members) gives structured step-by-step timing logs (`logger.start()`/`logger.end()`), which is exactly the right instinct for diagnosing the kind of latency issues in Section 1 — it just isn't applied consistently to `payments`, which has no logger at all.
- `mapSupabaseError()` centralizes turning raw Postgres errors into clean API error codes — good, avoids leaking raw DB errors to clients in API routes.
- Rate limiter (`lib/rateLimit.ts`) is tied to real upstream quota numbers (Groq's free-tier RPM/TPM), not arbitrary guesses — shows actual capacity planning, not cargo-culting.

### Issues
- 🟡 **Inconsistent defensive depth.** Some routes double-check ownership explicitly (`delete-gym`), others rely purely on RLS (`api/members` GET) — there's no house style here, which makes it hard to know, file by file, how much protection actually exists.
- 🟡 **Inconsistent logging.** `RequestLogger` is used in `dashboard`/`members` but not `payments`/`dues`/`attendance` — meaning the pages most likely to have performance problems (payments) are the ones with the least visibility into where time is actually going.
- 🟢 **Large client components.** `ReportsClient.tsx` (1319 lines, currently archived), `MembersClient.tsx` (874 lines), `AccountClient.tsx` (866 lines) are all doing a lot in one file. Not broken, but harder to maintain — worth splitting into smaller components (e.g. separate filter bar, table, modals) as they keep growing.
- 🟢 **`app/_reports_archived`** — an entire reports feature sits in the tree prefixed `_archived` rather than being removed or feature-flagged cleanly. If it's genuinely dead, delete it; if it's coming back, say so in a comment so the next person (or the next Claude) doesn't have to guess.
- 🟢 Two near-identical Redis/cache utility files exist almost line-for-line in both `lib/` (main app) and `gymflow-admin/lib/` (admin app) — `redis.ts`, `cache.ts` (`invalidatePattern`). Since this is a monorepo-style layout, these could be shared from one package instead of duplicated.

---

## 6. Priority Action List

If you only fix five things this week, fix these in this order:

1. 🔴 **Delete or lock down `/api/check-columns` and `/api/check-realtime`.** Unauthenticated service-role data exposure — this is the only true emergency in this report.
2. 🟠 **Collapse the auth/gym lookups.** One shared layout doing `auth.getUser()` + `gyms` lookup once per navigation instead of 2–3 times. This is most of what you're feeling as "slow."
3. 🟠 **Cap and cache the payments query.** Add pagination + `cacheWrapper`, move the sparkline calc into an RPC like the dashboard already has.
4. 🟡 **Add explicit `.eq('gym_id', ...)` filters in API routes** even though RLS already covers it — cheap insurance.
5. 🟡 **Deduplicate `supabase-schema.sql`** and confirm migrations are the real source of truth going forward.

---

*This report reflects a static read-through of the codebase as provided (`Gym-Management-System-final-update.zip`), cross-checked against the repo's own `graphify-out/GRAPH_REPORT.md` dependency analysis. It does not include a live load test or production query-plan analysis (`EXPLAIN ANALYZE`) — recommended as a logical next step once the fixes above are in.*