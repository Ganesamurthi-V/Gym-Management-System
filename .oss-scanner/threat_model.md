# Threat model

## What this project does and where untrusted input enters
GymFlow is a multi-tenant gym management SaaS: one Next.js 15 deployment serves many independent gyms. It stores
member personal data (names, phone numbers, payments). We assume all input from the network is untrusted:
- HTTP requests to `app/api/*` (owner console, member PWA, activation flow at `/activate`), and Server Actions.
- Bulk import: Excel/CSV files parsed with ExcelJS in `lib/import/` and committed via `/api/import/confirm`.
- QR codes and UPI links parsed in `lib/upi/` and by jsQR in the browser.
- The WhatsApp Graph reverse proxy (`graph.gymflow.sbs`, allowlist in `lib/graph-domain.ts`) and inbound webhooks.
- Cron and queue routes under `app/api/cron/*` and `app/api/whatsapp/queue/*`, which must reject requests without
  `CRON_SECRET` or a valid QStash signature.

Tenant isolation is enforced by Supabase Row Level Security (every tenant table has `gym_id` and policies scoped to
`gyms.owner_id = auth.uid()`), by `withAuth` on owner routes, and by SECURITY DEFINER SQL functions that derive the
caller from `auth.uid()`. A request body that supplies a `gym_id` or member id that the server does not verify is a
bug, not a feature.

## Components that matter most / least
- Most: tenant isolation (RLS policies in `supabase-schema.sql` and `supabase/migrations/`), the auth and
  subscription paywall (`lib/dal.ts`, `middleware.ts`, `app/owner/layout`, `app/m/layout.tsx`), `withAuth`
  (`lib/api/withAuth.ts`), the WhatsApp send path (`lib/whatsapp/`), and the secrets handling in `lib/supabase/`.
- Less: the marketing site (`landing-page/`) and the bare React Native admin app (`gymflow-mobile/`), which is still
  in scope but holds no tenant data beyond what the API returns.
- `gymflow-admin/` (super-admin panel with service-role access) is in scope and high-impact: treat any bypass of its
  own JWT session as serious.

## How to exercise it
- `npm test` runs the Vitest suites in `__tests__/` (gamification, WhatsApp, security, import, reports). Those are the
  cheapest way to check business rules and the tenant-safety tests in `__tests__/security/`.
- `npm run build` compiles every route and checks the types, so the build alone surfaces many issues.
- The app itself needs live Supabase and Upstash services and is not run by the image. Test live behaviour only
  against your own deployment, never against the hosted service at `gymflow.sbs`.
- Import parsing can be exercised with crafted Excel and CSV files through `lib/import/`.

## How you rate severity
- Any cross-tenant read or write (one gym reading or changing another gym's members, payments or messages) is critical.
- Any authentication, authorization or subscription-paywall bypass, including access to `gymflow-admin`, is critical
  or high.
- Exposure of service-role keys, cron secrets, WhatsApp tokens or member personal data in responses or logs is high.
- XSS, CSRF, SQL injection, and server-side request forgery are high unless the impact is limited to the attacker's
  own gym, in which case they are medium.
- Denial of service is medium at most, since this is a shared service and we run rate limiting.
- Missing rate limits on non-sensitive read endpoints are low.

## Anything to leave alone
- `_archived/` is dead code kept for reference. Do not report findings there.
- `output/` holds promo films and tutorial video compositions, not application code.
- `graphify-out/`, `node_modules/`, and build output are generated and out of scope.
- Third-party npm dependencies are out of scope; report them upstream instead.
- Do not report the Next.js dev server or `npm run dev` behaviour, which is local-only.
