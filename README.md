<p align="center">
  <img src="public/logo_landspace.png" alt="GymFlow" width="720">
</p>

<h1 align="center">GymFlow</h1>

<p align="center">
  <em>Know exactly who paid, who didn't, and who's about to expire, without notebooks.</em>
</p>

<p align="center">
  <a href="https://www.thegymflow.in">Website</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="SELF_HOSTING.md">Self-hosting</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">AGPL-3.0</a>
</p>

**GymFlow** is open-source gym management software for small, single-location gyms. It was
built for gyms in Tamil Nadu and Puducherry, India. So it is mobile-first, prices are in INR,
payments are collected by UPI QR code, and members are reached on WhatsApp.

It is a multi-tenant SaaS. One deployment serves many gyms, and each gym's data is kept apart
with Postgres Row Level Security (RLS, a database feature that limits each user to their own rows).

The hosted version runs at [thegymflow.in](https://www.thegymflow.in). This repository is the same
code.

## Who is it for?

- **Gym owners** who want to track members, payments and dues on a phone.
- **Members**, who get a digital gym card and see their attendance and rewards.
- **Developers** who want to run their own copy or contribute.

## Features

- **Owner console**: members, payments and dues, attendance kiosk, reports, bulk Excel/CSV import
- **Member app (PWA)**: digital gym card with QR, attendance, membership details, workouts, rewards
- **WhatsApp automation**: welcome messages, renewal reminders and payment-due alerts
- **Super-admin panel and mobile app**: subscriptions, support inbox, push notifications
- **Marketing site**

For the full module list, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#core-modules).

## Contents

- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Which services do I need?](#which-services-do-i-need)
- [Tech stack](#tech-stack)
- [Hosting](#hosting)
- [More documentation](#more-documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Repository layout

The repository root **is** the main Next.js app. The other folders are separate projects with
their own `package.json` and `node_modules`, deployed on their own.

| Path | What it is | Dev command | README |
|------|-----------|-------------|--------|
| `/` (root) | Owner console + member PWA (Next.js 15) | `npm run dev` → http://localhost:3004 | this file |
| `gymflow-admin/` | Super-admin panel (Next.js) | `npm run dev` → http://localhost:3001 | [gymflow-admin/README.md](gymflow-admin/README.md) |
| `gymflow-mobile/` | Admin mobile app (React Native 0.88, Android) | `npm run android` | [gymflow-mobile/README.md](gymflow-mobile/README.md) |
| `landing-page/` | Marketing site (Vite + React) | `npm run dev` | [landing-page/README.md](landing-page/README.md) |
| `infra/` | AWS hosting config for the hosted version (SST) | | [infra/README.md](infra/README.md) |
| `supabase-schema.sql` | The complete database schema as one runnable file | run once in the SQL editor | [SELF_HOSTING.md](SELF_HOSTING.md#2-set-up-the-database) |
| `supabase/migrations/` | The same schema as individual change files (history) | for existing databases | |
| `emails/` | Source HTML of the transactional email templates | published to Resend | [SELF_HOSTING.md](SELF_HOSTING.md#6-optional-email-with-resend) |
| `_archived/` | Dead code kept for reference. Not built, not imported. | | |

You only need the root app to try GymFlow. The admin panel, mobile app and marketing site are
optional. For a map of the folders inside the root app, see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#project-structure).

---

## Quick start

This runs the owner console and member app on your machine, against your own Supabase
project. It takes about 15 minutes.

**You need:** Node.js 20 or newer, npm, and a free [Supabase](https://supabase.com) project.

```bash
git clone <your-fork-url> gymflow
cd gymflow
npm install
cp .env.example .env.local
```

1. **Create the database.** In the Supabase dashboard, open the SQL editor and run the single
   file `supabase-schema.sql`. It holds the whole schema (tables, indexes, RLS, functions,
   triggers, realtime and storage) with every migration already merged in. See
   [SELF_HOSTING.md](SELF_HOSTING.md#2-set-up-the-database) for the values to set afterwards.
2. **Fill in `.env.local`.** Only the three Supabase values and the two app URLs are required
   to boot. `.env.example` marks every variable as required or optional and says what each one
   switches on.
3. **Run it.**

   ```bash
   npm run dev          # http://localhost:3004
   ```

4. **Create an account** at http://localhost:3004/auth/create-account and go through the
   onboarding wizard. Signup emails need Resend (see the table below). Without it, confirm the
   user by hand in Supabase under Authentication → Users.

Before you push a change:

```bash
npm run build          # the real typecheck; there is no CI
npm test               # vitest
npm run lint
```

---

## Which services do I need?

Only Supabase is required. Every other service switches on one feature, and the app keeps
working without it.

| Service | Needed for | Without it |
|---------|-----------|------------|
| **Supabase** (Postgres, Auth, Storage) | Everything | The app does not start |
| **Upstash Redis** | Caching and rate limiting | Both degrade gracefully: no cache, no rate limits |
| **Resend** | Signup, member activation and account-deletion emails | Those emails are not sent; confirm users by hand |
| **Meta WhatsApp Cloud API** | All WhatsApp messages | No messages are sent; the rest of the app is unaffected |
| **Upstash QStash** | The throttled WhatsApp send queue | Queued sends are not drained; trigger the drain by hand in dev |
| **Google Maps Platform** | Address autocomplete in onboarding | Type the address by hand |
| **Sentry** | Error and performance monitoring | No error reports |
| **Firebase** | Push notifications to the admin mobile app (set in `gymflow-admin`) | No push; the admin app still works |
| **Groq** | AI reply drafts in the support inbox (set in `gymflow-admin`) | No drafts; replies are written by hand |

WhatsApp needs approved message templates in your own Meta Business account. Their names
and parameters must match the code exactly. See [lib/whatsapp/README.md](lib/whatsapp/README.md).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, React Server Components) |
| **Language** | TypeScript 5 (strict mode) |
| **Styling** | Tailwind CSS 3, Sora font (Google Fonts) |
| **Backend** | Supabase (PostgreSQL 15, Auth, Row Level Security, Realtime, `pg_net`) |
| **Admin Mobile** | React Native 0.88 (bare, no Expo) + React Navigation 7 |
| **Push** | Firebase Cloud Messaging (`@react-native-firebase`) + Notifee, `firebase-admin` server-side |
| **Caching** | Upstash Redis (Serverless HTTP/REST caching) |
| **Queue** | Upstash QStash (throttled WhatsApp send queue) |
| **WhatsApp** | Meta Cloud API via reverse proxy (`graph.thegymflow.in`) |
| **Payments** | UPI QR code generation (all apps: GPay, PhonePe, Paytm, etc.) |
| **Animations** | Framer Motion, CSS keyframe animations |
| **Charts** | Recharts 3, custom Tailwind bar charts |
| **Import** | ExcelJS (dynamically imported, server-side only) |
| **PDF** | jsPDF + jspdf-autotable |
| **QR Code** | `qrcode` (server-side generation) + `jsqr` (client-side decoding) |
| **Dates** | date-fns 3 |
| **Icons** | Lucide React + custom SVG icon components |
| **Monitoring** | Sentry (error tracking), structured APM-style logging |
| **Hosting** | Any host that runs Next.js, plus Supabase Cloud (see below) |

---

## Hosting

GymFlow runs on any host that can run Next.js 15.

- **Vercel** works out of the box. `vercel.json` only sets an `ignoreCommand` that skips the
  root build when a commit does not touch the root app. It does not define crons, so schedule the
  daily jobs yourself. See [SELF_HOSTING.md](SELF_HOSTING.md#8-schedule-the-daily-jobs).
- **The hosted version** runs on AWS: SST v4 + OpenNext, CloudFront to Lambda, in `ap-south-1`.
  Its config is in `infra/sst.config.ts` and the steps are in [infra/README.md](infra/README.md).
  You do not need it to self-host.

---

## More documentation

| Document | What it covers |
|----------|----------------|
| [SELF_HOSTING.md](SELF_HOSTING.md) | Step-by-step guide to run your own deployment |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Domains, modules, WhatsApp engine, push, realtime, schema, crons |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow, checks to run, tenant-isolation rules |
| [SECURITY.md](SECURITY.md) | How to report a security problem |
| [lib/whatsapp/README.md](lib/whatsapp/README.md) | The WhatsApp automation engine |
| [lib/push/README.md](lib/push/README.md) | Member Web Push |
| [infra/README.md](infra/README.md) | AWS hosting with SST |

`CLAUDE.md` at the root is a compact, current description of the architecture and its rules
(auth, data access, caching, styling). It is written for AI coding agents, but it is also a fast
way for a person to get oriented.

---

## Contributing

Bug reports, fixes and improvements are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.
It covers the workflow, the checks to run, and the rules that keep tenants isolated.

Found a security problem? Please do not open a public issue. See [SECURITY.md](SECURITY.md).

---

## License

GymFlow is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

In short: you may use, modify and self-host it, including commercially. If you run a modified
version as a service that other people use over a network, you must make your modified source
available to those users under the same license. The [LICENSE](LICENSE) file is the
authoritative text.

"GymFlow" and the GymFlow logo are names and marks of the original project. The license covers
the code, not the brand: if you run your own service, please give it your own name and logo.

© GymFlow contributors. Built for gym owners, by fitness enthusiasts.
