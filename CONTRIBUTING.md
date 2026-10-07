# Contributing to GymFlow

Thanks for wanting to help. This page covers how to get a change in, and the handful of rules
that matter because GymFlow is multi-tenant software holding gym members' personal data.

## Before you start

- **Bugs and small fixes:** open a pull request directly.
- **Larger changes or new features:** open an issue first and describe what you want to do, so
  nobody builds something that will not be merged.
- **Security problems:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Setting up

Follow the [Quick start](README.md#quick-start) in the README. You only need the root app and a
Supabase project unless your change is in one of the other projects.

The repository holds four separate projects. Run commands from the folder of the project you
are changing; each has its own `node_modules`.

| Folder | Project |
|---|---|
| `/` | Owner console and member PWA (Next.js) |
| `gymflow-admin/` | Super-admin panel (Next.js) |
| `gymflow-mobile/` | Admin mobile app (React Native) |
| `landing-page-1/` | Marketing site (Vite + React) |

`_archived/` is dead code kept for reference. Do not import from it or add to it.

## Checks to run

There is no CI and no pre-commit hook, so these are the gate. Run them before you open a pull
request.

**Root app**

```bash
npm run build          # production build; this is the real typecheck
npm test               # vitest
npm run lint
npm run verify:tour      # only if you touched UI the onboarding tours point at
npm run verify:whatsapp  # only if you touched WhatsApp code
```

**gymflow-admin**: `npx tsc --noEmit` and `npm run build`

**gymflow-mobile**: `npx tsc --noEmit` and `npm run lint`

**landing-page-1**: `npx tsc -b`, `npm run lint` and `npm run build`

## Rules that keep tenants isolated

These are the ones a reviewer will check first.

1. **Never trust a `gym_id` from the request.** Owner API routes are wrapped in
   `withAuth(routeName, handler)` from `lib/api/withAuth.ts`, which resolves the gym from the
   session on the server.
2. **The browser never talks to Supabase.** There is no browser Supabase client. Do not add
   `NEXT_PUBLIC_SUPABASE_*` variables or `createBrowserClient`. Client components call our own
   API through `lib/api/client.ts`, or use Server Actions.
3. **`createAdminClient()` bypasses Row Level Security.** Use it only where the caller has
   already been verified and RLS cannot serve the query, and always scope by a server-resolved
   `gym_id`.
4. **New tables need RLS policies in the same migration.**
5. **Never cache access-control state** (`gyms.is_active`, subscription columns). Caching these
   caused paywall-bypass bugs in the past.
6. **Mutations must invalidate the cache keys they affect** (`lib/cache-keys.ts`).
7. **No secrets or personal data in logs.** Use `lib/logger.ts`, which redacts, not `console.log`.

`CLAUDE.md` has the full, current description of the architecture and conventions.

## Database changes

- Add a new file under `supabase/migrations/`, prefixed with a timestamp:
  `20260928150000_short_name.sql`.
- Write it so it is safe to run twice (`create table if not exists`, `add column if not exists`,
  `drop policy if exists` before `create policy`). Migrations are applied by hand.
- **Also append the same SQL to Part 2 of `supabase-schema.sql`**, under a
  `-- MIGRATION: <file name>` heading, after the last one. A fresh install runs only that file, so
  a migration missing from it means new installs silently lack your change.
- Say in the pull request that a migration needs to be run.
- Do not edit a migration that has already been merged; add a new one.

## Code style

- TypeScript strict. Validate external input with zod.
- Server Components by default; `'use client'` only where there is interactivity.
- Styling uses Tailwind with colour tokens wired to CSS variables, so dark mode works without
  `dark:` variants. Use the tokens (`bg-surface`, `border-surface-border`, …), not `bg-white`.
  Check a UI change in both light and dark.
- Comments explain *why*, not *what*. Keep the existing ones when you edit around them.
- Match the code around you: naming, structure, comment density.

## WhatsApp changes

Template names and parameters must match the templates approved in Meta exactly, and a mistake
sends wrong messages to real people. Run the tests in `__tests__/whatsapp/` after any change
and say in the pull request what you tested.

## Pull requests

- One change per pull request. Small ones get reviewed faster.
- Say what the change does, why, and how you tested it. Add screenshots for UI changes.
- Never include real member data, phone numbers, or keys in code, tests, screenshots or logs.
- Do not commit `.env.local`, `google-services.json`, service-account keys or keystores.

## License of contributions

By contributing you agree that your contribution is licensed under the
[GNU AGPL v3.0](LICENSE), the same license as the project.
