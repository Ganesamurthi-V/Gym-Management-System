# GymFlow — Unified App Migration Plan
## Combining Owner App + Member App into a single PWA at `app.gymflow.sbs`

> **Purpose:** This document provides the complete specification for an AI agent
> (Kiro) to merge the current two-app architecture into a single Next.js
> application served from one domain, with role-based routing, a unified login
> page, and PWA capabilities for both roles.

---

## 1. Current Architecture (Before)

### 1.1 Owner App
- **Domain:** `app.gymflow.sbs`
- **Codebase:** Root folder `c:\Gym Management system\gymflow\`
- **Stack:** Next.js 15 App Router, Supabase Auth, Tailwind CSS
- **Port (dev):** 3004
- **Auth role:** No explicit `role` in `user_metadata` (absence = owner)
- **Key routes:** `/dashboard`, `/members`, `/payments`, `/attendance`, `/dues`,
  `/inventory`, `/programs`, `/member-app`, `/account`, `/subscription`, `/admin`
- **Layout:** Single `app/layout.tsx` → `AppShell` (sidebar nav, trial banner)
- **Middleware:** `middleware.ts` — auth gate, subscription paywall, graph domain isolation
- **DB:** Supabase project `lrzacwfypnsnjqyhidpn` (shared with member app)

### 1.2 Member App
- **Domain:** `member.gymflow.sbs`
- **Codebase:** `gymflow-member/` subfolder
- **Stack:** Next.js 15 App Router, Supabase Auth, Tailwind CSS, Serwist PWA
- **Port (dev):** 3010
- **Auth role:** `user_metadata.role = 'member'`
- **Key routes:** `/home`, `/workout`, `/progress`, `/rewards`, `/profile`,
  `/membership`, `/membership/card`, `/attendance`
- **Layout:** `app/(member)/layout.tsx` → `MemberShell` (bottom nav)
- **Middleware:** `src/middleware.ts` — auth gate (getClaims), member-only check
- **PWA:** Full PWA with `manifest.json`, service worker (Serwist), offline support
- **Activation flow:** `/activate/[token]`, `/activate/verifying`, `/activate/success`

### 1.3 Shared Infrastructure
- Same Supabase project (same `NEXT_PUBLIC_SUPABASE_URL`)
- Same auth cookie name (`sb-lrzacwfypnsnjqyhidpn-auth-token`)
- Same database, same RLS policies
- Both use `@supabase/ssr` 0.10.x + `@supabase/supabase-js` 2.105.x
- Both use `getClaims()` for local JWT verification (ES256 JWKS)

---

## 2. Target Architecture (After)

### 2.1 Single Domain
- **Domain:** `app.gymflow.sbs` (serves BOTH owner and member experiences)
- **`member.gymflow.sbs`:** Retired. Redirect all traffic to `app.gymflow.sbs/m/...`
- **Landing page:** `gymflow.sbs` (unchanged, separate Vite project)

### 2.2 Route Structure
```
app.gymflow.sbs/
├── /auth/login          ← Unified login (role selector: Owner | Member)
├── /auth/create-account ← Owner registration (unchanged)
├── /auth/setup-password ← Owner password setup (unchanged)
│
├── /owner/              ← Owner route group (existing owner app routes)
│   ├── /owner/dashboard
│   ├── /owner/members
│   ├── /owner/payments
│   ├── /owner/attendance
│   ├── /owner/dues
│   ├── /owner/inventory
│   ├── /owner/programs
│   ├── /owner/member-app
│   ├── /owner/account
│   ├── /owner/subscription
│   └── /owner/admin
│
├── /m/                  ← Member route group (existing member app routes)
│   ├── /m/home
│   ├── /m/workout
│   ├── /m/progress
│   ├── /m/rewards
│   ├── /m/profile
│   ├── /m/membership
│   ├── /m/membership/card
│   └── /m/attendance
│
├── /activate/           ← Member activation flow (unchanged path)
│   ├── /activate/[token]
│   ├── /activate/verifying
│   ├── /activate/success
│   └── /activate/error
│
└── /api/                ← All API routes (merged)
    ├── /api/activate/*  ← Member activation APIs
    ├── /api/member/*    ← Member data APIs (bundle, etc.)
    ├── /api/programs/*  ← Program management APIs
    ├── /api/members/*   ← Owner member management APIs
    ├── /api/payments/*  ← Owner payment APIs
    └── ...              ← All existing owner API routes
```

### 2.3 Role Detection
```
JWT claim: user_metadata.role
  - undefined / null / 'owner' → Owner experience
  - 'member'                   → Member experience
```

### 2.4 PWA Configuration
Both roles get PWA capability from a SINGLE service worker:
- **Owner manifest:** `/manifest-owner.json` (name: "GymFlow", icon: owner logo)
- **Member manifest:** `/manifest-member.json` (name: "GymFlow Member", icon: member logo)
- The `<link rel="manifest">` is set dynamically based on the authenticated role
- Single service worker (`/sw.js`) handles offline for both

---

## 3. Implementation Steps

### Phase 1: Route Group Migration (No Feature Changes)

#### Step 1.1 — Create `app/(owner)/` route group
Move ALL existing owner routes into `app/(owner)/`:
```
app/dashboard/     → app/(owner)/dashboard/
app/members/       → app/(owner)/members/
app/payments/      → app/(owner)/payments/
app/attendance/    → app/(owner)/attendance/
app/dues/          → app/(owner)/dues/
app/inventory/     → app/(owner)/inventory/
app/programs/      → app/(owner)/programs/
app/member-app/    → app/(owner)/member-app/
app/account/       → app/(owner)/account/
app/subscription/  → app/(owner)/subscription/
app/admin/         → app/(owner)/admin/
app/import/        → app/(owner)/import/
app/onboarding/    → app/(owner)/onboarding/
```

**Layout:** Move current `AppShell` into `app/(owner)/layout.tsx`.
The root `app/layout.tsx` becomes minimal (just html/body/fonts/providers).

#### Step 1.2 — Create `app/(member)/` route group
Copy ALL member PWA pages from `gymflow-member/src/app/(member)/` into `app/(member)/`:
```
gymflow-member/src/app/(member)/home/        → app/(member)/home/
gymflow-member/src/app/(member)/workout/     → app/(member)/workout/
gymflow-member/src/app/(member)/progress/    → app/(member)/progress/
gymflow-member/src/app/(member)/rewards/     → app/(member)/rewards/
gymflow-member/src/app/(member)/profile/     → app/(member)/profile/
gymflow-member/src/app/(member)/membership/  → app/(member)/membership/
gymflow-member/src/app/(member)/attendance/  → app/(member)/attendance/
```

**Layout:** Create `app/(member)/layout.tsx` using the existing `MemberShell`
(bottom nav, no sidebar). Import from the migrated components.

#### Step 1.3 — Merge member app libraries
Copy member-specific libraries into the main project:
```
gymflow-member/src/lib/member-data.ts        → lib/member/member-data.ts
gymflow-member/src/lib/member-utils.ts       → lib/member/member-utils.ts
gymflow-member/src/lib/achievements/         → lib/member/achievements/
gymflow-member/src/lib/activation-token.ts   → lib/member/activation-token.ts
gymflow-member/src/lib/activation-email.ts   → lib/member/activation-email.ts
gymflow-member/src/lib/activation-store.ts   → lib/member/activation-store.ts
gymflow-member/src/lib/queries/member.ts     → lib/member/queries.ts
gymflow-member/src/lib/hooks/useMemberRealtime.ts → lib/hooks/useMemberRealtime.ts
gymflow-member/src/lib/perf.ts               → (already exists in main app)
```

#### Step 1.4 — Merge member components
```
gymflow-member/src/components/layout/BottomNav.tsx     → components/member/BottomNav.tsx
gymflow-member/src/components/layout/MemberShell.tsx   → components/member/MemberShell.tsx
gymflow-member/src/components/layout/MemberDataWarmer.tsx → components/member/MemberDataWarmer.tsx
gymflow-member/src/components/providers/QueryProvider.tsx → components/providers/QueryProvider.tsx
gymflow-member/src/components/auth/SessionLifecycle.tsx  → (merge with existing)
gymflow-member/src/components/auth/LogoutButton.tsx      → components/member/LogoutButton.tsx
```

#### Step 1.5 — Merge member API routes
```
gymflow-member/src/app/api/activate/    → app/api/activate/     (already exists partially)
gymflow-member/src/app/api/member/      → app/api/member/
gymflow-member/src/app/activate/        → app/activate/         (public pages)
gymflow-member/src/app/auth/login/      → (merge into unified login)
```

#### Step 1.6 — Merge types
```
gymflow-member/src/types/database.ts → Extend existing types/index.ts
  - Add MembersRow member-specific fields already present
  - Add WorkoutProgram, Attendance, Membership types (already in main)
  - Add ProgramAssignmentsRow
  - Add the get_member_gamification RPC type
```

### Phase 2: Unified Login Page

#### Step 2.1 — New `/auth/login` page
Replace the current owner-only login with a role-aware page:

```
┌─────────────────────────────────────────┐
│           GymFlow                        │
│                                         │
│   ┌───────────────┐ ┌───────────────┐  │
│   │  👤 Owner     │ │  🏋️ Member    │  │
│   │  Login        │ │  Login        │  │
│   └───────────────┘ └───────────────┘  │
│                                         │
│   [Email field]                         │
│   [Password field]                      │
│   [Sign In button]                      │
│                                         │
│   Don't have an account? Create one     │
│   (owner only)                          │
└─────────────────────────────────────────┘
```

**Behaviour:**
- Two tabs/cards at the top: "Gym Owner" and "Member"
- Both use the same email/password form
- After successful sign-in, check `user_metadata.role`:
  - `role === 'member'` → redirect to `/m/home`
  - Otherwise → redirect to `/owner/dashboard`
- If a member tries the owner tab (or vice versa), show inline error:
  "This account is a member account. Please use the Member login."

#### Step 2.2 — Redirect logic in middleware
```typescript
// After authentication succeeds:
const role = claims.user_metadata?.role

if (isOwnerRoute(pathname) && role === 'member') {
  redirect('/m/home')
}
if (isMemberRoute(pathname) && role !== 'member') {
  redirect('/owner/dashboard')
}
```

### Phase 3: Unified Middleware

#### Step 3.1 — New middleware structure
The merged middleware handles ALL roles:

```typescript
// middleware.ts (unified)

const OWNER_PREFIXES = ['/owner', '/admin']
const MEMBER_PREFIXES = ['/m']
const AUTH_PATHS = ['/auth']
const PUBLIC_PATHS = ['/activate', '/api/activate']

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // 1. Skip static assets + public paths
  if (isPublicPath(pathname)) return NextResponse.next()

  // 2. Graph domain isolation (unchanged)
  if (isGraphDomain(hostname)) { /* existing logic */ }

  // 3. Bare domain redirect (unchanged)
  if (isBareDomain(hostname)) { /* existing logic */ }

  // 4. Auth verification (getClaims — local, ~1ms)
  await supabase.auth.getSession() // refresh token
  const { data: claims } = await supabase.auth.getClaims()
  const role = claims?.claims?.user_metadata?.role

  // 5. Unauthenticated → login
  if (!claims && !isAuthPath(pathname) && !isPublicPath(pathname)) {
    redirect('/auth/login')
  }

  // 6. Role enforcement
  if (claims) {
    if (isMemberRoute(pathname) && role !== 'member') {
      redirect('/owner/dashboard')
    }
    if (isOwnerRoute(pathname) && role === 'member') {
      redirect('/m/home')
    }
  }

  // 7. Subscription paywall (owner only — handled in owner layout)

  // 8. Authenticated on /auth/* → redirect to appropriate home
  if (claims && isAuthPath(pathname)) {
    redirect(role === 'member' ? '/m/home' : '/owner/dashboard')
  }
}
```

### Phase 4: PWA Configuration

#### Step 4.1 — Install Serwist in the main project
```bash
npm install @serwist/next serwist
```

#### Step 4.2 — Service worker
Copy `gymflow-member/src/app/sw.ts` to `app/sw.ts`. The service worker handles:
- Precaching of static assets
- Offline fallback page
- Network-first strategy for API routes
- Cache-first for static assets

#### Step 4.3 — Dual manifests
Create two manifest files:

**`public/manifest-owner.json`:**
```json
{
  "name": "GymFlow",
  "short_name": "GymFlow",
  "start_url": "/owner/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563EB",
  "icons": [
    { "src": "/icons/owner-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/owner-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**`public/manifest-member.json`:**
```json
{
  "name": "GymFlow Member",
  "short_name": "GymFlow",
  "start_url": "/m/home",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563EB",
  "icons": [
    { "src": "/icons/member-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/member-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

#### Step 4.4 — Dynamic manifest link
In `app/layout.tsx`, render the `<link rel="manifest">` conditionally:
- If user is authenticated as member → `/manifest-member.json`
- If user is authenticated as owner → `/manifest-owner.json`
- If not authenticated → `/manifest-owner.json` (default)

This can be done via a server component that reads the session role.

#### Step 4.5 — Wrap next.config.js with Serwist
```javascript
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist(nextConfig)
```

### Phase 5: Styling Merge

#### Step 5.1 — Merge design tokens
Copy `gymflow-member/src/styles/design-tokens.css` into the main project.
The owner app already has its own tokens in the Tailwind config — merge them
so both co-exist. Use the member tokens for the `(member)` route group.

#### Step 5.2 — Tailwind config merge
Extend `tailwind.config.js` with:
- `rarity` color tokens (from member app)
- `brand` colors (already present in both — same values)
- Member-specific utilities (`pb-safe-bottom`, `pt-safe-top`, etc.)

#### Step 5.3 — Global CSS
Merge `gymflow-member/src/app/globals.css` into the main `app/globals.css`.
Deduplicate shared utilities (`.card`, `.btn-primary`, etc.).

---

### Phase 6: URL Migration & Redirects

#### Step 6.1 — Vercel redirects for `member.gymflow.sbs`
In `vercel.json`, add permanent redirects:
```json
{
  "redirects": [
    { "source": "/(.*)", "destination": "https://app.gymflow.sbs/m/$1", "permanent": true }
  ]
}
```
Apply this only for the `member.gymflow.sbs` domain in Vercel project settings.

#### Step 6.2 — Update activation email redirect URL
In `lib/member/activation-email.ts`, change:
```typescript
// Before
getMemberAppUrl() → 'https://member.gymflow.sbs'
// After
getMemberAppUrl() → 'https://app.gymflow.sbs'
```
The activation callback path stays `/api/activate/callback` (same).

#### Step 6.3 — Update WhatsApp invitation template
The `member_app_invitation` WhatsApp template button URL changes:
```
Before: https://member.gymflow.sbs/activate/{{1}}
After:  https://app.gymflow.sbs/activate/{{1}}
```
This requires updating the template in Meta Business Manager.

#### Step 6.4 — Update Supabase Auth redirect URLs
In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://app.gymflow.sbs`
- Redirect URLs: add `https://app.gymflow.sbs/**`
- Remove: `https://member.gymflow.sbs/**` (after migration)

---

## 4. File-by-File Migration Checklist

### From `gymflow-member/src/` → main project

| Source | Destination | Notes |
|--------|-------------|-------|
| `app/(member)/home/page.tsx` | `app/(member)/home/page.tsx` | Update imports |
| `app/(member)/workout/` (all files) | `app/(member)/workout/` | Update imports |
| `app/(member)/progress/page.tsx` | `app/(member)/progress/page.tsx` | Update imports |
| `app/(member)/rewards/` (all files) | `app/(member)/rewards/` | Update imports |
| `app/(member)/profile/page.tsx` | `app/(member)/profile/page.tsx` | Update imports |
| `app/(member)/membership/` (all files) | `app/(member)/membership/` | Update imports |
| `app/(member)/attendance/page.tsx` | `app/(member)/attendance/page.tsx` | Update imports |
| `app/(member)/layout.tsx` | `app/(member)/layout.tsx` | Uses MemberShell |
| `app/(member)/loading.tsx` | `app/(member)/loading.tsx` | Copy as-is |
| `app/(member)/error.tsx` | `app/(member)/error.tsx` | Copy as-is |
| `app/activate/` (all) | `app/activate/` | Already partially exists |
| `app/api/activate/` (all) | `app/api/activate/` | Already partially exists |
| `app/api/member/bundle/route.ts` | `app/api/member/bundle/route.ts` | Copy |
| `app/auth/login/page.tsx` | Discard (replaced by unified login) | — |
| `lib/member-data.ts` | `lib/member/member-data.ts` | Update import paths |
| `lib/member-utils.ts` | `lib/member/member-utils.ts` | Update import paths |
| `lib/achievements/` | `lib/member/achievements/` | Copy directory |
| `lib/activation-token.ts` | `lib/member/activation-token.ts` | Update imports |
| `lib/activation-email.ts` | `lib/member/activation-email.ts` | Update imports |
| `lib/activation-store.ts` | `lib/member/activation-store.ts` | Update imports |
| `lib/queries/member.ts` | `lib/member/queries.ts` | Update imports |
| `lib/hooks/useMemberRealtime.ts` | `lib/hooks/useMemberRealtime.ts` | Update imports |
| `lib/supabase/server.ts` | Discard (use main app's version) | — |
| `lib/supabase/client.ts` | Discard (use main app's version) | — |
| `lib/supabase/env.ts` | Discard (use main app's version) | — |
| `lib/perf.ts` | Discard (already exists in main) | — |
| `components/layout/BottomNav.tsx` | `components/member/BottomNav.tsx` | Update href paths |
| `components/layout/MemberShell.tsx` | `components/member/MemberShell.tsx` | Update imports |
| `components/layout/MemberDataWarmer.tsx` | `components/member/MemberDataWarmer.tsx` | Update imports |
| `components/providers/QueryProvider.tsx` | `components/providers/QueryProvider.tsx` | Merge if exists |
| `components/auth/LogoutButton.tsx` | `components/member/LogoutButton.tsx` | Update imports |
| `components/auth/SessionLifecycle.tsx` | Merge into existing | — |
| `styles/design-tokens.css` | Merge into main `globals.css` | — |
| `types/database.ts` | Merge into `types/index.ts` | Add missing types |
| `tailwind.config.js` | Merge into main `tailwind.config.js` | Add rarity tokens |
| `next.config.mjs` | Discard (merge PWA config into main) | — |
| `public/manifest.json` | → `public/manifest-member.json` | Update start_url |
| `public/icons/` | → `public/icons/` (prefix with `member-`) | Rename |
| `public/offline.html` | Copy if not exists | — |

---

## 5. Import Path Mapping

After migration, all member-app imports change from `@/` (gymflow-member) to
the main project's `@/` alias. Key mappings:

| Old import (gymflow-member) | New import (main project) |
|-----------------------------|---------------------------|
| `@/lib/member-data` | `@/lib/member/member-data` |
| `@/lib/member-utils` | `@/lib/member/member-utils` |
| `@/lib/achievements/types` | `@/lib/member/achievements/types` |
| `@/lib/achievements/evaluator` | `@/lib/member/achievements/evaluator` |
| `@/lib/achievements/definitions` | `@/lib/member/achievements/definitions` |
| `@/lib/activation-token` | `@/lib/member/activation-token` |
| `@/lib/activation-email` | `@/lib/member/activation-email` |
| `@/lib/activation-store` | `@/lib/member/activation-store` |
| `@/lib/queries/member` | `@/lib/member/queries` |
| `@/lib/hooks/useMemberRealtime` | `@/lib/hooks/useMemberRealtime` |
| `@/lib/supabase/server` | `@/lib/supabase/server` (main's version) |
| `@/lib/supabase/client` | `@/lib/supabase/client` (main's version) |
| `@/lib/perf` | `@/lib/perf` (main's version) |
| `@/types/database` | `@/types` (main's types) |
| `@/components/layout/BottomNav` | `@/components/member/BottomNav` |
| `@/components/layout/MemberShell` | `@/components/member/MemberShell` |
| `@/components/layout/MemberDataWarmer` | `@/components/member/MemberDataWarmer` |
| `@/components/auth/LogoutButton` | `@/components/member/LogoutButton` |
| `@/components/providers/QueryProvider` | `@/components/providers/QueryProvider` |

---

## 6. Dependencies to Add to Main Project

```bash
npm install @serwist/next serwist @tanstack/react-query qrcode @types/qrcode
```

These are currently only in `gymflow-member/package.json` and will be needed
in the unified app.

---

## 7. Environment Variables

No new env vars needed. Both apps already use the same:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_MEMBER_APP_URL` → Change to `https://app.gymflow.sbs`
- `NEXT_PUBLIC_APP_URL` → `https://app.gymflow.sbs`

Remove `NEXT_PUBLIC_MEMBER_APP_URL` references — replace with `NEXT_PUBLIC_APP_URL`.

---

## 8. Database Changes

**None required.** The database schema already supports both roles:
- Members have `auth_user_id` + `user_metadata.role = 'member'`
- Owners have their `id` as `gyms.owner_id` + no role metadata
- RLS policies already distinguish via `auth.uid()` matching
- All existing migrations stay as-is

---

## 9. Testing Plan

### 9.1 Auth flows
- [ ] Owner login → lands on `/owner/dashboard`
- [ ] Member login → lands on `/m/home`
- [ ] Owner trying to access `/m/*` → redirected to `/owner/dashboard`
- [ ] Member trying to access `/owner/*` → redirected to `/m/home`
- [ ] Unauthenticated → `/auth/login`
- [ ] Tampered JWT → blocked (both roles)
- [ ] Session refresh works across both route groups

### 9.2 Owner app regression
- [ ] All owner pages render correctly at `/owner/*`
- [ ] Sidebar navigation works
- [ ] Realtime updates work
- [ ] Subscription paywall triggers correctly
- [ ] Admin panel accessible only to admin email

### 9.3 Member app regression
- [ ] All member pages render at `/m/*`
- [ ] Bottom nav works, links point to `/m/*`
- [ ] Workout session tracker works
- [ ] Achievements/rewards load correctly
- [ ] Attendance calendar shows correct IST times
- [ ] TanStack Query caching works
- [ ] Realtime updates work

### 9.4 Activation flow
- [ ] `/activate/[token]` works (public, no auth required)
- [ ] Verification email sends correctly
- [ ] Callback completes activation
- [ ] Status polling works
- [ ] Resend works

### 9.5 PWA
- [ ] Owner can install PWA (manifest-owner loads)
- [ ] Member can install PWA (manifest-member loads)
- [ ] Service worker caches correctly
- [ ] Offline page shows for both roles
- [ ] Push notifications (if configured) target correct role

### 9.6 Performance
- [ ] Owner pages: TTFB < 600ms (same as current)
- [ ] Member pages: TTFB < 400ms (same as current)
- [ ] No regression in Router Cache behaviour
- [ ] `staleTimes` config preserved for both route groups

---

## 10. Rollback Plan

1. Keep `gymflow-member/` folder intact until migration is verified in production
2. Keep `member.gymflow.sbs` domain configured in Vercel for 2 weeks after migration
3. If rollback needed: remove Vercel redirects, point `member.gymflow.sbs` back to gymflow-member build
4. Database is unchanged — no rollback needed there

---

## 11. Deployment Steps

1. Merge all code changes to main branch
2. Update Vercel project settings:
   - Remove `gymflow-member` as a separate project (or archive it)
   - Ensure `app.gymflow.sbs` points to the unified build
   - Add `member.gymflow.sbs` as a redirect-only domain
3. Update Supabase Auth redirect URLs
4. Update Meta WhatsApp template URL (requires template re-approval)
5. Deploy
6. Verify all test cases
7. Monitor for 48h before removing old member project

---

## 12. Hard Constraints

- Do NOT break any existing functionality during migration
- Do NOT change database schema
- Do NOT change RLS policies
- Do NOT change the XP/gamification logic
- Do NOT change the activation/verification pipeline logic
- Do NOT modify the landing page (`gymflow.sbs`)
- Keep all API routes backward-compatible (same paths, same request/response)
- The owner sidebar nav must NOT show on member pages
- The member bottom nav must NOT show on owner pages
- Both apps must work offline (PWA) after installation
- Cookie isolation is automatic (same domain = same cookie = shared session)
- An account can only be ONE role (owner OR member, never both)

---

## 13. Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Route group migration | 4-6 hours | Low (structural, no logic change) |
| Phase 2: Unified login | 2-3 hours | Low (new page, simple role check) |
| Phase 3: Unified middleware | 2-3 hours | Medium (auth logic change) |
| Phase 4: PWA configuration | 2-3 hours | Low (additive) |
| Phase 5: Styling merge | 1-2 hours | Low (CSS merge) |
| Phase 6: URL migration & redirects | 1-2 hours | Medium (external dependencies) |
| Testing & verification | 3-4 hours | — |
| **Total** | **15-23 hours** | — |

---

## 14. Post-Migration Cleanup

After the unified app is stable in production (2+ weeks):

1. Archive or delete `gymflow-member/` folder
2. Remove `member.gymflow.sbs` from Vercel
3. Remove old Supabase redirect URLs
4. Update all documentation references
5. Remove `NEXT_PUBLIC_MEMBER_APP_URL` env var
6. Update this document with "COMPLETED" status

---

*Document created: 2026-08-08*
*Status: PLANNING — not yet implemented*
