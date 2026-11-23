# GymFlow Admin

The super-admin panel for whoever runs a GymFlow deployment. It is a separate Next.js app with its
own login. It is also the backend for the admin mobile app ([`../gymflow-mobile`](../gymflow-mobile)).

The hosted version runs at `admin.thegymflow.in`.

## What it does

- **Gyms**: list, inspect, activate and deactivate gyms.
- **Subscriptions**: review the payment screenshots owners upload, then approve or reject them.
- **Support**: tickets and owner feedback.
- **Support inbox**: receives email sent to your support address (Resend inbound), threads it, and
  sends replies. It can draft a reply with an LLM, but a person always presses send.
- **Announcements**: one site-wide announcement shown to owners.
- **Errors and Logs**: errors and performance data read from Sentry.
- **AWS Monitor**: read-only CloudWatch, inventory, cost and budget views for the AWS deployment.
- **Push**: sends notifications to the admin mobile app through Firebase Cloud Messaging (FCM).

## Security model: read this first

This app is not like the root app.

- It uses the Supabase **service-role key** for every query. **Row Level Security does not apply.**
  Anyone who gets in can read and change every gym's data.
- There is one shared password, `ADMIN_PANEL_SECRET`. There are no per-admin accounts.
- Logging in exchanges the password for a signed token (`lib/auth.ts`):
  - The web app gets a session cookie that lasts 8 hours.
  - The mobile app gets a token that lasts 30 days, sent as a Bearer token. The raw password is
    never accepted as a Bearer token.
- Changing `ADMIN_SESSION_VERSION` logs out every browser and phone at once.

So:

- Use a long random secret and serve the panel over HTTPS only.
- Rotate the secret when someone leaves.
- Put another layer in front if you can (IP allowlist, VPN, or your host's access control).
- Do not expose it more widely than you have to.

## What you need

- Node.js and npm.
- The same Supabase project as the root app, with the migrations in
  [`../supabase/migrations`](../supabase/migrations) applied.
- The Supabase service-role key.

## Run it locally

```bash
cd gymflow-admin
npm install
cp .env.example .env.local      # fill in the required block
npm run dev                     # http://localhost:3001
```

Log in with the value of `ADMIN_PANEL_SECRET`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3001 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build on port 3001 |
| `npm run lint` | `next lint` |
| `npm test` | Vitest |

Before you push, run `npx tsc --noEmit`, `npm test` and `npm run build`.

## Environment variables

[`.env.example`](.env.example) lists every variable. Only the first two rows are required.

| Variables | Needed for | Without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything | The app does not work |
| `ADMIN_PANEL_SECRET` | Login | Login returns "Server misconfigured" |
| `ADMIN_JWT_SECRET` | Signing session tokens | A key is derived from `ADMIN_PANEL_SECRET` and a warning is logged. Set it. |
| `ADMIN_SESSION_VERSION` | Logging everyone out (bump the number) | Defaults to `1` |
| `NEXT_PUBLIC_ADMIN_URL` | The panel's own URL | Not needed on localhost |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Login rate limiting, AI token budgets | Login is not rate limited; budgets are kept in memory |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SUPPORT_EMAIL_*` | Support inbox | No inbound or outbound support email |
| `AI_*` | AI reply drafts | No drafts; write replies by hand |
| `FIREBASE_*`, `CRON_SECRET` | Push to the mobile app | No push notifications |
| `SENTRY_*` | Errors and Logs pages | The pages are empty |

Notes:

- `ADMIN_PANEL_SECRET` must be different from `ADMIN_PASSWORD` in the root app.
- If Redis is configured but fails, login is blocked on purpose (it fails closed).
- Never commit `.env.local`.

## Deploying

The hosted panel runs on AWS, deployed with SST as its own app, separate from the root app. The
config is [`../infra/sst.admin.config.ts`](../infra/sst.admin.config.ts). Secrets are set with
`sst secret set`, and the plain values are read from your shell. The exact steps (certificate, secrets,
DNS cutover) are in the "Admin panel" section of [`../infra/README.md`](../infra/README.md).

The folder also keeps a `vercel.json` for anyone who prefers to host on Vercel. It is not the
production host.

Any host that runs a Node.js Next.js app can also work: run `npm run build`, then `npm run start`
with the same environment variables.

## Layout

```
gymflow-admin/
├── app/
│   ├── auth/             # Login page
│   ├── dashboard/        # Overview
│   ├── gyms/             # Gym list and detail
│   ├── subscriptions/    # Payment approval
│   ├── support/          # Tickets and feedback
│   ├── announcements/    # Announcements
│   ├── errors/, logs/    # Sentry-backed pages
│   ├── aws/              # AWS Monitor
│   └── api/              # Route handlers, used by this app and by the mobile app
│       ├── auth/         # Login
│       ├── email/        # Support inbox: inbound webhook, threads, compose, AI draft
│       └── push/         # Device token registration and the dispatcher
├── lib/
│   ├── auth.ts               # Session cookie and Bearer check
│   ├── supabase-admin.ts     # Service-role client
│   ├── email*.ts             # Resend client, threading, inbound ingest, reply HTML
│   ├── ai-draft.ts           # Reply drafts: prompt, model chain, output clean-up
│   ├── ai-budget.ts          # Token and request budgets, so free-tier limits are never hit
│   ├── support-knowledge.ts  # The only facts the AI is allowed to state
│   └── firebase-admin.ts     # FCM sender
└── proxy.ts                  # Request check: session or Bearer token, plus request IDs
```

## Support inbox setup

1. In Resend, verify your domain for **receiving**. Create a webhook for the event
   `email.received` that posts to `https://<your-admin-host>/api/email/inbound`.
2. Put the webhook's signing secret in `RESEND_WEBHOOK_SECRET`.
3. Set `SUPPORT_EMAIL_ADDRESS` to the mailbox and `SUPPORT_EMAIL_FROM_NAME` to the sender name.
4. Optional: set `SUPPORT_EMAIL_LOGO_URL` to change the logo in reply emails. Use a PNG or JPG,
   because Gmail and Outlook do not render SVG.

Replies are sent as branded HTML (`lib/email-html.ts`) with a plain-text copy.

### AI reply drafts

Drafts are off unless `AI_API_KEY` is set. Any OpenAI-compatible endpoint works. The defaults in
`.env.example` point at Groq's free tier.

- **Drafts only.** Nothing is sent until a person presses send.
- **The model only knows `lib/support-knowledge.ts`.** That file is written for thegymflow.in
  (prices, features, contact details). Replace it with your own facts, or the drafts will quote
  someone else's product.
- Links in a draft are removed unless their host is in `ALLOWED_HOSTS` in `lib/ai-draft.ts`.
  Edit that list for your own domains.
- Customer email is passed to the model as untrusted data. Check the data terms of your provider
  before you send it real customer mail.

## Push notifications

A database trigger calls `/api/push/dispatch` through `pg_net` as soon as a notification row is
created. There is no cron. After the migrations are applied, point the database at your
deployment:

```sql
update app_config set value = '<your CRON_SECRET>' where key = 'push_cron_secret';
update app_config set value = 'https://<your-admin-host>/api/push/dispatch' where key = 'push_dispatch_url';
```

[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#admin-push-notifications) has the full design and a layer-by-layer
way to test it.

## Troubleshooting

| Problem | Likely cause |
|---|---|
| Login says "Server misconfigured" | `ADMIN_PANEL_SECRET` is not set |
| Login says "Too many attempts" | 10 failed logins from one IP in 15 minutes; wait, or clear the Redis key |
| Login says "Login temporarily unavailable" | Redis is configured but not reachable |
| Everyone was logged out | `ADMIN_SESSION_VERSION` or `ADMIN_JWT_SECRET` changed |
| No push notifications | `FIREBASE_*` or `CRON_SECRET` missing, or the two `app_config` rows above are not set |
| Support inbox receives nothing | The Resend webhook URL or `RESEND_WEBHOOK_SECRET` is wrong |
| Errors and Logs pages are empty | `SENTRY_*` is not set |

## Older notes

[`SECURITY_FIXES_APPLIED.md`](SECURITY_FIXES_APPLIED.md) and
[`SECURITY_UI_AUDIT.md`](SECURITY_UI_AUDIT.md) record a past security review. They describe the
code at that time and are kept as history.

## License

[GNU AGPL v3.0](../LICENSE), the same as the rest of the repository.
