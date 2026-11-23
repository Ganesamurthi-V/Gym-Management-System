# Contributing to GymFlow

Thanks for wanting to help. GymFlow is multi-tenant software that holds gym members' personal data. This page explains how to get a change in and the few rules that matter most.

## Before you start

- **Bug or small fix:** open a pull request.
- **Large change or new feature:** open an issue first. Describe what you want to do, so nobody builds something that cannot be merged.
- **Security problem:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## 1. Set up locally

Follow the [Quick start](README.md#quick-start) in the README. For most changes you only need the root app and a Supabase project.

## 2. Where things live

The repo holds four separate projects. Run commands from the folder of the project you change. Each has its own `node_modules`.

| Folder | Project |
|---|---|
| `/` (root) | Owner console and member PWA (Next.js) |
| `gymflow-admin/` | Super-admin panel (Next.js) |
| `gymflow-mobile/` | Admin mobile app (React Native) |
| `landing-page/` | Marketing site (Vite + React) |

`_archived/` is old code kept for reference. Do not import from it or add to it.

## 3. Rules that matter

Reviewers check these first.

- **Never trust a `gym_id` from the request.** Owner API routes use `withAuth(routeName, handler)` from `lib/api/withAuth.ts`. It finds the gym from the session on the server.
- **The browser never talks to Supabase.** There is no browser Supabase client. Do not add `NEXT_PUBLIC_SUPABASE_*` variables or `createBrowserClient`. Client components call our API through `lib/api/client.ts`, or use Server Actions.
- **`createAdminClient()` skips Row Level Security.** Use it only when the caller is already verified and RLS cannot serve the query. Always scope by a gym id resolved on the server.
- **New tables need RLS policies** in the same migration.
- **Never cache access-control state** such as `gyms.is_active` or subscription columns.
- **Mutations must clear the cache keys they affect.** Keys are in `lib/cache-keys.ts`.
- **No secrets or personal data in logs.** Use `lib/logger.ts`, not `console.log`.
- **Dark mode uses colour tokens, not `dark:` classes.** Use `bg-surface`, `border-surface-border` and similar, not `bg-white`. Check UI changes in light and dark.
- **Icons come from `lucide-react`. No emojis in the UI.**
- **TypeScript is strict.** Check external input with zod.
- **Server Components by default.** Use `'use client'` only where you need interactivity.
- **Comments explain why, not what.** Match the style of the code around you.

WhatsApp changes: template names and parameters must match the Meta-approved templates exactly. A mistake sends wrong messages to real people. Run `__tests__/whatsapp/` and say what you tested.

## 4. Test your change

Run these before you open a pull request. There is no automatic test run, so these are the gate.

Root app:

```bash
npm test               # unit tests (vitest)
npx tsc --noEmit       # type check
npm run lint
npm run build          # production build
```

Only when relevant:

```bash
npm run verify:tour      # you changed UI that the onboarding tours point at
npm run verify:whatsapp  # you changed WhatsApp code
```

Do not run `npm run build` while `npm run dev` is running. They share the `.next` folder.

Other projects:

- `gymflow-admin`: `npx tsc --noEmit` and `npm run build`
- `gymflow-mobile`: `npx tsc --noEmit` and `npm run lint`
- `landing-page`: `npx tsc -b`, `npm run lint` and `npm run build`

## 5. Database changes

1. Add a new file in `supabase/migrations/` with a timestamp prefix, for example `20260928150000_short_name.sql`.
2. Make it safe to run twice: `create table if not exists`, `add column if not exists`, `drop policy if exists` before `create policy`, `create or replace` for functions.
3. **Also update `supabase-schema.sql`.** It is the canonical final state of the database. Edit the matching object in place, in the right section. Do not append at the end. A fresh install runs only this file, so a missing change means new installs lack it.
4. Say in your pull request that a migration must be run. Migrations are applied by hand.
5. Do not edit a migration that is already merged. Add a new one.

## 6. Commits and pull requests

- Make one change per pull request. Small ones get reviewed faster.
- Say what the change does, why, and how you tested it. Add screenshots for UI changes.
- Never include real member data, phone numbers or keys in code, tests, screenshots or logs.
- A pre-commit hook (`.husky/pre-commit`, which runs `scripts/check-secrets.js`) blocks commits that contain credential files, Google API keys or private keys. Never bypass it with `--no-verify`.
- Do not commit `.env.local`, `google-services.json`, service-account keys or keystores.

## License of contributions

By contributing, you agree that your work is licensed under the [GNU AGPL v3.0](LICENSE), the same license as the project.
