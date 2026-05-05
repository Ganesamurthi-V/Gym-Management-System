# GymFlow — Gym Management SaaS MVP

> Know exactly who paid, who didn't, and who's about to expire — without using notebooks.

## Project Structure

```
gymflow/
├── app/
│   ├── auth/login/page.tsx          # Login page
│   ├── dashboard/
│   │   ├── layout.tsx               # Protected layout
│   │   ├── page.tsx                 # Dashboard (server)
│   │   └── DashboardClient.tsx      # Dashboard UI
│   ├── members/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Members list (server)
│   │   ├── MembersClient.tsx        # Members UI
│   │   ├── new/page.tsx             # Add member
│   │   └── [id]/
│   │       ├── page.tsx             # Member detail (server)
│   │       └── MemberDetailClient.tsx
│   ├── payments/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Payments (server)
│   │   └── PaymentsClient.tsx
│   ├── attendance/
│   │   ├── page.tsx                 # Attendance (server)
│   │   └── AttendanceClient.tsx
│   ├── reports/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Reports (server)
│   │   └── ReportsClient.tsx
│   ├── import/
│   │   ├── layout.tsx
│   │   └── page.tsx                 # CSV import (client)
│   ├── layout.tsx                   # Root layout
│   ├── page.tsx                     # Root redirect
│   └── globals.css
├── components/
│   └── layout/
│       └── BottomNav.tsx            # Bottom navigation
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # Browser client
│   │   └── server.ts                # Server client
│   └── utils.ts                     # Helpers
├── types/index.ts                   # TypeScript types
├── middleware.ts                    # Auth middleware
├── supabase-schema.sql              # Database setup
└── .env.example
```

---

## Setup Instructions

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to India (Mumbai/Singapore)
3. Wait for project to be ready (~2 min)

### Step 2: Run Database Schema

1. In Supabase dashboard → **SQL Editor**
2. Paste entire content of `supabase-schema.sql`
3. Click **Run**

### Step 3: Create First User (Gym Owner)

1. Supabase dashboard → **Authentication** → **Users** → **Add user**
2. Enter email and password for the gym owner
3. Copy the user's UUID
4. In SQL Editor, run:

```sql
INSERT INTO gyms (name, owner_id)
VALUES ('Your Gym Name', 'paste-user-uuid-here');
```

### Step 4: Local Development

```bash
# Clone or copy this project
cd gymflow

# Install dependencies
npm install

# Create .env.local from example
cp .env.example .env.local

# Fill in your Supabase credentials
# NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Run dev server
npm run dev
```

Open http://localhost:3000 — you'll be redirected to login.

### Step 5: Get Supabase Credentials

In Supabase dashboard → **Settings** → **API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Deployment to Vercel

### Option A: Vercel CLI

```bash
npm install -g vercel
vercel
# Follow prompts
# Add environment variables when asked
```

### Option B: Vercel Dashboard

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repo
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy

### After Deployment

In Supabase dashboard → **Authentication** → **URL Configuration**:
- Add your Vercel URL to **Site URL**: `https://your-app.vercel.app`
- Add to **Redirect URLs**: `https://your-app.vercel.app/**`

---

## Adding More Gyms / Users

For each new gym owner:
1. Create user in Supabase Auth
2. Run SQL to create their gym:

```sql
INSERT INTO gyms (name, owner_id)
VALUES ('Gym Name', 'user-uuid');
```

Data is completely isolated — each gym owner only sees their own data via RLS policies.

---

## CSV Import Format

The import accepts `.csv` or `.xlsx` files with these columns (headers are case-insensitive):

| Column | Required | Values |
|--------|----------|--------|
| name | Yes | Text |
| phone | Yes | 10-digit number |
| plan | No | monthly / quarterly / annual |
| start_date | No | YYYY-MM-DD |
| amount | No | Number |
| payment_mode | No | cash / upi / card |

---

## WhatsApp Reminder

No API needed. Clicking "Remind" opens WhatsApp with a pre-filled message:

```
Hi [Name]! 🏋️ Your gym membership expires on [Date]. 
Please renew to continue your fitness journey. Contact us to renew.
```

Works on mobile and desktop. Free, no monthly costs.

---

## Features

| Feature | Status |
|---------|--------|
| Email/password login | ✅ |
| Dashboard with live stats | ✅ |
| Add/edit/delete members | ✅ |
| Membership plans (1/3/12 months) | ✅ |
| Auto expiry calculation | ✅ |
| Color-coded member status | ✅ |
| Payment recording | ✅ |
| Payment history | ✅ |
| One-tap attendance marking | ✅ |
| Duplicate attendance prevention | ✅ |
| WhatsApp reminders (no API) | ✅ |
| CSV/Excel bulk import | ✅ |
| Monthly revenue reports | ✅ |
| Mobile-first responsive UI | ✅ |
| Multi-gym isolation (RLS) | ✅ |

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Deployment**: Vercel + Supabase Cloud
- **Cost**: Free tier on both Vercel and Supabase for MVP
