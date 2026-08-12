# GymFlow — Secure API Gateway Migration Plan
### Codebase-Specific Implementation (app.gymflow.sbs → api.gymflow.sbs)

> **Audited from:** `Gym-Management-System-main` · Next.js 15 App Router · Supabase SSR · Upstash Redis · Vercel  
> **Target:** All browser traffic routes through `https://api.gymflow.sbs`; zero direct `*.supabase.co` calls from the browser.

---

## Audit Findings Summary

Before any code changes, here is what the audit found. This is the ground truth the migration phases are built against.

### What GymFlow already does correctly (do NOT break these)

| Area | Status |
|---|---|
| `lib/api/withAuth.ts` — central auth wrapper | ✅ Already exists — server-side auth + gym resolution + rate limiting |
| `lib/supabase/admin.ts` — service-role client | ✅ Has `import 'server-only'` guard |
| `/api/auth/login` route | ✅ Server-side sign-in, sets Supabase SSR cookie, no credentials returned to browser |
| `/api/whatsapp/send` route | ✅ WhatsApp token never sent to browser |
| `/api/graph/[...path]` proxy | ✅ Browser-origin rejection, allowlist, rate-limited in middleware |
| Cron routes (`/api/cron/*`) | ✅ Protected by `CRON_SECRET` |
| `WHATSAPP_*` env vars | ✅ Never prefixed `NEXT_PUBLIC_` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Server-only |
| Upstash rate limiting | ✅ Already in place on auth + API routes |
| Zod validation | ✅ Used in WhatsApp send route |
| Security headers in `next.config.mjs` | ✅ HSTS, X-Frame-Options, CSP etc. already set |
| `withAuth()` enforces gym isolation | ✅ Derives `gym_id` from session, never trusts client |

### What needs to change

| Area | Problem |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sent to browser — exposes your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sent to browser — anon key visible in Network tab and JS bundle |
| `lib/supabase/client.ts` | Creates a browser Supabase client using `NEXT_PUBLIC_*` vars |
| `components/layout/ShellGuard.tsx` | Browser calls `supabase.auth.getClaims()`, `signOut()` directly |
| `components/layout/AccountMenu.tsx` | Browser calls `supabase.auth.onAuthStateChange()`, `signOut()` |
| `components/member/LogoutButton.tsx` | Browser calls `supabase.auth.signOut()` directly |
| `components/member/SessionLifecycle.tsx` | Browser calls `supabase.auth.getSession()`, `refreshSession()` |
| `lib/hooks/useRealtimeChannel.ts` | Browser opens WebSocket to `wss://*.supabase.co` |
| `lib/hooks/useGymRealtime.ts` | Browser subscribes to Supabase Realtime postgres_changes |
| `lib/hooks/useMemberRealtime.ts` | Browser subscribes to Supabase Realtime postgres_changes |
| `app/auth/login/page.tsx` | Calls `createClient().auth.signOut()` for error recovery |
| `app/auth/create-account/page.tsx` | Calls `supabase.auth.signOut()` client-side |
| `app/auth/setup-password/page.tsx` | Calls `supabase.auth.updateUser()` client-side |
| `app/owner/account/AccountClient.tsx` | Calls `supabase.auth.updateUser({ password })` client-side |
| `gymflow-admin` supabase-browser.ts | Browser client for Realtime invalidation |
| CSP `connect-src` in `next.config.mjs` | Allows `https://*.supabase.co` and `wss://*.supabase.co` — must be removed after migration |
| `lib/supabase/server.ts` | Uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — should use private vars |
| `lib/member/activation-email.ts` | Uses `NEXT_PUBLIC_SUPABASE_URL` server-side (server-only risk is low, but naming is wrong) |
| Multiple server-side files using `NEXT_PUBLIC_SUPABASE_URL` | Should use private `SUPABASE_URL` instead to prevent accidental browser exposure |

### Existing API route inventory (71 routes — all already server-side)

All 71 routes in `app/api/` are Next.js Route Handlers (server-side). The browser does NOT call Supabase directly for data — it already calls `/api/*`. **This is the key insight:** GymFlow's data layer is largely correct already. The remaining problems are:

1. **Auth operations** still use the browser Supabase SDK (`signOut`, `updateUser`, `getClaims`)
2. **Realtime subscriptions** open direct WebSocket connections to `wss://*.supabase.co` from the browser
3. **`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`** are still bundled into the client JavaScript

---

## Migration Strategy

Because GymFlow's data API layer is already server-side, this migration has **three primary workstreams** rather than a full rewrite:

1. **Auth operations** → replace browser SDK calls with `/api/auth/*` endpoints
2. **Realtime** → replace direct Supabase WebSocket with a server-side event bridge (SSE or Supabase Realtime routed through your own server)
3. **Environment variables** → rename `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL` everywhere server-side; keep `NEXT_PUBLIC_API_URL=https://api.gymflow.sbs`

---

## Phase 1 — Audit Lock (Day 1, No Code Changes)

**Goal:** Freeze the codebase state, document the baseline, and set up tracking.

### 1.1 — Capture baseline Network trace

Open Chrome DevTools → Network. Log in to GymFlow. Record which requests go to `*.supabase.co`. Save a HAR file. This is your before-state comparison.

Expected to find in Network tab before migration:
```
wss://[project].supabase.co/realtime/v1/websocket   ← Realtime WebSocket
```

The login flow itself does NOT make a direct Supabase REST call — it already goes through `/api/auth/login`. But the Supabase SSR client sets and reads cookies that the browser can inspect.

### 1.2 — Document all files to change

From the audit, the exact files requiring changes are:

**Client components (browser Supabase SDK usage):**
- `components/layout/ShellGuard.tsx`
- `components/layout/AccountMenu.tsx`
- `components/member/LogoutButton.tsx`
- `components/member/SessionLifecycle.tsx`
- `app/auth/login/page.tsx` (line 231: `createClient().auth.signOut`)
- `app/auth/create-account/page.tsx` (line 198, 229)
- `app/auth/setup-password/page.tsx` (line 122)
- `app/owner/account/AccountClient.tsx` (lines 64, 228, 284)
- `app/activate/verifying/page.tsx`
- `lib/hooks/useRealtimeChannel.ts`
- `lib/hooks/useGymRealtime.ts`
- `lib/hooks/useMemberRealtime.ts`
- `gymflow-admin/lib/supabase-browser.ts`

**Server files using `NEXT_PUBLIC_SUPABASE_URL` (rename to `SUPABASE_URL`):**
- `lib/supabase/server.ts`
- `lib/supabase/admin.ts`
- `lib/member/activation-email.ts`
- `lib/member/activation-token.ts`
- `app/api/activate/callback/route.ts`
- `app/api/activate/finalize/route.ts`
- `app/api/health/route.ts`
- `app/api/member-app/invite/route.ts`
- `app/api/whatsapp/queue/drain/route.ts`
- `app/owner/member-app/actions.ts`
- `middleware.ts`

**Config files:**
- `next.config.mjs` (CSP `connect-src` — remove `*.supabase.co` after migration)
- `.env.example` (document new private vars)

### 1.3 — Create a migration branch

```bash
git checkout -b feat/api-gateway-migration
```

Never commit half-migrated state to main. Each phase below is a separate commit.

---

## Phase 2 — Environment Variable Cleanup (Day 1–2)

**Goal:** Stop using `NEXT_PUBLIC_` prefix for Supabase URL and anon key in server-side code. This alone removes the Supabase project URL from the browser bundle.

### 2.1 — Add private environment variables

Add to your `.env.local` (and Vercel environment settings):

```env
# Private — server runtime only. NEVER prefix with NEXT_PUBLIC_
SUPABASE_URL=https://[your-project].supabase.co
SUPABASE_ANON_KEY=eyJ...

# Keep these for backward compat during transition — remove after Phase 7
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# New public API base URL — the ONLY backend hostname the browser needs
NEXT_PUBLIC_API_URL=https://api.gymflow.sbs
```

> **Vercel Note:** Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Production + Preview environment variables. Mark them as "Server-only" (do not expose to browser).

### 2.2 — Update `lib/supabase/server.ts`

Replace `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with private vars:

```ts
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export const createClient = cache(async () => {
  const cookieStore = await cookies()

  // Use private vars — these do NOT appear in the browser bundle
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not set.')
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch { /* Server Component — safe to ignore */ }
      },
    },
  })
})

export const getServerClient = createClient
```

### 2.3 — Update `lib/supabase/admin.ts`

```ts
// lib/supabase/admin.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL          // private var
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

### 2.4 — Update middleware.ts

Replace `process.env.NEXT_PUBLIC_SUPABASE_URL` with `process.env.SUPABASE_URL` (middleware runs only on the server — this is safe):

```ts
// middleware.ts line ~186
const supabase = createServerClient(
  process.env.SUPABASE_URL!,        // was NEXT_PUBLIC_SUPABASE_URL
  process.env.SUPABASE_ANON_KEY!,   // was NEXT_PUBLIC_SUPABASE_ANON_KEY
  { cookies: { ... } }
)
```

### 2.5 — Update all server-only files that use `NEXT_PUBLIC_SUPABASE_URL`

Do a global search-and-replace in server-only files (API routes, server actions, lib files that are NOT imported by client components):

Files to update (replace `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `SUPABASE_ANON_KEY`):
- `app/api/activate/callback/route.ts`
- `app/api/activate/finalize/route.ts`
- `app/api/health/route.ts`
- `app/api/member-app/invite/route.ts`
- `app/api/whatsapp/queue/drain/route.ts`
- `app/owner/member-app/actions.ts`
- `lib/member/activation-email.ts`
- `lib/member/activation-token.ts`
- `lib/whatsapp/automation.ts`

### 2.6 — Create `lib/api/client.ts` (browser API client)

This is the single source of truth for all browser→server API calls going forward:

```ts
// lib/api/client.ts
/**
 * GymFlow browser API client.
 * All browser→server calls go through this. The browser sees only
 * https://api.gymflow.sbs — never *.supabase.co credentials.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

class GymFlowAPIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'GymFlowAPIError'
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',           // sends session cookie
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF signal
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let errBody: { error?: { code?: string; message?: string } } = {}
    try { errBody = await res.json() } catch { /* ignore */ }
    throw new GymFlowAPIError(
      res.status,
      errBody.error?.code ?? 'UNKNOWN',
      errBody.error?.message ?? `HTTP ${res.status}`,
    )
  }

  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string)                    => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)     => request<T>('POST',   path, body),
  patch:  <T>(path: string, body: unknown)     => request<T>('PATCH',  path, body),
  delete: <T>(path: string)                    => request<T>('DELETE', path),
}

export { GymFlowAPIError }
```

### 2.7 — Verify build

```bash
npm run build
# Search the .next output for the Supabase URL — should not appear
grep -r "supabase.co" .next/static --include="*.js" | grep -v "wss\|supabase-js"
```

After this phase, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are still in `.env.example` (for the `lib/supabase/client.ts` browser client) but the majority of usages are now private. Phase 7 removes the browser client entirely.

---

## Phase 3 — Auth API Endpoints (Day 2–3)

**Goal:** Replace all browser Supabase Auth SDK calls with GymFlow API endpoints. The browser should never call `supabase.auth.*` directly.

### 3.1 — Create `POST /api/auth/signout`

```ts
// app/api/auth/signout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          // Explicitly clear any gymflow session cookies
          'Set-Cookie': [
            'sb-access-token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
            'sb-refresh-token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
          ].join(', '),
        },
      },
    )
  } catch {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
```

### 3.2 — Create `POST /api/auth/update-password`

```ts
// app/api/auth/update-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  password: z.string().min(8).max(72),
})

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid password' } },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      )
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: 'Password update failed' } },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, { status: 500 })
  }
}
```

### 3.3 — Create `GET /api/auth/session`

Used by ShellGuard and AccountMenu to check whether the user is still authenticated, replacing `supabase.auth.getClaims()`:

```ts
// app/api/auth/session/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { roleFromClaims } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getClaims()

    if (error || !data?.claims?.sub) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    const claims = data.claims
    const role = roleFromClaims({ user_metadata: claims.user_metadata as Record<string, unknown> })

    return NextResponse.json(
      {
        authenticated: true,
        userId: claims.sub,
        role,
        email: claims.email,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
```

### 3.4 — Update `components/member/LogoutButton.tsx`

Replace direct Supabase call with API endpoint:

```tsx
// Before:
const supabase = createClient()
const { error } = await supabase.auth.signOut({ scope: 'local' })

// After:
const res = await fetch('/api/auth/signout', {
  method: 'POST',
  credentials: 'include',
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})
if (!res.ok) throw new Error('Sign-out failed')
```

Remove the `import { createClient } from '@/lib/supabase/client'` import.

### 3.5 — Update `components/layout/AccountMenu.tsx`

Replace `supabase.auth.onAuthStateChange` and `signOut`:

```tsx
// Remove: import { createClient } from '@/lib/supabase/client'
// Remove: const supabase = createClient()
// Remove: supabase.auth.onAuthStateChange(...)

// For sign-out:
const handleSignOut = async () => {
  await fetch('/api/auth/signout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  window.location.href = '/auth/login'
}

// For auth state: use the initialUser prop that is already server-rendered.
// If you need live auth state detection, use a polling approach against
// /api/auth/session (once on focus, not continuously) instead of the Realtime socket.
```

### 3.6 — Update `components/layout/ShellGuard.tsx`

The current ShellGuard already receives `initialUser`, `initialGym`, and `initialIsActive` from the server as props. Replace the `supabase.auth.getClaims()` polling with a fetch to `/api/auth/session`:

```tsx
// Replace the checkAuth function:
const checkAuth = async () => {
  if (document.hidden) return
  try {
    const res = await fetch('/api/auth/session', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    if (res.status === 401) {
      window.location.href = '/auth/login'
    }
  } catch { /* network error — do nothing, will retry on next interval */ }
}

// Replace supabase.auth.signOut() calls:
const signOut = async () => {
  await fetch('/api/auth/signout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  window.location.href = '/auth/login'
}
```

Remove `import { createClient } from '@/lib/supabase/client'`.

### 3.7 — Update `components/member/SessionLifecycle.tsx`

This component currently calls `supabase.auth.onAuthStateChange`, `getSession`, and `refreshSession`. The session is maintained by the Supabase SSR cookie automatically. Replace with a visibility-change handler that calls `/api/auth/session`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SessionLifecycle() {
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      if (document.hidden) return
      try {
        const res = await fetch('/api/auth/session', {
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        if (res.status === 401) {
          router.push('/auth/login')
        } else {
          router.refresh()   // re-run Server Components with fresh data
        }
      } catch { /* ignore network errors */ }
    }

    document.addEventListener('visibilitychange', checkSession)
    return () => document.removeEventListener('visibilitychange', checkSession)
  }, [router])

  return null
}
```

### 3.8 — Update `app/auth/login/page.tsx`

Line 231: `void createClient().auth.signOut({ scope: 'local' })` — replace with:

```ts
void fetch('/api/auth/signout', {
  method: 'POST',
  credentials: 'include',
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})
```

Remove the `createClient` import if it's no longer used elsewhere in the file.

### 3.9 — Update `app/auth/setup-password/page.tsx`

The `supabase.auth.updateUser({ password })` call:

```ts
// Before:
const supabase = createClient()
const { error } = await supabase.auth.updateUser({ password })

// After:
const res = await fetch('/api/auth/update-password', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  body: JSON.stringify({ password }),
})
const data = await res.json()
if (!res.ok) throw new Error(data.error?.message || 'Password update failed')
```

### 3.10 — Update `app/owner/account/AccountClient.tsx`

Same pattern as 3.9 for `supabase.auth.updateUser({ password })` and `supabase.auth.signOut()`.

---

## Phase 4 — Realtime Migration (Day 3–5)

**Goal:** Remove all direct browser WebSocket connections to `wss://*.supabase.co`. This is the hardest phase.

### Background: What Realtime does today

GymFlow uses Supabase Realtime for:

- **Owner app (`useGymRealtime`):** Watches tables (`members`, `memberships`, `attendance`, etc.) filtered by `gym_id=eq.{gymId}`. On any change, calls `router.refresh()`.
- **Member app (`useMemberRealtime`):** Watches the member's own data tables. On change, invalidates TanStack Query cache and calls `router.refresh()`.

Both use the browser Supabase SDK to open a WebSocket to `wss://[project].supabase.co/realtime/v1/websocket`.

### Option A — Server-Sent Events bridge (recommended for GymFlow)

GymFlow's Realtime usage is simple: **any change → call `router.refresh()`**. You don't need the full change payload in the browser — just a ping. This maps cleanly to Server-Sent Events (SSE) through your own API.

Architecture:
```
Postgres change event
  → Supabase Realtime (server-side listener)
  → Your Next.js SSE endpoint
  → Browser EventSource
  → router.refresh()
```

### 4.1 — Create the SSE endpoint for owners

```ts
// app/api/realtime/gym/route.ts
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGymForUser } from '@/lib/supabase/queries'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const gym = await getGymForUser(supabase, user.id)
  if (!gym) {
    return new Response('Not found', { status: 404 })
  }

  const gymId = gym.id

  // Set up SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'))

      // Server-side Supabase Realtime listener using admin client
      const adminSupabase = createAdminClient()
      const tables = ['members', 'memberships', 'attendance', 'payments',
                       'expenses', 'equipment', 'leads', 'announcements',
                       'membership_plans', 'program_assignments']

      let channel = adminSupabase.channel(`sse-gym-${gymId}`)

      for (const table of tables) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `gym_id=eq.${gymId}` },
          () => {
            try {
              controller.enqueue(encoder.encode(`data: {"type":"change","table":"${table}"}\n\n`))
            } catch { /* client disconnected */ }
          },
        )
      }

      channel.subscribe()

      // Keep-alive ping every 25s (Vercel / Cloudflare will close idle SSE after 30s)
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          clearInterval(keepAlive)
        }
      }, 25_000)

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        void adminSupabase.removeChannel(channel)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

### 4.2 — Create the SSE endpoint for members

```ts
// app/api/realtime/member/route.ts
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Get the member row for this auth user
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member) {
    return new Response('Not found', { status: 404 })
  }

  const memberId = member.id

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'))

      const adminSupabase = createAdminClient()
      const tables = ['memberships', 'attendance', 'program_assignments', 'members']

      let channel = adminSupabase.channel(`sse-member-${memberId}`)

      for (const table of tables) {
        const filter = table === 'memberships' || table === 'attendance'
          ? `member_id=eq.${memberId}`
          : table === 'members'
            ? `id=eq.${memberId}`
            : `member_id=eq.${memberId}`

        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter },
          () => {
            try {
              controller.enqueue(encoder.encode(`data: {"type":"change","table":"${table}"}\n\n`))
            } catch { /* client disconnected */ }
          },
        )
      }

      channel.subscribe()

      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')) }
        catch { clearInterval(keepAlive) }
      }, 25_000)

      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        void adminSupabase.removeChannel(channel)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

### 4.3 — Create `lib/hooks/useGymSSE.ts` (replaces `useGymRealtime`)

```ts
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Subscribes to GymFlow's server-sent events for the owner's gym.
 * Replaces the direct Supabase Realtime WebSocket connection.
 * The browser connects to /api/realtime/gym — never to *.supabase.co.
 */
export function useGymSSE(enabled = true) {
  const router = useRouter()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled) return

    let es: EventSource
    let reconnectTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      es = new EventSource('/api/realtime/gym', { withCredentials: true })
      esRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'change') {
            router.refresh()
          }
        } catch { /* ignore malformed events */ }
      }

      es.onerror = () => {
        es.close()
        // Reconnect after 5s on error
        reconnectTimer = setTimeout(connect, 5_000)
      }
    }

    connect()

    const handleFocus = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleFocus)
      clearTimeout(reconnectTimer)
      esRef.current?.close()
      esRef.current = null
    }
  }, [enabled, router])
}
```

### 4.4 — Create `lib/hooks/useMemberSSE.ts` (replaces `useMemberRealtime`)

```ts
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { memberKeys } from '@/lib/member/queries'

/**
 * Subscribes to GymFlow's server-sent events for the current member.
 * Replaces the direct Supabase Realtime WebSocket connection.
 */
export function useMemberSSE() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let es: EventSource
    let reconnectTimer: ReturnType<typeof setTimeout>
    let debounceTimer: ReturnType<typeof setTimeout>

    const refresh = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: memberKeys.bundle })
        router.refresh()
      }, 1_500)
    }

    const connect = () => {
      es = new EventSource('/api/realtime/member', { withCredentials: true })
      esRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'change') refresh()
        } catch { /* ignore */ }
      }

      es.onerror = () => {
        es.close()
        reconnectTimer = setTimeout(connect, 5_000)
      }
    }

    connect()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearTimeout(reconnectTimer)
      clearTimeout(debounceTimer)
      esRef.current?.close()
      esRef.current = null
    }
  }, [router, queryClient])
}
```

### 4.5 — Update consumers of the old realtime hooks

**Owner layouts that use `useGymRealtime`:** Find all callers with:
```bash
grep -rn "useGymRealtime\|useRealtimeChannel" app/ components/ --include="*.tsx" --include="*.ts"
```
Replace each `useGymRealtime(gymId, tables)` call with `useGymSSE()` (gym and table filtering is now done server-side).

**Member layouts that use `useMemberRealtime`:** Replace `useMemberRealtime()` with `useMemberSSE()`.

### 4.6 — Handle the gymflow-admin realtime

`gymflow-admin/lib/supabase-browser.ts` creates a browser Supabase client solely for Realtime broadcast invalidation. Replace this with a fetch to an admin SSE endpoint or simply use a polling refresh in the admin panel since it's an internal tool:

```ts
// gymflow-admin/lib/realtime.ts  (replaces supabase-browser.ts)
/**
 * Admin panel invalidation — polls /api/admin/gyms for changes instead
 * of opening a direct Supabase WebSocket. The admin panel is internal-only
 * so a 10-second poll is acceptable.
 */
export function startAdminPolling(onUpdate: () => void) {
  const interval = setInterval(onUpdate, 10_000)
  return () => clearInterval(interval)
}
```

---

## Phase 5 — CSP & Security Header Updates (Day 5)

**Goal:** Remove `*.supabase.co` from the browser's allowed connection list once all direct connections are gone.

### 5.1 — Update `next.config.mjs` CSP

The current CSP `connect-src` allows direct browser Supabase connections:
```
connect-src ... https://*.supabase.co wss://*.supabase.co ...
```

After Phase 3 and 4 are complete, remove these and replace:

```ts
// next.config.mjs — updated connect-src
"connect-src 'self' https://api.gymflow.sbs https://api.groq.com https://content-crawdad-120459.upstash.io https://maps.googleapis.com https://maps.gstatic.com https://*.sentry.io",
```

Note: `wss://*.supabase.co` is removed entirely because Realtime now goes through your SSE endpoints.

Also add `api.gymflow.sbs` to `script-src` if any scripts are loaded from there.

### 5.2 — Add CORS configuration for `api.gymflow.sbs`

GymFlow's API is served from the same Next.js app (`app.gymflow.sbs`) so CORS between browser and API is same-origin. However, if `api.gymflow.sbs` is a separate deployment (e.g., different Vercel project), add CORS:

```ts
// lib/api/cors.ts
export function corsHeaders(origin: string | null) {
  const allowed = [
    'https://app.gymflow.sbs',
    'https://gymflowx.co.in',
    'http://localhost:3000',
    'http://localhost:3004',
  ]

  if (!origin || !allowed.includes(origin)) {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}
```

### 5.3 — Add CSRF protection

The `X-Requested-With: XMLHttpRequest` header in `lib/api/client.ts` (Phase 2.6) provides basic CSRF protection for same-origin requests. Add server-side validation for all state-changing endpoints in `withAuth`:

```ts
// lib/api/withAuth.ts — add CSRF check
function requireCSRF(req: NextRequest): boolean {
  const method = req.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true
  return req.headers.get('X-Requested-With') === 'XMLHttpRequest'
}

// In withAuth() handler:
if (!requireCSRF(req)) {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message: 'CSRF check failed' } },
    { status: 403 },
  )
}
```

---

## Phase 6 — Remove Browser Supabase Client (Day 6)

**Goal:** Delete `lib/supabase/client.ts` and remove all imports of the browser Supabase client.

### 6.1 — Verify no remaining imports

```bash
grep -rn "from '@/lib/supabase/client'" app/ components/ lib/ features/ --include="*.tsx" --include="*.ts"
grep -rn "createBrowserClient" app/ components/ lib/ --include="*.tsx" --include="*.ts"
```

This should return zero results after Phases 3 and 4.

### 6.2 — Delete the browser client file

```bash
rm lib/supabase/client.ts
```

### 6.3 — Remove `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Update `.env.example` to remove these two variables. They should not be needed anywhere after this phase.

Update `lib/supabase/server.ts` to confirm it uses only `SUPABASE_URL` and `SUPABASE_ANON_KEY` (done in Phase 2.2).

### 6.4 — Update `gymflow-member` sub-directory

The `gymflow-member/src/lib/supabase/client.ts` still exists for the member PWA. Since GymFlow is now a unified app, this directory is either:
- **Already merged** (if the unified PWA migration is complete) → delete `gymflow-member/src/lib/supabase/client.ts`
- **Still separate** → apply the same Phase 3 changes to `gymflow-member/src/components/auth/LogoutButton.tsx`, `SessionLifecycle.tsx`, and middleware

The `gymflow-member/src/middleware.ts` uses `NEXT_PUBLIC_SUPABASE_URL` — update it to use `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### 6.5 — Remove `@supabase/ssr` from client bundle

In `next.config.mjs`, mark Supabase SSR as server-external to ensure it never lands in the browser bundle:

```js
// next.config.mjs
serverExternalPackages: ['exceljs', '@supabase/ssr'],
```

The `@supabase/supabase-js` client bundle can remain (it's needed for the SSE server-side Realtime subscription in Phase 4), but it must only be imported in server contexts.

---

## Phase 7 — Cloudflare & DNS Configuration (Day 7)

**Goal:** Route `api.gymflow.sbs` through Cloudflare with WAF, rate limiting, and TLS.

### 7.1 — DNS setup

If GymFlow runs on Vercel as a single app:

```
api.gymflow.sbs → CNAME → cname.vercel-dns.com (proxied via Cloudflare)
app.gymflow.sbs → CNAME → cname.vercel-dns.com (proxied via Cloudflare)
```

In Vercel: add `api.gymflow.sbs` as a custom domain pointing to the same Next.js deployment as `app.gymflow.sbs`. The Next.js app handles all routes for both domains.

In `next.config.mjs`, confirm `serverActions.allowedOrigins` includes `api.gymflow.sbs`.

### 7.2 — Cloudflare settings for `api.gymflow.sbs`

| Setting | Value |
|---|---|
| Proxy status | Proxied (orange cloud) |
| SSL/TLS | Full (strict) |
| Minimum TLS version | TLS 1.2 |
| HTTP/3 (QUIC) | On |
| Always Use HTTPS | On |
| HSTS | Enable (max-age 1 year, includeSubDomains) |
| Bot Fight Mode | On |
| WAF | On — OWASP Core Ruleset |

### 7.3 — Cloudflare Rate Limiting rules

Create the following Cloudflare Rate Limiting rules (these layer on top of your existing Upstash rate limiting):

| Rule | Match | Limit | Action |
|---|---|---|---|
| Auth brute force | `http.request.uri.path starts_with "/api/auth/"` | 20 req / 1 min / IP | Block 30 min |
| WhatsApp send | `http.request.uri.path starts_with "/api/whatsapp/"` | 50 req / 1 min / IP | Block 5 min |
| Import | `http.request.uri.path starts_with "/api/import"` | 10 req / 1 min / IP | Block 5 min |
| General API | `http.request.uri.path starts_with "/api/"` | 500 req / 1 min / IP | Block 1 min |

### 7.4 — Cloudflare WAF custom rules

```
# Block requests with no User-Agent to API routes
(http.request.uri.path starts_with "/api/" and 
 not http.request.headers["user-agent"][0] exists)
→ Block

# Require HTTPS
(not ssl)
→ Redirect to HTTPS
```

### 7.5 — Vercel deployment protection

Add the Cloudflare IP ranges to Vercel's trusted proxy list (Vercel → Project → Settings → Deployment Protection) so the origin server only accepts traffic from Cloudflare.

---

## Phase 8 — Environment Variable Finalisation (Day 7)

**Goal:** Confirm the final set of environment variables and remove all vestiges of `NEXT_PUBLIC_SUPABASE_*`.

### Final `.env.example`

```env
# ── Public (browser-visible) ──────────────────────────────────────────────────
# The ONLY backend hostname the browser needs to know.
NEXT_PUBLIC_API_URL=https://api.gymflow.sbs
NEXT_PUBLIC_APP_URL=https://app.gymflow.sbs
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn

# ── Private (server runtime only — NEVER prefix with NEXT_PUBLIC_) ────────────
SUPABASE_URL=https://[project].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

GROQ_API_KEY=your_groq_api_key

UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token

# WhatsApp Cloud API
WHATSAPP_VERIFY_TOKEN=your_verify_token_min_32_chars
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_API_VERSION=v21.0
WHATSAPP_BASE_URL=https://graph.gymflow.sbs/api/graph

GRAPH_API_BASE_URL=https://graph.facebook.com
GRAPH_PROXY_SECRET=your_32_char_hex

CRON_SECRET=your_cron_secret_min_32_chars

QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_current_signing_key
QSTASH_NEXT_SIGNING_KEY=your_next_signing_key

TRIAL_DURATION_DAYS=14

ADMIN_PASSWORD=your_admin_password_min_32_chars
ADMIN_EMAIL=your_admin_email@example.com
ADMIN_PANEL_SECRET=your_admin_panel_secret_MUST_DIFFER_FROM_ADMIN_PASSWORD
```

---

## Phase 9 — Security Testing (Day 8)

**Goal:** Verify the migration is complete and secure before merging to main.

### 9.1 — Network tab verification

Open Chrome DevTools → Network. Filter by:

```
supabase
```

Expected result: **zero requests** to `*.supabase.co` during normal app usage.

Filter by:
```
rest/v1
auth/v1
functions/v1
storage/v1
```

Expected result: **zero results**.

All API requests should show:
```
https://api.gymflow.sbs/api/...
```

Session authentication should appear as a cookie, not as an `apikey:` or `Authorization:` header with a Supabase token.

### 9.2 — Browser bundle audit

```bash
npm run build

# Check for Supabase URL in client bundle
grep -r "supabase.co" .next/static --include="*.js" | grep -v "//.*supabase"

# Check for service role key
grep -r "service_role" .next/static --include="*.js"

# Check for WhatsApp token
grep -r "WHATSAPP_ACCESS_TOKEN" .next/static --include="*.js"

# Check for Razorpay secret
grep -r "RAZORPAY_KEY_SECRET\|rzp_" .next/static --include="*.js"
```

All should return **zero results**.

### 9.3 — Auth tests

```bash
# Unauthenticated request to protected route → 401
curl -i https://api.gymflow.sbs/api/members
# Expected: 401 {"success":false,"error":{"code":"UNAUTHORIZED",...}}

# Wrong session cookie → 401
curl -i https://api.gymflow.sbs/api/members \
  -H "Cookie: sb-access-token=invalid.token.here"
# Expected: 401

# Sign-out endpoint works
curl -i -X POST https://api.gymflow.sbs/api/auth/signout \
  -H "X-Requested-With: XMLHttpRequest"
# Expected: 200 with Set-Cookie clearing tokens
```

### 9.4 — CSRF test

```bash
# POST without X-Requested-With header → 403
curl -i -X POST https://api.gymflow.sbs/api/members \
  -H "Content-Type: application/json" \
  -b "sb-access-token=valid_token_here" \
  -d '{"name":"test"}'
# Expected: 403 CSRF check failed
```

### 9.5 — Tenant isolation test

```bash
# Get gym_id for user A
# Attempt to access user B's members using user A's session
# Expected: 200 but returns only user A's data (gym_id derived server-side)
```

### 9.6 — Rate limiting test

```bash
# Send 12 rapid auth requests → 429
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://api.gymflow.sbs/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Expect: 200 200 200 ... 429
```

### 9.7 — Direct Supabase access check

Try to call your Supabase project directly:
```bash
curl -i "https://[project].supabase.co/rest/v1/members" \
  -H "apikey: [anon-key]" \
  -H "Authorization: Bearer [anon-key]"
# Expected: 401 (RLS blocks unauthenticated access)
# This proves RLS is still the DB-level backstop
```

### 9.8 — CORS verification

```bash
# Unknown origin rejected
curl -i https://api.gymflow.sbs/api/members \
  -H "Origin: https://evil.example.com" \
  -H "Cookie: ..."
# Expected: No Access-Control-Allow-Origin header (or CORS error)
```

---

## Phase 10 — Production Deployment (Day 9)

**Goal:** Ship to production without downtime.

### 10.1 — Pre-deployment checklist

- [ ] All tests in `__tests__/` pass: `npm run test`
- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` added to Vercel Production environment
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` removed from Vercel Production environment
- [ ] `NEXT_PUBLIC_API_URL=https://api.gymflow.sbs` added to Vercel Production
- [ ] `api.gymflow.sbs` DNS record created and proxied through Cloudflare
- [ ] Cloudflare WAF rules active
- [ ] Build passes without errors: `npm run build`
- [ ] No `*.supabase.co` in client bundle

### 10.2 — Deployment steps

```bash
# 1. Merge migration branch to main
git checkout main
git merge feat/api-gateway-migration

# 2. Push (Vercel auto-deploys)
git push origin main

# 3. Monitor Vercel deployment logs for errors

# 4. After deploy, run smoke tests:
curl https://api.gymflow.sbs/api/health
# Expected: 200 { "status": "ok" }

# 5. Log in to the app and open DevTools → Network
# Confirm zero *.supabase.co requests
```

### 10.3 — Rollback plan

If issues arise:
```bash
git revert HEAD  # or deploy the previous Vercel deployment
```

The migration is designed to be reversible until Phase 6 (browser client deletion). Before that, re-adding `NEXT_PUBLIC_SUPABASE_URL` to Vercel will restore the old behaviour.

---

## Final Acceptance Checklist

| # | Criterion | How to verify |
|---|---|---|
| 1 | Browser uses `api.gymflow.sbs` for all API calls | DevTools → Network |
| 2 | No direct browser Supabase REST requests | Network filter: `supabase` |
| 3 | No Supabase service-role key in browser | Bundle grep |
| 4 | No WhatsApp secret in browser | Bundle grep |
| 5 | No Razorpay secret in browser | Bundle grep |
| 6 | Auth uses Supabase SSR cookie (HttpOnly) | DevTools → Application → Cookies |
| 7 | `POST /api/auth/signout` works | curl test |
| 8 | `POST /api/auth/update-password` works | curl test |
| 9 | `GET /api/auth/session` returns 401 when unauthenticated | curl test |
| 10 | No direct Supabase WebSocket in browser | Network filter: `wss` |
| 11 | SSE endpoints (`/api/realtime/gym`, `/api/realtime/member`) connected | DevTools → Network → EventStream |
| 12 | `withAuth` CSRF check blocks missing header | curl test |
| 13 | `gym_id` derived server-side, never trusted from client | Code review |
| 14 | RLS remains enabled on all tables | Supabase dashboard |
| 15 | CORS blocks unknown origins | curl test |
| 16 | HSTS header present | `curl -I https://api.gymflow.sbs` |
| 17 | Cloudflare WAF active | Cloudflare dashboard |
| 18 | Rate limiting returns 429 | load test |
| 19 | `NEXT_PUBLIC_SUPABASE_URL` absent from build | Bundle grep |
| 20 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` absent from build | Bundle grep |
| 21 | CSP `connect-src` no longer allows `*.supabase.co` | Response headers |
| 22 | API errors use GymFlow codes, not raw Postgres errors | Integration test |

---

## Files Changed Summary

### New files to create

```
app/api/auth/signout/route.ts
app/api/auth/update-password/route.ts
app/api/auth/session/route.ts
app/api/realtime/gym/route.ts
app/api/realtime/member/route.ts
lib/api/client.ts
lib/hooks/useGymSSE.ts
lib/hooks/useMemberSSE.ts
lib/api/cors.ts
```

### Files to modify

```
lib/supabase/server.ts               — NEXT_PUBLIC_* → private vars
lib/supabase/admin.ts                — NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL
middleware.ts                        — NEXT_PUBLIC_* → private vars
next.config.mjs                      — remove *.supabase.co from CSP connect-src
lib/api/withAuth.ts                  — add CSRF check
components/layout/ShellGuard.tsx     — remove browser Supabase client
components/layout/AccountMenu.tsx    — remove browser Supabase client
components/member/LogoutButton.tsx   — remove browser Supabase client
components/member/SessionLifecycle.tsx — replace with SSE-aware version
app/auth/login/page.tsx              — replace signOut call
app/auth/create-account/page.tsx     — replace signOut call
app/auth/setup-password/page.tsx     — replace updateUser call
app/owner/account/AccountClient.tsx  — replace auth calls
app/activate/verifying/page.tsx      — remove supabase client usage
lib/member/activation-email.ts       — NEXT_PUBLIC_* → private vars
lib/member/activation-token.ts       — NEXT_PUBLIC_* → private vars
lib/whatsapp/automation.ts           — NEXT_PUBLIC_* → private vars
app/api/activate/callback/route.ts   — NEXT_PUBLIC_* → private vars
app/api/activate/finalize/route.ts   — NEXT_PUBLIC_* → private vars
app/api/health/route.ts              — NEXT_PUBLIC_* → private vars
app/api/member-app/invite/route.ts   — NEXT_PUBLIC_* → private vars
app/api/whatsapp/queue/drain/route.ts — NEXT_PUBLIC_* → private vars
app/owner/member-app/actions.ts      — NEXT_PUBLIC_* → private vars
gymflow-admin/lib/supabase-browser.ts — replace with polling
gymflow-member/src/lib/supabase/client.ts — delete or migrate
gymflow-member/src/middleware.ts     — NEXT_PUBLIC_* → private vars
.env.example                         — update variable names
```

### Files to delete

```
lib/supabase/client.ts              — browser Supabase client (after Phase 6)
lib/hooks/useRealtimeChannel.ts     — replaced by useGymSSE / useMemberSSE
lib/hooks/useGymRealtime.ts         — replaced by useGymSSE
lib/hooks/useMemberRealtime.ts      — replaced by useMemberSSE
gymflow-admin/lib/supabase-browser.ts — replaced by polling
```

---

## Important Notes Specific to GymFlow

**1. You already have `withAuth()` — use it consistently.**  
The `/api/members` route duplicates the auth/gym-resolution logic manually instead of using `withAuth`. After the migration, run a cleanup pass to migrate remaining routes that don't use `withAuth` to use it. This reduces the risk of missing an auth check.

**2. The `activate` flow is legitimately public.**  
`/api/activate/*` and `/api/auth/*` are correctly exempt from `withAuth` because they operate before authentication. Do not add `withAuth` to these routes.

**3. Supabase cookies are already HttpOnly.**  
Supabase SSR sets `sb-access-token` and `sb-refresh-token` as HttpOnly cookies. The migration does not change this — it only stops the browser from also importing the Supabase JS SDK and using it directly.

**4. RLS stays on.**  
Your Supabase tables have RLS policies. The API gateway adds an application-level authorization layer. Both should remain active — RLS is the database backstop if the application layer is ever bypassed.

**5. The graph proxy (`/api/graph/[...path]`) is already secure.**  
This route already rejects browser-originated requests, enforces an endpoint allowlist, and never exposes credentials. No changes needed in this migration.

**6. Cron routes are already protected.**  
`/api/cron/*` requires `CRON_SECRET`. No changes needed.

**7. SSE on Vercel has a 60-second function timeout.**  
Vercel's free/pro plan limits Serverless Functions to 60 seconds. SSE connections longer than this will be cut off. Options:
- Use Vercel Edge Functions (no timeout for SSE) — change `export const runtime = 'edge'` in the realtime route, but Edge Functions cannot use Node.js APIs
- Use Vercel Pro's 300s max timeout
- Use a dedicated WebSocket service (e.g., Ably, Pusher, Supabase Realtime routed through your own server)

The recommended approach for GymFlow is to set `export const maxDuration = 60` in the SSE routes and rely on the client-side auto-reconnect (the `onerror` handler in `useGymSSE`) to re-establish connections. This is transparent to users.
