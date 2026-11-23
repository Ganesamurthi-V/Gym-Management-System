# Security policy

GymFlow stores personal data about gym members (names, phone numbers, payment records). One deployment serves many gyms. We take security reports seriously and welcome them.

## How to report a problem

**Do not open a public issue, pull request or discussion for a security problem.**

Email **support@thegymflow.in** with the subject line `Security report`. If the repository host offers private vulnerability reporting (on GitHub: Security, then Report a vulnerability), you can use that instead.

Please include:

- What the problem is and what an attacker could do with it.
- Steps or a proof of concept to reproduce it.
- The affected part (root app, `gymflow-admin`, `gymflow-mobile` or `landing-page`) and the commit.
- How you want to be credited, if at all.

## What to expect

- We will acknowledge your report within a few days.
- Please give us reasonable time to fix the problem before you publish anything about it.

## What is in scope

- One gym reading or changing another gym's data (tenant isolation, Row Level Security, an API route that trusts a `gym_id` from the client).
- Authentication or authorization bypass, including the subscription paywall and the admin panel.
- Secrets, or personal data, exposed in responses or logs.
- Injection, cross-site scripting and request forgery.
- Abuse of the WhatsApp Graph proxy, webhooks or cron routes.

## Testing rules

- Test against **your own deployment**, not the hosted service at `thegymflow.in`, unless you have written permission.
- Do not access, change or delete data that is not yours.
- No denial-of-service tests, spam or social engineering.

## If you run your own deployment

- Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only. It bypasses Row Level Security.
- Generate each secret separately (`openssl rand -hex 32`). Use different values for development and production. `ADMIN_PASSWORD` and `ADMIN_PANEL_SECRET` must differ.
- `gymflow-admin` uses the service-role key for everything. Put it behind HTTPS and, ideally, an extra access layer.
- If a secret is ever committed, rotate it. Removing the commit is not enough.
