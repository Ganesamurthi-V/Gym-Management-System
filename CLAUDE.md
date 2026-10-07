# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

GymFlow is a multi-tenant gym management SaaS for small gyms in Tamil Nadu / Puducherry, India. Users are gym owners with limited tech experience on phones over 4G, so the UI is mobile-first and navigation latency is treated as a feature. Currency is INR, payments are UPI, and member messaging is WhatsApp.

## Repository layout

The repo root **is** the main Next.js app. Sibling folders are separate projects with their own `package.json`, deployed independently, and excluded from the root `tsconfig.json`:

| Path | What | Dev |
|------|------|-----|
| `/` (root) | Unified owner console + member PWA (Next.js 15 App Router) | `npm run dev` → :3004 |
| `gymflow-admin/` | Super-admin panel (Next.js, own JWT session, service-role DB access) | `npm run dev` → :3001 |
| `gymflow-mobile/` | Admin mobile app (bare React Native 0.75, FCM push) | `npm run android` |
| `landing-page-1/` | Marketing site (Vite + React, oxlint) | `npm run dev` |
| `_archived/` | Dead code kept for reference. Do not import from it. |

Run commands from the folder of the project you are changing; each has its own `node_modules`.

## Commands (root app)

```bash
npm run dev            # next dev on http://localhost:3004
npm run build          # production build — run before pushing; this is the real typecheck
npm run lint           # next lint
npm test               # vitest run (Node env, __tests__/**/*.test.ts only)
npx vitest run __tests__/whatsapp/scheduling.test.ts   # single file
npx tsc --noEmit       # typecheck without building
npm run verify:tour    # checks driver.js tour anchors still exist in the UI
npm run verify:whatsapp
```

There is no CI and no pre-commit hook; `npm run build` and `npm test` are the gate. Changes pushed to `main` deploy to Vercel (root builds are skipped when only sibling projects or `docs/` changed — see `scripts/vercel-ignore-root.sh`).

## Architecture (root app)

### One origin, two experiences

`app.gymflow.sbs` serves both products, separated by URL namespace:

- `/owner/*` — owner console. Layout mounts `AppShell`, which is also the **subscription paywall**.
- `/m/*` — member PWA. `app/m/layout.tsx` is the **authorization boundary** (confirms a real `members` row).
- `/auth/*` — unified login; `/activate/*` — public member activation flow reached from WhatsApp links.
- `/api/*` — route handlers for both.

Role comes from the JWT claim `user_metadata.role` (`'member'`, otherwise owner) via `lib/auth/roles.ts`. It picks which experience renders; it is **not** the security boundary — RLS and the two layouts are.

Route classification lives in `lib/protected-routes.ts` and `lib/member/redirect.ts`, shared by middleware (Edge) and layouts (Node). Keep these files import-free. Pre-merge URLs (`/dashboard`, `/members`, `member.gymflow.sbs/...`) are 308-redirected by middleware; add new owner top-level routes to `LEGACY_OWNER_PREFIXES` only if they existed before the merge.

`middleware.ts` also handles host isolation: `graph.gymflow.sbs` is an API-only WhatsApp Graph reverse proxy (allowlist in `lib/graph-domain.ts`) and must never render pages.

### Auth and data access

- **The browser never talks to Supabase.** There is no browser Supabase client. Env vars are the private `SUPABASE_URL` / `SUPABASE_ANON_KEY` (read through `lib/supabase/env.ts`, which is `server-only`). Do not introduce `NEXT_PUBLIC_SUPABASE_*` or `createBrowserClient`.
- Client components call our own API via `lib/api/client.ts` (adds `credentials` + `X-Requested-With` for CSRF), or use Server Actions (`actions.ts` beside the page).
- Server code uses `createClient()` from `lib/supabase/server.ts` (cookie session, RLS applies).
- `createAdminClient()` (`lib/supabase/admin.ts`) uses the service-role key and **bypasses RLS**. Use only where the caller has already been verified and RLS genuinely cannot serve the query; always scope by a server-resolved `gym_id`.
- Owner API routes should be wrapped in `withAuth(routeName, handler)` from `lib/api/withAuth.ts`. It does CSRF, auth, rate limiting, and resolves `gym` server-side. Never trust a `gym_id` from the request body. Return responses with `apiSuccess` / `apiError` (`{ success, data | error: { code, message } }`).
- In Server Components use `lib/dal.ts` (`getAuthUser`, `getGymCore`, …). These are wrapped in React `cache()` so layout + page share one round trip.
- Auth checks on the hot path use `getClaims()` (local JWT verification, ~1ms), not `getUser()` (network call). Preserve that in middleware, layouts and the DAL.
- Every tenant table has `gym_id` and RLS scoped to `gyms.owner_id = auth.uid()`. New tables need RLS policies in the same migration.

### Caching rules

- Redis (Upstash) via `lib/cache.ts`; keys are defined centrally in `lib/cache-keys.ts`. Mutations must invalidate the keys they affect.
- **Never cache access-control state** (`gyms.is_active`, subscription columns). Caching these caused past paywall-bypass bugs; `getGymCore` is deliberately uncached.
- The client Router Cache holds dynamic RSC payloads for 180s (`next.config.mjs` `staleTimes`). After a mutation, call `router.refresh()` / the relevant invalidation or the user sees stale data.
- "Realtime" hooks in `lib/hooks/` are polling-based resync, not Supabase Realtime sockets.

### WhatsApp automation

- `lib/whatsapp/` — automation engine (scheduling, idempotency, queue, sender); `services/whatsapp/` — Graph API client and webhook processors; `repositories/whatsapp/` — DB access; `config/whatsapp.ts` — config.
- Event sends (welcome, renewal) fire inline with claim-then-send. Scheduled sends go through `whatsapp_send_queue`, drained 5 msgs / 5 min by QStash at `/api/whatsapp/queue/drain`.
- Crons (`vercel.json`): `/api/cron/whatsapp` 03:30 UTC, `/api/cron/subscription` 00:00 UTC, both authenticated by `CRON_SECRET`.
- Template names and parameters must match Meta-approved templates exactly. This area is covered by tests in `__tests__/whatsapp/` — run them after any change.

### Other modules

- `lib/import/` — bulk Excel/CSV import pipeline (ExcelJS, server-only, dynamically imported).
- `lib/upi/` — UPI QR parse / link / QR generation.
- `lib/tours/` — driver.js owner onboarding tours; anchors in `lib/tours/anchors.ts` must match `data-tour` attributes (`npm run verify:tour`).
- `features/member-app/` — owner-side "Member App" management page (feature-folder style: components / hooks / services / types).
- `lib/logger.ts` — structured request logger (pino) with redaction. Use it instead of `console.log` (stripped in production builds anyway).
- `app/sw.ts` — single Serwist service worker for both PWAs; caches static assets only, never navigations or API responses. Disabled in dev.

## Styling and theming

Tailwind 3 with `darkMode: 'class'`. Colour scales are wired to CSS variables (`app/theme.css`, `tailwind.config.js`) so dark mode works **without** `dark:` variants. Follow the token rules instead of adding `dark:` classes:

- Card / modal / input backgrounds: `bg-surface`, `bg-surface-card`, `bg-surface-secondary`, `border-surface-border` — not `bg-white`.
- `white` / `black` are literal and do not flip. `text-white` is for labels on filled coloured buttons.
- Neutrals (`slate-*` etc.) and semantic tints/text (`50–200`, `600–900`) invert automatically; `300–500` stay literal for filled controls.
- `ink-*` / `carbon-*` — dark in both themes (scrims, QR plates, auth pages). `bg-emphasis text-emphasis-fg` — high-emphasis pill that inverts.
- Brand is Royal Blue `brand-500` (`#2563EB`); success `emerald`, warning `amber`, destructive `red`. Font is Sora.
- Use `cn()` from `lib/utils.ts`. Check `lib/utils.ts` for date/currency/status helpers before writing new ones.

Default theme is light; dark is opt-in (`lib/theme/theme.ts`). Verify UI changes in both.

## Conventions

- Server Components by default; `'use client'` only for interactivity. Common pattern: `page.tsx` (server, fetches) → `XxxClient.tsx` (client), with `loading.tsx` skeletons per route.
- Import alias `@/*` maps to the repo root.
- TypeScript strict. Shared types in `types/index.ts` and `types/whatsapp.ts`. Validate external input with zod.
- Server-only modules start with `import 'server-only'`. Middleware runs on Edge and cannot import them.
- Member IDs are `GF`-prefixed (`formatMemberId` in `types/`).
- Code comments in this repo explain *why* (often with measured timings). Keep them when editing and match that style for non-obvious decisions.

## Database

- Supabase Postgres. Schema changes go in a new file under `supabase/migrations/` (timestamp-prefixed, e.g. `20260928150000_name.sql`). Migrations are applied manually through the Supabase SQL editor, so write them idempotently and tell the user when one needs to be run.
- `supabase-schema.sql` is the original baseline; do not treat it as current.

## Environment

Copy `.env.example` to `.env.local`. Without Upstash vars, rate limiting and caching degrade gracefully. QStash cannot reach localhost — trigger the queue drain manually in dev with the `x-cron-secret` header. Never commit `.env.local`, service-account keys, or `google-services.json`.

## Docs

`README.md` and `docs/` contain deep dives (WhatsApp, subscription, observability, deployment runbook). Some are out of date: `docs/AGENT.md` and parts of the README project tree predate the `/owner` + `/m` merge and reference removed code (`lib/geo/`, `app/reports/`, `lib/supabase/client`). When docs and code disagree, trust the code.
