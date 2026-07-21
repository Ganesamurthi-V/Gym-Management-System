# GymFlow — Session Handoff

Date: 2026-07-21
Branch: `main`
Scope: Fixed the mobile release app's login "Network Error", hardened all API/database calls, redeployed the backend, and rebuilt the release APK.

---

## 1. Original problem

The mobile **release** APK showed a **"Network Error"** on login. The debug build worked. The request was to fix login and audit all API and database calls.

## 2. Root cause

Two compounding issues, both latency-related — not a wrong URL:

1. **Backend was slow in production.** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` existed locally but were **missing from Vercel production env**. Every request instantiated a real Upstash client that made doomed HTTP calls (with retries) before failing open. Measured production latency:
   - Auth route: **5–7s** (warm), middleware-only (401) ~0.7–1.6s
   - Logs route: **13.7s**
2. **Mobile axios timeout was 10s.** Cold serverless starts + the 13.7s logs call exceeded the timeout, so axios raised a generic `Network Error` even though the server would have responded.

The login contract itself was correct: mobile POSTs `{password}` to `/api/auth`; backend compares to `ADMIN_PANEL_SECRET`, returns `{ok:true}`; app stores the password as the bearer token; `verifyRequestAuth` accepts `Bearer <ADMIN_PANEL_SECRET>`. Verified in `gymflow-admin/lib/auth.ts:43-53`.

## 3. Backend fixes (gymflow-admin — Vercel project `super-admin`, root dir `gymflow-admin`)

- **`lib/redis.ts`** — When Upstash env vars are absent, export an in-memory **stub** (`incr/expire/del/scan` return instantly) instead of a real client that makes doomed network calls. Real client now also uses `retry: { retries: 1, backoff: () => 200 }` to cap retry latency. This makes rate-limiting **fail fast** instead of adding seconds per request.
- **`app/api/gyms/route.ts`** — `supabase.auth.admin.listUsers()` now passes `{ page: 1, perPage: 1000 }`. The default 50-user page meant gym owners beyond the first 50 showed "Unknown Email".
- **Vercel env** — Added `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to **production** (pulled from `gymflow-admin/.env.local`). Verified Upstash credentials return `PONG`.
- **Deployed** to production via `vercel deploy --prod`, aliased to `https://admin.gymflow.sbs`.

### Post-deploy latency (verified)
| Endpoint | Before | After |
|---|---|---|
| auth (warm) | 5–7s | ~0.9s |
| dashboard | — | 2.2s |
| gyms | — | 2.7s |
| logs | 13.7s | 6.1s |
| support/tickets | — | 1.8s |

Login returns `{"ok":true}` at 0.96s; `/api/gyms` returns owner emails correctly (`"owner":{"email":"..."}`).

## 4. Mobile fixes (gymflow-mobile)

- **`lib/api/client.ts`** — axios `timeout` raised **10000 → 30000** ms.
- **`lib/api/error-handler.ts`** — `parseApiError` now returns user-friendly messages for:
  - 401 with no body → "Your session has expired. Please sign in again."
  - `ECONNABORTED` (timeout) → "The server took too long to respond..."
  - No response (offline/DNS) → "Unable to reach the server. Check your internet connection..."
- **`lib/api/gyms.api.ts`** — Removed dead `updateGymSubscription()` + `GymSubscriptionData` type. It PATCHed `/api/gyms/[gymId]/subscription`, a route that **does not exist**. Subscription changes go through `subscription.api.ts` → `/api/admin/gyms/[id]/subscription/*` (all those routes verified present).

### Verified mobile→backend path mapping (all exist in backend)
- `GET /api/gyms`, `GET /api/gyms/[gymId]`, `PATCH /api/gyms/[gymId]/status`, `POST /api/gyms/reset-password`
- `GET /api/dashboard`, `GET /api/logs`
- `GET/PATCH /api/support/tickets`, `POST /api/support`, `POST /api/support/tickets/clear`
- `subscription.api.ts`: activate / danger / dates / detail / expire / notes / payment/approve / payment/reject / trial

## 5. Build & verification

- `npx tsc --noEmit` on gymflow-mobile → **exit 0** (clean).
- `./gradlew assembleRelease` → **BUILD SUCCESSFUL**.
- APK: `gymflow-mobile/android/app/build/outputs/apk/release/app-release.apk` (~65.8 MB, built 2026-07-21 18:00).
- SDK: minSdk 23, compile/target 35.

## 6. OPEN / UNRESOLVED

- **Manage Subscription page shows a blank screen** (reported at end of session, NOT yet investigated). Likely candidates to check:
  - `fetchSubscriptionDetail(gymId)` → `GET /api/admin/gyms/[id]/subscription/detail` — confirm it returns 200 with the expected `SubscriptionDetailResponse` shape.
  - A render crash on `null`/undefined fields in the detail screen (e.g. `owner`, `usageStats`, `timeline` can be null per the types in `subscription.api.ts`).
  - Screen-level error boundary / navigation param (`gymId`) missing.
  - Next step: reproduce with the debug build + Metro logs, or add logging around the detail fetch and the screen's render guards.
- The APK built here is **unverified end-to-end on a device/emulator** (emulator boot failed earlier this session, exit code 1). Needs a manual install + login smoke test.

## 7. Notes / gotchas

- Memory: `graph.gymflow.sbs` (WhatsApp proxy) must stay on the `gym-management-system` Vercel project or sends 401/404. Unrelated to this work but don't move it.
- The `super-admin` project root dir is `gymflow-admin`; deploy from repo root with `.vercel/project.json` pointing at `super-admin`, or from within `gymflow-admin`.
- Never log request bodies in the mobile client — they carry the password/token (already handled in `client.ts`).
