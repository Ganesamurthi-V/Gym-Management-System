# GymFlow — Subscription & 14-Day Trial: Codebase-Mapped Implementation Spec

**Version:** 1.0  
**Stack:** Next.js 15 (App Router) · Supabase (Postgres + RLS + RPCs) · Upstash Redis · QStash · Vercel Cron  
**Codebase root:** `Gym-Management-System-main/`

---

## 1. Mental Model & Fit with Existing Architecture

### How the current codebase works (relevant to this feature)

| Layer | Current pattern | Where subscription hooks in |
|---|---|---|
| **Auth / gym lookup** | `lib/dal.ts` — `getAuthUser()` + `getGym()` cached with `cacheWrapper()` (Redis 120s TTL) | `getGym()` must return subscription fields; cache must be invalidated on status change |
| **Active-status check** | `check_gym_active` Postgres RPC → `getGymActiveStatus()` in DAL → polled every 60s in `ShellGuard` | Replace / extend this RPC to also check `subscription_status` |
| **Layout guard** | `AppShell` (Server Component) → `ShellGuard` (Client Component) | Banner component injected inside `ShellGuard` between `<header>` and `<main>` |
| **Middleware** | `middleware.ts` — auth-only check, no subscription awareness | Add subscription redirect to `/subscription` for `expired` accounts |
| **Admin** | `app/admin/` — service-role Supabase client, ADMIN_PASSWORD auth | Add `subscription_requests` management page here |
| **Cron** | `app/api/cron/whatsapp/route.ts` — `x-cron-secret` / Bearer auth, Vercel cron | Add new `/api/cron/subscription/route.ts` using the same pattern |
| **Onboarding** | `/api/onboarding/complete` inserts/updates `gyms` row | Must also stamp trial fields on first insert |
| **Sign-up** | `app/auth/create-account/page.tsx` — `supabase.auth.signUp()` → redirect `/onboarding` | Trial starts at onboarding completion, not sign-up (gym row created there) |

### Subscription status state machine

```
[signup] ──onboarding complete──► trial ──trial_ends_at expires──► expired
                                    │                                  │
                                    └──admin approves request──► active ◄──┘
                                                                    │
                                                          subscription_ends_at
                                                          expires (future)
```

---

## 2. Database Migration

### 2.1 Alter `gyms` table

```sql
-- Migration: add_subscription_fields_to_gyms
ALTER TABLE gyms
  ADD COLUMN trial_started_at      timestamptz,
  ADD COLUMN trial_ends_at         timestamptz,
  ADD COLUMN subscription_status   text NOT NULL DEFAULT 'trial'
                                   CHECK (subscription_status IN ('trial', 'active', 'expired')),
  ADD COLUMN plan_type             text NOT NULL DEFAULT 'trial'
                                   CHECK (plan_type IN ('trial', 'monthly', 'yearly', 'lifetime')),
  ADD COLUMN subscription_started_at timestamptz,
  ADD COLUMN subscription_ends_at    timestamptz;

-- Backfill existing gyms as active (they were already using the product)
UPDATE gyms
SET subscription_status = 'active',
    plan_type            = 'monthly',
    subscription_started_at = created_at
WHERE subscription_status = 'trial';

CREATE INDEX idx_gyms_subscription_status ON gyms(subscription_status);
CREATE INDEX idx_gyms_trial_ends_at ON gyms(trial_ends_at) WHERE subscription_status = 'trial';
```

### 2.2 Create `subscription_requests` table

```sql
CREATE TABLE subscription_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id           uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  uploaded_file_url text NOT NULL,
  transaction_id   text,
  notes            text,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      text  -- admin identifier (email or token-based label)
);

CREATE INDEX idx_sub_requests_gym_id ON subscription_requests(gym_id);
CREATE INDEX idx_sub_requests_status ON subscription_requests(status);
```

### 2.3 Supabase Storage bucket

```sql
-- Create a private bucket for payment proof uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false);

-- RLS: gym owners can insert into their own folder only
CREATE POLICY "gym owner upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: gym owners can read their own uploads
CREATE POLICY "gym owner read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin service role bypasses RLS — no policy needed for admin reads
```

### 2.4 Update `check_gym_active` RPC

The existing RPC is used by `ShellGuard` and `getGymActiveStatus()` in the DAL. Extend it:

```sql
-- Replace existing check_gym_active to also enforce subscription
CREATE OR REPLACE FUNCTION check_gym_active(p_email text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN g.is_active = false THEN false
      WHEN g.subscription_status = 'expired' THEN false
      ELSE true
    END
  FROM auth.users u
  JOIN gyms g ON g.owner_id = u.id
  WHERE u.email = p_email
  LIMIT 1;
$$;
```

> **Important:** The ShellGuard already polls this RPC every 60 seconds and redirects to `/auth/login?error=blocked` on `false`. For expired accounts we want to redirect to `/subscription` instead. See Section 5.

---

## 3. Trial Initialization — Onboarding Completion

**File:** `app/api/onboarding/complete/route.ts`

This is where the `gyms` row is first **inserted** (new gym) or **updated** (returning to onboarding). The trial clock starts here.

```ts
// In the INSERT branch (new gym):
const TRIAL_DURATION_DAYS = parseInt(process.env.TRIAL_DURATION_DAYS ?? '14', 10)
const now = new Date()
const trialEndsAt = new Date(now)
trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS)

const { data: newGym, error: insertError } = await supabase
  .from('gyms')
  .insert({
    name: gymName.trim(),
    owner_id: user.id,
    onboarding_completed: true,
    onboarding_data: onboardingData,
    // --- NEW ---
    subscription_status: 'trial',
    plan_type: 'trial',
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEndsAt.toISOString(),
  })
  .select('id')
  .single()
```

Add `TRIAL_DURATION_DAYS=14` to `.env.example` and `.env.local`.

---

## 4. DAL Changes — `lib/dal.ts`

The `getGym()` function currently selects:
```ts
.select('id, name, onboarding_completed, owner_id, created_at, onboarding_data')
```

Extend this to include subscription fields (needed by AppShell, banner, and middleware):

```ts
.select(`
  id, name, onboarding_completed, owner_id, created_at, onboarding_data,
  subscription_status, plan_type,
  trial_started_at, trial_ends_at,
  subscription_started_at, subscription_ends_at
`)
```

> **Cache invalidation rule:** Any code path that writes subscription fields to `gyms` **must** call `deleteCache(\`user:${userId}:gym\`)` after the write. This applies to: trial expiration cron, admin approve/reject, and the subscription request submission endpoint.

Add a new helper to the DAL for computing trial status in one place:

```ts
// lib/dal.ts
export function getSubscriptionState(gym: GymRow) {
  if (!gym) return { status: 'unknown', daysLeft: 0, isExpired: true }

  const now = Date.now()

  if (gym.subscription_status === 'active') {
    return { status: 'active', daysLeft: null, isExpired: false }
  }

  if (gym.subscription_status === 'trial') {
    const endsAt = gym.trial_ends_at ? new Date(gym.trial_ends_at).getTime() : 0
    const msLeft = endsAt - now
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
    return {
      status: daysLeft <= 0 ? 'expired' : 'trial',
      daysLeft: Math.max(0, daysLeft),
      isExpired: daysLeft <= 0,
    }
  }

  return { status: 'expired', daysLeft: 0, isExpired: true }
}
```

---

## 5. Middleware — `middleware.ts`

Current `PROTECTED_PREFIXES` list already covers all routes that must be blocked for expired accounts. Extend the middleware to redirect expired users to `/subscription`:

```ts
// middleware.ts — add after the existing user check

// Subscription guard — runs only for authenticated users on protected routes
if (user && PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) {
  // Fetch subscription status from gyms table
  // Use service role to avoid RLS issues in middleware
  const { data: gym } = await supabase
    .from('gyms')
    .select('subscription_status, trial_ends_at')
    .eq('owner_id', user.id)
    .single()

  const isExpired =
    gym?.subscription_status === 'expired' ||
    (gym?.subscription_status === 'trial' &&
      gym?.trial_ends_at &&
      new Date(gym.trial_ends_at) < new Date())

  if (isExpired && pathname !== '/subscription') {
    const url = request.nextUrl.clone()
    url.pathname = '/subscription'
    return NextResponse.redirect(url)
  }
}
```

> **Note:** Add `/subscription` to `PROTECTED_PREFIXES` so unauthenticated users still get redirected to login. Also add it to `SHELL_EXCLUDED` in `ShellGuard.tsx` if you want the subscription page to render without the sidebar.

---

## 6. Email / Password Change Restriction During Trial

**File:** `app/account/actions.ts` (Server Actions for account settings)  
**File:** `app/account/AccountClient.tsx` (UI)

In each Server Action that handles email or password changes, add a guard:

```ts
// In the relevant Server Action
const { gym } = await getGym(user.id)
if (gym?.subscription_status === 'trial') {
  return {
    error: 'Email and password cannot be changed during the trial period.',
    code: 'TRIAL_RESTRICTION',
  }
}
```

On the frontend in `AccountClient.tsx`, visually disable the email/password fields and show a tooltip when `subscription_status === 'trial'`.

---

## 7. Trial Banner Component

**New file:** `components/layout/TrialBanner.tsx`

```tsx
// components/layout/TrialBanner.tsx
'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

interface TrialBannerProps {
  daysLeft: number
}

export default function TrialBanner({ daysLeft }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const urgency =
    daysLeft <= 0  ? 'red'    :
    daysLeft <= 3  ? 'red'    :
    daysLeft <= 7  ? 'yellow' : 'blue'

  const message =
    daysLeft <= 0 ? 'Your free trial has expired.' :
    daysLeft === 1 ? 'Your trial expires today.' :
    `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial.`

  const colours = {
    blue:   'bg-blue-50 border-blue-200 text-blue-800',
    yellow: 'bg-amber-50 border-amber-200 text-amber-800',
    red:    'bg-red-50 border-red-200 text-red-800',
  }

  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b text-sm font-medium ${colours[urgency]}`}>
      <span>
        {message}{' '}
        <Link href="/subscription" className="underline font-bold">Renew now →</Link>
      </span>
      <button onClick={() => setDismissed(true)} className="ml-4 opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
```

**Inject into `ShellGuard.tsx`** — between the sticky `<header>` and `<main>`:

```tsx
// In ShellGuard — pass new props
interface ShellGuardProps {
  // ... existing props
  initialSubscriptionStatus: string
  initialTrialDaysLeft: number
}

// In the JSX, after <header>:
{initialSubscriptionStatus === 'trial' && initialTrialDaysLeft >= 0 && (
  <TrialBanner daysLeft={initialTrialDaysLeft} />
)}
```

**Update `AppShell.tsx`** to compute and pass these props:

```ts
// lib/dal.ts getSubscriptionState() helper (Section 4) is called here
const subState = getSubscriptionState(gym)

return (
  <ShellGuard
    // ... existing props
    initialSubscriptionStatus={subState.status}
    initialTrialDaysLeft={subState.daysLeft ?? 0}
  >
    {children}
  </ShellGuard>
)
```

---

## 8. Subscription / Renewal Page

**New files:**
- `app/subscription/page.tsx` (Server Component — fetches gym + pending request status)
- `app/subscription/SubscriptionClient.tsx` (Client Component — upload form, UPI display)

### UPI settings source

UPI details (QR code URL, UPI ID, business name, monthly price, yearly price) must be configurable. Store them in the existing `admin_messages` / settings pattern, or add a `gym_settings` / `platform_settings` table. Simplest approach: a new `platform_settings` table with a single row.

```sql
CREATE TABLE platform_settings (
  id           int PRIMARY KEY DEFAULT 1,  -- enforces single row
  upi_id       text NOT NULL DEFAULT '',
  upi_name     text NOT NULL DEFAULT 'GymFlow',
  qr_code_url  text NOT NULL DEFAULT '',
  price_monthly  int NOT NULL DEFAULT 999,
  price_yearly   int NOT NULL DEFAULT 9999,
  CHECK (id = 1)
);

INSERT INTO platform_settings DEFAULT VALUES;
```

### Subscription page structure

```tsx
// app/subscription/page.tsx
import { getAuthUser, getGym } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import SubscriptionClient from './SubscriptionClient'
import { redirect } from 'next/navigation'

export default async function SubscriptionPage() {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { gym } = await getGym(user.id)

  // Check for pending request
  const { data: pendingRequest } = await supabase
    .from('subscription_requests')
    .select('id, status, submitted_at, rejection_reason')
    .eq('gym_id', gym?.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  // Platform settings (UPI details, prices)
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('*')
    .single()

  return (
    <SubscriptionClient
      gym={gym}
      latestRequest={pendingRequest}
      settings={settings}
    />
  )
}
```

The `SubscriptionClient` renders:
1. **Status header** — "Trial Expired" or "Renewal Pending"
2. **Payment section** — QR code image, UPI ID with copy button, prices (from `platform_settings`)
3. **Upload form** — file input (jpg/jpeg/png/pdf, max 10 MB), transaction ID, notes, submit button
4. **Pending state** — if `pendingRequest.status === 'pending'`, show "Pending Verification" and disable the form

### Upload API endpoint

**New file:** `app/api/subscription/request/route.ts`

```ts
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gym = await getGymForUser(supabase, user.id)
  if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

  // Block if already pending
  const { data: existing } = await supabase
    .from('subscription_requests')
    .select('id, status')
    .eq('gym_id', gym.id)
    .eq('status', 'pending')
    .single()

  if (existing) {
    return NextResponse.json({ error: 'A request is already pending.' }, { status: 409 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File
  const transactionId = formData.get('transaction_id') as string | null
  const notes = formData.get('notes') as string | null

  // Validate file
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
  const maxSize = 10 * 1024 * 1024 // 10 MB
  if (!file || !allowedTypes.includes(file.type) || file.size > maxSize) {
    return NextResponse.json({ error: 'Invalid file.' }, { status: 400 })
  }

  // Upload to Supabase Storage
  const fileName = `${user.id}/${Date.now()}-${file.name}`
  const { data: upload, error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(fileName, file, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage
    .from('payment-proofs')
    .getPublicUrl(upload.path)  // will be private; use signed URLs in admin

  // Insert request
  const { error: insertError } = await supabase
    .from('subscription_requests')
    .insert({
      gym_id: gym.id,
      uploaded_file_url: upload.path, // store path, not public URL (private bucket)
      transaction_id: transactionId || null,
      notes: notes || null,
    })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
```

---

## 9. Daily Expiration Cron

**New file:** `app/api/cron/subscription/route.ts`

Follows the exact same security pattern as `app/api/cron/whatsapp/route.ts`:

```ts
/**
 * POST /api/cron/subscription
 *
 * Daily cron: marks expired trials as expired.
 * Security: x-cron-secret or Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') ?? ''
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!cronSecret || (bearer !== cronSecret && cronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('gyms')
    .update({ subscription_status: 'expired' })
    .eq('subscription_status', 'trial')
    .lt('trial_ends_at', new Date().toISOString())
    .select('id, owner_id')

  if (error) {
    console.error('[Cron/Sub] Failed to expire trials:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Invalidate Redis cache for each affected gym owner
  // Import deleteCache from lib/cache
  const { deleteCache } = await import('@/lib/cache')
  for (const gym of data ?? []) {
    await deleteCache(`user:${gym.owner_id}:gym`)
    // Also invalidate active_status cache keyed by email
    // Requires a lookup — or store owner email on the gym row / use a different cache key strategy
  }

  console.log(`[Cron/Sub] Expired ${data?.length ?? 0} trial(s)`)
  return NextResponse.json({ expired: data?.length ?? 0 })
}
```

**Register in `vercel.json`:**

```json
{
  "crons": [
    { "path": "/api/cron/whatsapp",     "schedule": "0 6 * * *" },
    { "path": "/api/cron/subscription", "schedule": "0 0 * * *" }
  ]
}
```

---

## 10. Admin — Subscription Requests Page

**New files:**
- `app/admin/subscriptions/page.tsx`
- `app/api/admin/subscription-requests/[id]/route.ts` (approve/reject)

The admin panel uses `createAdminClient()` (service role) and `ADMIN_PASSWORD` auth (matching existing pattern in `app/api/gyms/route.ts`).

### Admin list page

```tsx
// app/admin/subscriptions/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSubscriptionList from './AdminSubscriptionList' // client component

export const revalidate = 0

export default async function AdminSubscriptionsPage() {
  const supabase = createAdminClient()

  const { data: requests } = await supabase
    .from('subscription_requests')
    .select(`
      id, status, submitted_at, reviewed_at,
      transaction_id, notes, rejection_reason, uploaded_file_url,
      gyms ( id, name, owner_id )
    `)
    .order('submitted_at', { ascending: false })

  return <AdminSubscriptionList requests={requests ?? []} />
}
```

### Approve/Reject API

**File:** `app/api/admin/subscription-requests/[id]/route.ts`

> ⚠️ **Do not hand-roll the admin token check.** An earlier version of this doc
> showed `if (token !== process.env.ADMIN_PASSWORD)`. That pattern grants access
> when `ADMIN_PASSWORD` is unset AND no header is sent, because
> `undefined !== undefined` is `false`. Always use `requireAdmin()` from
> `lib/api/adminAuth.ts`, which fails closed, compares in constant time, and
> rate-limits per IP. See `__tests__/security/adminAuth.test.ts`.

```ts
import { requireAdmin, adminServerError } from '@/lib/api/adminAuth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, 'POST /api/admin/subscription-requests/[id]')
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { action, plan_type, rejection_reason } = body
  // action: 'approve' | 'reject'

  const supabase = createAdminClient()

  const { data: request } = await supabase
    .from('subscription_requests')
    .select('gym_id')
    .eq('id', params.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'approve') {
    const now = new Date()
    const endsAt = new Date(now)
    // plan_type determines duration
    if (plan_type === 'monthly')  endsAt.setMonth(endsAt.getMonth() + 1)
    if (plan_type === 'yearly')   endsAt.setFullYear(endsAt.getFullYear() + 1)
    if (plan_type === 'lifetime') endsAt.setFullYear(endsAt.getFullYear() + 99)

    await supabase.from('gyms').update({
      subscription_status: 'active',
      plan_type,
      subscription_started_at: now.toISOString(),
      subscription_ends_at: plan_type === 'lifetime' ? null : endsAt.toISOString(),
    }).eq('id', request.gym_id)

    await supabase.from('subscription_requests').update({
      status: 'approved',
      reviewed_at: now.toISOString(),
      reviewed_by: 'admin',
    }).eq('id', params.id)
  }

  if (action === 'reject') {
    await supabase.from('subscription_requests').update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejection_reason ?? '',
      reviewed_by: 'admin',
    }).eq('id', params.id)
  }

  // Invalidate Redis cache for the gym owner
  const { data: gym } = await supabase
    .from('gyms')
    .select('owner_id')
    .eq('id', request.gym_id)
    .single()

  if (gym?.owner_id) {
    const { deleteCache } = await import('@/lib/cache')
    await deleteCache(`user:${gym.owner_id}:gym`)
  }

  return NextResponse.json({ success: true })
}
```

---

## 11. API Protection — Subscription Middleware

All protected API routes must verify subscription status server-side. Create a shared guard:

**New file:** `lib/subscriptionGuard.ts`

```ts
import { SupabaseClient } from '@supabase/supabase-js'

export async function requireActiveSubscription(
  supabase: SupabaseClient,
  gymId: string
): Promise<{ allowed: boolean; response?: Response }> {
  const { data: gym } = await supabase
    .from('gyms')
    .select('subscription_status, trial_ends_at')
    .eq('id', gymId)
    .single()

  const isExpired =
    !gym ||
    gym.subscription_status === 'expired' ||
    (gym.subscription_status === 'trial' &&
      gym.trial_ends_at &&
      new Date(gym.trial_ends_at) < new Date())

  if (isExpired) {
    return {
      allowed: false,
      response: Response.json(
        { error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' },
        { status: 403 }
      ),
    }
  }

  return { allowed: true }
}
```

Use in any route handler that has a `gym_id` in scope (members, attendance, payments, etc.):

```ts
const guard = await requireActiveSubscription(supabase, gym.id)
if (!guard.allowed) return guard.response
```

---

## 12. ShellGuard — Expired Account Handling

Currently `ShellGuard` redirects to `/auth/login?error=blocked` when `check_gym_active` returns `false`. Since the extended RPC now returns `false` for expired accounts too, the redirect destination needs to differentiate.

**Option A (recommended):** Add a separate RPC `get_subscription_status(p_email)` that returns `'trial' | 'active' | 'expired' | 'blocked'`, and update `ShellGuard` to redirect to `/subscription` for `expired`.

**Option B (simpler):** Change the RPC to return a string enum and update `getGymActiveStatus` in the DAL to return it. Update `ShellGuard`'s `checkAuth` interval:

```ts
// In ShellGuard useEffect — replace the isActive === false branch
if (status === 'blocked') {
  await supabase.auth.signOut()
  window.location.href = '/auth/login?error=blocked'
} else if (status === 'expired') {
  window.location.href = '/subscription'
}
```

---

## 13. Mobile App (`gymflow-mobile`)

The mobile app should call a new endpoint to get subscription state:

**New file:** `app/api/subscription/status/route.ts`

```ts
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gym = await getGymForUser(supabase, user.id)
  if (!gym) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: fullGym } = await supabase
    .from('gyms')
    .select('subscription_status, plan_type, trial_ends_at, subscription_ends_at')
    .eq('id', gym.id)
    .single()

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('upi_id, upi_name, qr_code_url, price_monthly, price_yearly')
    .single()

  const { data: pendingRequest } = await supabase
    .from('subscription_requests')
    .select('status, submitted_at')
    .eq('gym_id', gym.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    subscriptionStatus: fullGym?.subscription_status,
    planType: fullGym?.plan_type,
    trialEndsAt: fullGym?.trial_ends_at,
    settings,
    pendingRequest: pendingRequest ?? null,
  })
}
```

The mobile `RenewalScreen` calls this on mount and on the "Refresh Status" button. The WhatsApp support button pre-fills:
```
Hello GymFlow Support. My free trial has expired. I have completed the payment via GPay. I have attached the payment screenshot. Please verify and reactivate my account.
```

---

## 14. Environment Variables

Add to `.env.example`:

```bash
# Subscription / Trial
TRIAL_DURATION_DAYS=14
```

---

## 15. Implementation Checklist

### Phase 1 — Database & Backend Foundation
- [ ] Write and run `gyms` ALTER migration
- [ ] Write and run `subscription_requests` CREATE migration  
- [ ] Create `platform_settings` table and seed default row
- [ ] Create `payment-proofs` Supabase Storage bucket + RLS policies
- [ ] Update `check_gym_active` RPC (or add new status RPC)
- [ ] Update `getGym()` select in `lib/dal.ts` to include subscription columns
- [ ] Add `getSubscriptionState()` helper to `lib/dal.ts`
- [ ] Add `TRIAL_DURATION_DAYS` to env files

### Phase 2 — Trial Initialization
- [ ] Update `app/api/onboarding/complete/route.ts` INSERT branch to stamp trial fields
- [ ] Verify existing gyms are backfilled with `active` status via migration

### Phase 3 — Middleware & Guards
- [ ] Extend `middleware.ts` with subscription expiry redirect
- [ ] Create `lib/subscriptionGuard.ts`
- [ ] Apply `requireActiveSubscription()` to: `/api/members`, `/api/payments`, `/api/attendance`, `/api/import`, `/api/whatsapp/*`, `/api/inventory/*`
- [ ] Add trial restriction guard in `app/account/actions.ts`

### Phase 4 — UI
- [ ] Build `components/layout/TrialBanner.tsx`
- [ ] Update `ShellGuard.tsx` to accept and render banner props
- [ ] Update `AppShell.tsx` to compute and pass subscription state
- [ ] Update `ShellGuard` expired-account redirect to `/subscription` vs `/auth/login`
- [ ] Build `app/subscription/page.tsx` + `SubscriptionClient.tsx`
- [ ] Disable email/password fields in `AccountClient.tsx` during trial
- [ ] Build `app/admin/subscriptions/page.tsx` + list client component

### Phase 5 — APIs
- [ ] `POST /api/subscription/request` — upload + insert
- [ ] `GET /api/subscription/status` — mobile status endpoint
- [ ] `POST /api/admin/subscription-requests/[id]` — approve/reject
- [ ] `POST /api/cron/subscription` — daily expiration job

### Phase 6 — Cron & Admin
- [ ] Register `/api/cron/subscription` in `vercel.json`
- [ ] Add Redis cache invalidation in cron and admin approve/reject
- [ ] Add subscription stats to `app/admin/page.tsx` (pending requests count, active/trial/expired counts)

### Phase 7 — Mobile
- [ ] Implement `RenewalScreen` in `gymflow-mobile`
- [ ] Hook into `GET /api/subscription/status` on app foreground
- [ ] WhatsApp support button with pre-filled message

---

## 16. Key Integration Points Summary

| Existing file | What changes |
|---|---|
| `lib/dal.ts` | Extend `getGym()` select; add `getSubscriptionState()`; add cache invalidation calls |
| `middleware.ts` | Add subscription expiry redirect for protected routes |
| `components/layout/AppShell.tsx` | Compute sub state, pass to ShellGuard |
| `components/layout/ShellGuard.tsx` | Accept + render banner; redirect expired → `/subscription` |
| `app/api/onboarding/complete/route.ts` | Stamp trial fields on gym insert |
| `app/account/actions.ts` | Block email/password change during trial |
| `app/admin/page.tsx` | Add subscription stats (pending count, breakdown) |
| `vercel.json` | Add `/api/cron/subscription` schedule |
| `.env.example` | Add `TRIAL_DURATION_DAYS` |
