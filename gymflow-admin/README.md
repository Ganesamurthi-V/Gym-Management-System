# GymFlow Admin

The super-admin panel for whoever operates a GymFlow deployment. It is a separate Next.js app
with its own login, deployed on its own (the hosted version is at `admin.gymflow.sbs`).

It is also the backend that the admin mobile app ([`../gymflow-mobile`](../gymflow-mobile))
talks to.

## What it does

- **Gyms**: list, inspect, activate and deactivate gyms.
- **Subscriptions**: review the payment screenshots owners upload and approve or reject them.
- **Support**: tickets and owner feedback.
- **Support inbox**: receives email sent to the support address (Resend inbound), threads it,
  and sends replies. Optionally drafts a reply with an LLM; a person always presses send.
- **Logs**: errors and performance data read from Sentry.
- **Push**: sends notifications to the admin mobile app through Firebase Cloud Messaging.

## Security model: read this first

This app is not like the root app.

- It uses the Supabase **service-role key** for every query, so **Row Level Security does not
  apply**. Anyone who gets in can read and change every gym's data.
- There is one shared password, `ADMIN_PANEL_SECRET`. There are no per-admin accounts. Logging
  in exchanges the password for a signed session cookie (`lib/auth.ts`); the mobile app sends
  the password as a Bearer token.

So: use a long random secret, serve it over HTTPS only, rotate the secret when someone leaves,
and ideally put another layer in front of it (IP allowlist, VPN, or your host's access
control). Do not expose it more widely than you have to.

## Run it locally

```bash
cd gymflow-admin
npm install
cp .env.example .env.local      # fill in the REQUIRED block
npm run dev                     # http://localhost:3001
```

It needs the same Supabase project as the root app, with the migrations in
`../supabase/migrations` applied. Log in with the value of `ADMIN_PANEL_SECRET`.

Checks before pushing:

```bash
npx tsc --noEmit
npm run build
```

## Environment

`.env.example` documents every variable. In short:

| Variables | Needed for | Without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything | The app does not work |
| `ADMIN_PANEL_SECRET` | Login | Login returns "Server misconfigured" |
| `UPSTASH_REDIS_REST_*` | Login rate limiting, AI token budgets | Login is not rate limited; budgets fall back to memory |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SUPPORT_EMAIL_*` | Support inbox | No inbound or outbound support email |
| `AI_*` | AI reply drafts | No drafts; write replies by hand |
| `FIREBASE_*`, `CRON_SECRET` | Push to the mobile app | No push notifications |
| `SENTRY_*` | Logs page | The logs page is empty |

## Layout

```
gymflow-admin/
├── app/
│   ├── auth/             # Login page
│   ├── dashboard/        # Overview
│   ├── gyms/             # Gym list and detail
│   ├── subscriptions/    # Payment approval
│   ├── support/          # Tickets and feedback
│   ├── logs/             # Sentry-backed logs
│   └── api/              # Route handlers, used by this app and by the mobile app
│       ├── auth/         # Login
│       ├── email/        # Support inbox: inbound webhook, threads, reply, AI draft
│       └── push/         # Device token registration and the dispatcher
├── lib/
│   ├── auth.ts               # Session cookie and Bearer check
│   ├── supabase-admin.ts     # Service-role client
│   ├── email*.ts             # Resend client, threading, inbound ingest, reply HTML
│   ├── ai-draft.ts           # Reply drafts: prompt, model chain, output clean-up
│   ├── ai-budget.ts          # Token and request budgets, so free-tier limits are never hit
│   ├── support-knowledge.ts  # The only facts the AI is allowed to state
│   └── firebase-admin.ts     # FCM sender
└── middleware.ts
```

## Support inbox

1. In Resend, verify your domain for **receiving** and create a webhook for the event
   `email.received` that posts to `https://<your-admin-host>/api/email/inbound`. Put its
   signing secret in `RESEND_WEBHOOK_SECRET`.
2. Set `SUPPORT_EMAIL_ADDRESS` to the mailbox and `SUPPORT_EMAIL_FROM_NAME` to the sender name.
3. Replies are sent as branded HTML (`lib/email-html.ts`) with a plain-text copy. Change the
   logo with `SUPPORT_EMAIL_LOGO_URL`; use a PNG, since Gmail and Outlook do not render SVG.

### AI reply drafts

Off unless `AI_API_KEY` is set. Any OpenAI-compatible endpoint works; the defaults are Groq's
free tier.

- **Drafts only.** Nothing is sent without a person pressing send.
- **It only knows `lib/support-knowledge.ts`.** That file is written for gymflow.sbs: prices,
  features, contact details. Replace it with your own facts, or the drafts will quote someone
  else's product.
- Links in a draft are removed unless their host is in `ALLOWED_HOSTS` in `lib/ai-draft.ts`.
- Customer email is passed to the model as untrusted data. Check the data terms of whichever
  provider you use before sending it real customer mail.

## Push notifications

A database trigger calls `/api/push/dispatch` through `pg_net` the moment a notification row is
created; there is no cron. After the migrations, point the database at your deployment:

```sql
update app_config set value = '<your CRON_SECRET>' where key = 'push_cron_secret';
update app_config set value = 'https://<your-admin-host>/api/push/dispatch' where key = 'push_dispatch_url';
```

The root [README](../README.md#admin-push-notifications) has the full design and a
layer-by-layer way to test it.

## Older notes

`SECURITY_FIXES_APPLIED.md` and `SECURITY_UI_AUDIT.md` record a past security review. They
describe the code at that time and are kept as history.

## License

[GNU AGPL v3.0](../LICENSE), the same as the rest of the repository.
