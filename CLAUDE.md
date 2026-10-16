# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Sub-agents first: cheap models, precise briefs (mandatory)

Token cost is the main constraint in this repo. **The main session plans, briefs, reviews and verifies; sub-agents
do the reading and the writing.** Delegate through the Agent tool by default, and always pick the cheapest model that
can do the job properly.

| Task | Model |
|------|-------|
| Lookups, "where is X", grep/glob sweeps, reading files to summarise, counting, log/status checks | `haiku` |
| Code changes, new features, refactors, migrations, tests, multi-file analysis, UI work | `sonnet` |
| Deep security audits, auth/RLS/tenant-isolation design, hard architectural trade-offs | `opus`, only when needed or when the user asks |

Do it inline only when it is genuinely small: a one-file edit you already have in context, a single grep, a single
command. Anything that needs reading several files or writing more than a few lines goes to a sub-agent.

**A cheap model only does good work when the brief is complete.** Every brief must be self-contained (the agent has
none of this conversation) and include:

1. **Goal and why**, in two or three sentences, plus what "done" looks like.
2. **Exact paths** to read first and to change (use `graphify-out/GRAPH_REPORT.md` / `graph.json` to find them
   before briefing, instead of making the agent search). Name files it must NOT touch.
3. **Contracts**: function signatures, API shapes, table/column names, RPC names it must produce or consume. When
   agents run in parallel, give each a disjoint set of files and spell out the shared contract.
4. **Repo rules that apply**: copy the relevant bullets from this file (no browser Supabase client, `withAuth`,
   never trust a client `gym_id`, migration + canonical schema, theming tokens, no emojis, etc.).
5. **Verification it must run** and paste real output from: `npx tsc --noEmit`, `npm test` (or the single relevant
   test file), and `npm run build` only when no dev server is using `.next`.
6. **Report format with a word limit** (e.g. "under 400 words: files changed, what was verified with real output,
   what is unverified, any deviation and why"). Tell it to say plainly when something could not be verified.

**Always check the agent's work yourself** before reporting to the user: re-run `npx tsc --noEmit` and `npm test`,
and read the risky parts of the diff (auth, RLS, SQL, money, WhatsApp sends). If an agent's result is wrong or thin,
send it back with SendMessage (it keeps its context) rather than redoing the work in the main session.

Run independent agents in parallel (one message, several Agent calls), background long ones, and never poll them;
the completion notification arrives on its own.

### Checking UI in a real browser (agent-browser)

Type checks and unit tests do not show layout, theme or flow bugs. For UI changes, have a `haiku` (simple pages) or
`sonnet` (multi-step flows) sub-agent drive the app with the **agent-browser** CLI (skill in
`.agents/skills/agent-browser`, installed globally as `agent-browser`) and report back screenshots and findings, so
page snapshots never fill the main context. The brief must tell it to:

- Run `agent-browser skills get core` first (and `agent-browser skills get dogfood` for exploratory QA) and follow it.
- Use its own named session (`agent-browser --session <task-name> ...`), never the shared default, and
  `agent-browser close` at the end.
- Use the `agent-browser` binary directly, not `npx agent-browser`.
- Target `http://localhost:3004` (the user's dev server) unless told otherwise; never sign in with real credentials,
  submit payments, or send WhatsApp messages without the user's explicit go-ahead.
- Check phone width (360px) and desktop, light and dark theme, and save screenshots under the scratchpad, not the repo.
- Report: what was checked, pass/fail per item, screenshot paths, console errors, under a word limit.

## Working style: think, keep it small, prove it

These rules apply to every change, whoever makes it (main session or sub-agent).

- **Think before coding.** State the assumption you are making when the request is ambiguous. If two readings
  would produce different code, ask, or pick the safer one and say which. Do not silently choose an interpretation.
- **Smallest change that solves the problem.** No features nobody asked for, no configurability or abstraction for a
  single use, no error handling for cases that cannot happen. If 200 lines could be 50, rewrite it.
- **Surgical edits.** Touch only the lines the task needs. Do not reformat, rename or "tidy" nearby code, and do not
  delete pre-existing dead code unless asked. Match the surrounding style. Every changed line should trace to the
  request.
- **Say what you noticed, do not fix it.** If you spot an unrelated bug, report it in the summary instead of
  changing it.
- **Define done, then verify it.** Before starting, state how success will be checked (a test, a `tsc` run, a
  browser check, a query result). Run that check and report the real output. "It should work" is not verification.
- **Reproduce bugs before fixing them.** For a reported bug, first find or write the failing case, then fix it, then
  show that the case passes.
- **Leave no debris.** Remove temporary scripts, scratch files and debug logging you created. Keep scratch work in
  the scratchpad, never in the repo.

## What this is

GymFlow is a multi-tenant gym management SaaS for small gyms in Tamil Nadu / Puducherry, India. Users are gym owners
with limited tech experience on phones over 4G, so the UI is mobile-first and navigation latency is treated as a
feature. Currency is INR, payments are UPI, member messaging is WhatsApp, and every date rule is IST
(`Asia/Kolkata`), never the server's UTC day.

## Repository layout

The repo root **is** the main Next.js app. Sibling folders are separate projects with their own `package.json`,
deployed independently, and excluded from the root `tsconfig.json`:

| Path | What | Dev |
|------|------|-----|
| `/` (root) | Unified owner console + member PWA (Next.js 15 App Router) | `npm run dev` → :3004 |
| `gymflow-admin/` | Super-admin panel (Next.js, own JWT session, service-role DB access) | `npm run dev` → :3001 |
| `gymflow-mobile/` | Admin mobile app (bare React Native 0.75, FCM push) | `npm run android` |
| `landing-page-1/` | Marketing site www.gymflow.sbs (Vite + React, oxlint, Cloudflare Workers static assets) | `npm run dev` |
| `_archived/` | Dead code kept for reference. Do not import from it. | |
| `output/` | Promo films and tutorial videos (HTML compositions + renders). Not app code; never import from it. | |
| `graphify-out/` | Generated knowledge graph of the codebase, for navigation only. | |

Run commands from the folder of the project you are changing; each has its own `node_modules`.

Root app folders:

| Path | Holds |
|------|-------|
| `app/owner/*`, `app/m/*`, `app/auth/*`, `app/activate/*` | Pages (see "One origin, two experiences") |
| `app/api/*` | Route handlers for both experiences, crons, webhooks |
| `lib/` | Server and shared logic: `dal.ts`, `supabase/`, `api/`, `cache*.ts`, `whatsapp/`, `gamification/`, `member/`, `import/`, `upi/`, `tours/`, `hooks/`, `theme/` |
| `features/member-app/` | Owner-side Member App page, feature-folder style (components / hooks / services / utils / types) |
| `components/` | Shared UI by area (`layout`, `member`, `ui`, `inventory`, `programs`, `support`, `tours`, `upi`, `whatsapp`, …) |
| `services/whatsapp/`, `repositories/whatsapp/` | Graph API client + template specs; WhatsApp DB access |
| `types/` | Shared types (`index.ts`, `member-app.ts`, `member-db.ts`, `whatsapp.ts`) |
| `config/whatsapp.ts` | WhatsApp env config and the gamification template enable-list |
| `supabase/migrations/`, `supabase-schema.sql` | Upgrade migrations and the canonical schema (see Database) |
| `__tests__/` | Vitest suites: `gamification/`, `whatsapp/`, `security/`, `import/`, `reports/`, … |

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

There is no CI; `npm run build` and `npm test` are the gate. A husky pre-commit hook (`.husky/pre-commit` -> `scripts/check-secrets.js`) refuses commits that stage credential files (`google-services.json`, `GoogleService-Info.plist`, service-account keys) or contain a Google API key or private key; never bypass it with `--no-verify`. `npm run build` and `npm run dev`
share `.next`, so do not build while the user's dev server is running. Changes pushed to `main` deploy to Vercel
(root builds are skipped when only sibling projects or `docs/` changed — see `scripts/vercel-ignore-root.sh`).

## Architecture (root app)

### One origin, two experiences

`app.gymflow.sbs` serves both products, separated by URL namespace:

- `/owner/*` — owner console. Layout mounts `AppShell`, which is also the **subscription paywall**.
- `/m/*` — member PWA. `app/m/layout.tsx` is the **authorization boundary** (confirms a real `members` row).
- `/auth/*` — unified login; `/activate/*` — public member activation flow reached from WhatsApp links.
- `/api/*` — route handlers for both.

Role comes from the JWT claim `user_metadata.role` (`'member'`, otherwise owner) via `lib/auth/roles.ts`. It picks
which experience renders; it is **not** the security boundary — RLS and the two layouts are.

Route classification lives in `lib/protected-routes.ts` and `lib/member/redirect.ts`, shared by middleware (Edge) and
layouts (Node). Keep these files import-free. Pre-merge URLs (`/dashboard`, `/members`, `member.gymflow.sbs/...`) are
308-redirected by middleware; add new owner top-level routes to `LEGACY_OWNER_PREFIXES` only if they existed before
the merge.

`middleware.ts` also handles host isolation: `graph.gymflow.sbs` is an API-only WhatsApp Graph reverse proxy
(allowlist in `lib/graph-domain.ts`) and must never render pages; the bare `gymflow.sbs` redirects to the app host.

### Auth and data access

- **The browser never talks to Supabase.** There is no browser Supabase client. Env vars are the private
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` (read through `lib/supabase/env.ts`, which is `server-only`). Do not introduce
  `NEXT_PUBLIC_SUPABASE_*` or `createBrowserClient`.
- Client components call our own API via `lib/api/client.ts` (adds `credentials` + `X-Requested-With` for CSRF), or
  use Server Actions (`actions.ts` beside the page). A raw `fetch` to our API must send the same header.
- Server code uses `createClient()` from `lib/supabase/server.ts` (cookie session, RLS applies).
- `createAdminClient()` (`lib/supabase/admin.ts`) uses the service-role key and **bypasses RLS**. Use only where the
  caller has already been verified and RLS genuinely cannot serve the query; always scope by a server-resolved
  `gym_id`.
- Owner API routes are wrapped in `withAuth(routeName, handler)` from `lib/api/withAuth.ts`. It does CSRF, auth, rate
  limiting, and resolves `gym` server-side. Never trust a `gym_id` (or member id) from the request body. Return
  `apiSuccess` / `apiError` (`{ success, data | error: { code, message } }`). Routes used by members cannot use
  `withAuth` (it requires an owned gym); authenticate with the DAL and let RLS / the RPC scope the tenant.
- SECURITY DEFINER SQL functions must derive the caller from `auth.uid()` (owner via `gyms.owner_id`, member via
  `members.auth_user_id`) and must never accept a gym or member id to act on. `SET search_path`, grant to
  `authenticated` only.
- In Server Components use `lib/dal.ts` (`getAuthUser`, `getGym`, `getGymCore`, …). These are wrapped in React
  `cache()` so layout + page share one round trip. Member data fetchers live in `lib/member/member-data.ts`.
- Auth checks on the hot path use `getClaims()` (local JWT verification, ~1ms), not `getUser()` (network call).
  Preserve that in middleware, layouts and the DAL.
- Every tenant table has `gym_id` and RLS scoped to `gyms.owner_id = auth.uid()`. New tables need RLS policies in the
  same migration.

### Caching and freshness

- Redis (Upstash) via `lib/cache.ts`; keys are defined centrally in `lib/cache-keys.ts`. Mutations must invalidate
  the keys they affect. `lib/cache.ts` refuses large payloads on purpose (big GETs from Upstash are slower than the
  query); do not reintroduce list caches such as the old members-list cache.
- **Never cache access-control state** (`gyms.is_active`, subscription columns). Caching these caused past
  paywall-bypass bugs; `getGymCore` is deliberately uncached. Leaderboards are never cached either (they are live).
- The client Router Cache holds dynamic RSC payloads for 180s (`next.config.mjs` `staleTimes`). After a mutation,
  call `router.refresh()` / the relevant invalidation or the user sees stale data.
- A client component that copies a server prop into state (`useState(props.x)`) must resync when the prop changes
  (adjust state during render when `prop !== prevProp`), otherwise `router.refresh()` has no visible effect.
- "Realtime" hooks in `lib/hooks/` (`useGymRealtime`, `useLeaderboard`, …) are polling-based resync, not Supabase
  Realtime sockets. Poll only while the tab is visible.

### WhatsApp automation

- `lib/whatsapp/` — automation engine (scheduling, idempotency, queue, sender, gym gate, gamification nudges);
  `services/whatsapp/` — Graph API client and `templateSpec.ts`; `repositories/whatsapp/` — DB access;
  `config/whatsapp.ts` — config.
- Event sends (welcome, renewal, prize awarded) fire inline with claim-then-send. Scheduled sends go through
  `whatsapp_send_queue`, drained 5 msgs / 5 min by QStash at `/api/whatsapp/queue/drain`.
- Crons (`vercel.json`): `/api/cron/whatsapp` 03:30 UTC (09:00 IST), `/api/cron/subscription` 00:00 UTC, both
  authenticated by `CRON_SECRET`. New scheduled work becomes a step inside `runDailyWhatsAppAutomation()`; do not add
  Vercel crons.
- **Per-gym switch:** `gyms.whatsapp_enabled` (admin app → Manage Subscription → WhatsApp Enabled) stops all sends for
  that one gym. It is checked fresh, never cached, in `sendTemplate` (every send passes through it, so callers must
  set `TemplateContext.gymId` from a server-resolved gym) and the daily cron skips such gyms. A skipped send is
  recorded as `error`, not `cancelled`, so reminders resume when it is switched back on. See `lib/whatsapp/gymGate.ts`.
- Template names and parameters must match Meta-approved templates exactly. New templates are added to
  `templateSpec.ts` + the union in `types/whatsapp.ts`, documented for Meta submission (see
  `lib/whatsapp/GAMIFICATION_TEMPLATES.md`, kept in sync by a test), and stay disabled until approved
  (`ENABLED_GAMIFICATION_TEMPLATES` in `config/whatsapp.ts`). Run `__tests__/whatsapp/` after any change.

### Gamification (member engagement)

- Nothing is precomputed: XP, streaks and boards are derived from `attendance`/`memberships` by SQL functions
  (`get_member_gamification()`, `get_gym_leaderboard(p_board, p_limit)`, `get_member_events()`, …). Pure TypeScript
  mirrors of the same rules live in `lib/gamification/` (`streak`, `xp`, `periods`, `maskName`, `settings`, mappers)
  and are what the tests cover. Change the SQL and the TS together.
- Rules: IST days; morning + evening on one day count as one attended day; boards are rolling windows
  (last 7 / last 30 days, streak, all-time XP), never reset at midnight; others see masked names ("Akhil P.") and
  members can opt out (`members.show_on_leaderboard`).
- Streaks count only attended days. Until today's check-in exists the UI shows the amber `Hourglass` warning
  (`streak_pending`). There is a silent day-rollover grace (`DAY_ROLLOVER_GRACE_HOURS`); it must never be mentioned in
  any user-facing copy, template text or docs (a test checks member files).
- Per-gym settings: `gym_gamification_settings` (missing row = defaults); earned badges persist in
  `member_achievements`; owner prizes in `gamification_awards`; owner challenges in `gym_events` /
  `gym_event_completions`. Owner UI: `features/member-app/*`; member UI: `app/m/leaderboard`, `app/m/rewards`,
  `components/member/StreakBadge.tsx`. Live boards come from `GET /api/gamification/leaderboard` via `useLeaderboard`.

### Other modules

- `lib/import/` — bulk Excel/CSV import pipeline (ExcelJS, server-only, dynamically imported); the commit step is
  `/api/import/confirm`, which must call `router.refresh()` on the client afterwards.
- `lib/upi/` — UPI QR parse / link / QR generation.
- `lib/tours/` — driver.js owner onboarding tours; anchors in `lib/tours/anchors.ts` must match `data-tour`
  attributes (`npm run verify:tour`).
- Attendance kiosk: `app/owner/attendance` → `/api/attendance/check` (check in / out per session);
  `/api/attendance/undo` reverses only a recent action of the caller's gym.
- `lib/logger.ts` — structured request logger (pino) with redaction. Use it instead of `console.log` (stripped in
  production builds anyway).
- `app/sw.ts` — single Serwist service worker for both PWAs; caches static assets only, never navigations or API
  responses. Disabled in dev.
- Security headers and the CSP live in `next.config.mjs`. When adding a third-party script, image host or API, add
  that exact host to the matching directive; do not widen to `https:` or re-add `'unsafe-eval'` in production.
- Monitoring: `GET /api/health/deep` (Supabase, auth, Redis, WhatsApp queue/Meta, daily automation) requires the
  `x-health-secret` header = `HEALTH_CHECK_SECRET`; unset means 503, never public. Logic is in `lib/monitoring/`
  (pure `health.ts`, env-bound `checks.ts`). Both crons ping Better Stack heartbeats only after a successful run
  (`BETTERSTACK_HEARTBEAT_*`). Runbook: `docs/MONITORING.md`.

## Styling and theming

Tailwind 3 with `darkMode: 'class'`. Colour scales are wired to CSS variables (`app/theme.css`, `tailwind.config.js`)
so dark mode works **without** `dark:` variants. Follow the token rules instead of adding `dark:` classes:

- Card / modal / input backgrounds: `bg-surface`, `bg-surface-card`, `bg-surface-secondary`, `border-surface-border`
  — not `bg-white`.
- `white` / `black` are literal and do not flip. `text-white` is for labels on filled coloured buttons.
- Neutrals (`slate-*` etc.) and semantic tints/text (`50–200`, `600–900`) invert automatically; `300–500` stay literal
  for filled controls.
- `ink-*` / `carbon-*` — dark in both themes (scrims, QR plates, auth pages). `bg-emphasis text-emphasis-fg` —
  high-emphasis pill that inverts.
- Brand is Royal Blue `brand-500` (`#2563EB`); success `emerald`, warning `amber`, destructive `red`. Font is Sora.
- Icons are `lucide-react`. No emojis in new UI (message text sent to members may keep the approved template wording).
- Brand mark: the circular logo. Browser/PWA icons come from `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`
  and `public/favicon-*.png`; in-page logos use `/favicon-192.png` with `rounded-full`. Never put `favicon.ico` in
  both `app/` and `public/` (Next.js returns 500 for the conflict).
- Overlays that must cover the whole screen (kiosk results, sheets) are portalled to `document.body` with
  `fixed inset-0`; inside `AppShell` they would be clipped.
- Use `cn()` from `lib/utils.ts`. Check `lib/utils.ts` for date/currency/status helpers before writing new ones.

Default theme is light; dark is opt-in (`lib/theme/theme.ts`). Verify UI changes in both.

## Conventions

- Server Components by default; `'use client'` only for interactivity. Common pattern: `page.tsx` (server, fetches)
  → `XxxClient.tsx` (client), with `loading.tsx` skeletons per route.
- Import alias `@/*` maps to the repo root.
- TypeScript strict. Shared types in `types/`. Validate external input with zod (routes, server actions, settings).
- Server-only modules start with `import 'server-only'`. Middleware runs on Edge and cannot import them.
- Keep business rules in pure, framework-free functions (`lib/gamification/*`, `features/*/utils`) so they are unit
  tested; components stay thin.
- Member IDs are `GF`-prefixed (`formatMemberId` in `types/`).
- Code comments explain *why* (often with measured timings or the bug they prevent). Keep them when editing and match
  that style for non-obvious decisions.

## Database

- Supabase Postgres. Schema changes go in a new file under `supabase/migrations/` (timestamp-prefixed, e.g.
  `20260928150000_name.sql`). Migrations are applied manually through the Supabase SQL editor, so write them
  idempotently and **tell the user when one needs to be run** (and whether it must go out together with the deploy).
- `supabase-schema.sql` is the **canonical final state** of the database as one runnable file, organised by object
  type (extensions → tables → cross-table constraints → indexes → functions → triggers → views → RLS/policies →
  privileges → realtime → storage → seeds). It is not a history: a fresh install runs only this file and must not
  also run `supabase/migrations/*`, which exist solely to upgrade databases that already exist.
- **When you add a migration, also fold its end state into the matching section of `supabase-schema.sql`** — edit the
  object in place rather than appending, so the file keeps exactly one definition per object. The two must always
  describe the same end state.
- Every statement in both must be idempotent (`drop policy if exists` before `create policy`, and likewise for
  triggers; `if not exists` for tables and indexes; `create or replace` for functions and views; `drop function if
  exists` for replaced signatures). The canonical file is expected to run twice in a row with no errors.
- A migration may be written defensively (`not valid` foreign keys, `to_regclass` guards, backfills for legacy rows);
  the canonical file states the clean end result instead, and carries no backfills.
- **Tenant-check foreign keys:** member-owned tables (`memberships`, `attendance`, `due_payments`,
  `gamification_awards`, …) carry a second composite FK `(member_id, gym_id) → members(id, gym_id)` named
  `fk_<table>_member_same_gym`. Any PostgREST embed between these tables and `members` must name it
  (`member:members!fk_memberships_member_same_gym(name)`), otherwise the query fails with PGRST201.
- Always check `.error` on Supabase queries. Never fall through to `data ?? []` silently: a failed query rendering an
  empty page (0 members) is a bug that hides the real error.

## Environment

Copy `.env.example` to `.env.local`. Without Upstash vars, rate limiting and caching degrade gracefully. QStash cannot
reach localhost — trigger the queue drain manually in dev with the `x-cron-secret` header. Never commit `.env.local`,
service-account keys, or `google-services.json`.

## Docs

`README.md` and `SELF_HOSTING.md` are the contributor-facing docs; `lib/whatsapp/README.md` covers the WhatsApp engine;
`lib/whatsapp/GAMIFICATION_TEMPLATES.md` holds the WhatsApp template copy for Meta. Where docs and code disagree,
trust the code.
