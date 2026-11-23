## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

## How I tested it

<!-- Commands run, and what you checked by hand. Screenshots for UI changes (light and dark). -->

## Checklist

- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass in the project I changed
- [ ] No secrets, real phone numbers or member data in code, tests, logs or screenshots
- [ ] Database change: new idempotent file in `supabase/migrations/`, `supabase-schema.sql` updated in place, RLS policies for new tables, and I said above that a migration must be run
- [ ] Owner API routes use `withAuth` and never trust a `gym_id` from the request
- [ ] Mutations clear the cache keys they affect
- [ ] UI changes use colour tokens (no `dark:` classes) and look right in light and dark
