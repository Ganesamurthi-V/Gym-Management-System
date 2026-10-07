# Security policy

GymFlow stores personal data about gym members (names, phone numbers, payment records), and one
deployment serves many gyms. Reports of security problems are taken seriously and are welcome.

## Reporting a vulnerability

**Please do not open a public issue, pull request or discussion for a security problem.**

Email **support@gymflow.sbs** with the subject line `Security report`. If the repository host
offers private vulnerability reporting (GitHub: Security → Report a vulnerability), you can use
that instead.

Please include:

- what the problem is and what an attacker could do with it,
- the steps or a proof of concept to reproduce it,
- the affected part (root app, `gymflow-admin`, `gymflow-mobile`, `landing-page-1`) and commit,
- how you would like to be credited, if at all.

You can expect an acknowledgement within a few days. Please give us reasonable time to fix the
problem before you publish anything about it.

## What is in scope

- Anything that lets one gym read or change another gym's data (tenant isolation, Row Level
  Security, an API route that trusts a client-supplied `gym_id`).
- Authentication or authorization bypass, including the subscription paywall and the admin panel.
- Exposure of secrets, or of personal data in responses or logs.
- Injection, cross-site scripting, request forgery.
- Abuse of the WhatsApp Graph proxy, webhooks or cron routes.

## Testing rules

- Test against **your own deployment**, not the hosted service at `gymflow.sbs`, unless you have
  written permission.
- Do not access, change or delete data that is not yours.
- No denial-of-service testing, spam, or social engineering.

## If you run your own deployment

- Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only. It bypasses Row Level Security.
- Generate every secret separately (`openssl rand -hex 32`) and use different values for
  development and production. `ADMIN_PASSWORD` and `ADMIN_PANEL_SECRET` must differ.
- `gymflow-admin` uses the service-role key for everything. Put it behind HTTPS and, ideally, an
  extra access layer.
- If a secret is ever committed, rotate it. Removing the commit is not enough.
