## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

## How I tested it

<!-- Commands run, and what you checked by hand. Screenshots for UI changes (light and dark). -->

## Checklist

- [ ] `npm run build` and `npm test` pass in the project I changed
- [ ] No secrets, real phone numbers or member data in code, tests, logs or screenshots
- [ ] New tables have RLS policies in the same migration, and I said above that a migration must be run
- [ ] Owner API routes use `withAuth` and never trust a `gym_id` from the request
- [ ] Mutations invalidate the cache keys they affect
