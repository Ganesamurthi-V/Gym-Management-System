import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { timed } from '@/lib/perf'
import { computeSubscriptionState } from './subscription-utils'

// ── Auth ──────────────────────────────────────────────────────────────────────
// Two local, zero-network calls:
//
//   getClaims()  — verifies the JWT signature locally. This project signs access
//                  tokens with ES256 and publishes a JWKS, so verification uses
//                  the cached public key. Measured at ~1ms, versus ~173ms for
//                  auth.getUser(), which makes an HTTP call to the Auth server
//                  to learn the same thing. Verified against the live project:
//                  a token with an edited payload is rejected outright.
//   getSession() — supplies the full User object (email, user_metadata,
//                  created_at) that callers rely on. Reads the cookie only.
//
// getClaims() is the authorization signal; getSession() only shapes the result.
// Middleware performs the same verified check before any Server Component
// renders, and Postgres RLS remains the authority on row access.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  // No valid signature → treat as signed out regardless of cookie contents.
  const claims = data?.claims
  if (error || !claims?.sub) {
    return { user: null as User | null, error: error ?? null }
  }

  // Built from the VERIFIED claims rather than from `getSession().user`.
  // Besides being strictly more trustworthy, this avoids the
  // "Using the user object as returned from supabase.auth.getSession() could be
  // insecure" warning that supabase-js logged on every single render.
  //
  // `created_at` is not carried in the JWT. No consumer of getAuthUser() reads
  // it (the only `user.created_at` in the codebase is app/api/gyms/[id]/route.ts,
  // which does its own auth.getUser()), so it is left empty rather than faked.
  const user = {
    id: claims.sub,
    aud: (claims.aud as string) ?? 'authenticated',
    role: claims.role as string | undefined,
    email: claims.email as string | undefined,
    phone: claims.phone as string | undefined,
    app_metadata: (claims.app_metadata as Record<string, unknown>) ?? {},
    user_metadata: (claims.user_metadata as Record<string, unknown>) ?? {},
    is_anonymous: Boolean(claims.is_anonymous),
    created_at: '',
  } as unknown as User

  return { user, error: null }
})

// ── Gym core row (ONE query, never cached) ────────────────────────────────────
// Every gym-related helper below reads from this single query.
//
// Previously there were three separate single-row SELECTs against `gyms` on
// every navigation — getGym (Redis 120s), getGymSubscription (uncached) and
// getGymIsActive (uncached). Measured on the live project, ANY single-row gyms
// query costs ~200ms, and a query selecting ALL of these columns also costs
// ~205ms. So the extra columns are free and the extra round trips were not:
//
//   before: getGym(73ms Redis hit) → then max(sub 195ms, active 209ms) = ~282ms
//           (cold: 206 + 209 = ~415ms)
//   after:  one merged query                                          = ~205ms
//
// Deliberately NOT Redis-cached. `is_active` and the subscription columns are
// access-control critical — caching them is what caused the historical paywall
// bypass and "stuck on expired page" bugs. Wrapping in React `cache()` still
// deduplicates within a single render pass (AppShell + layout + page all share
// one query) without ever serving a cross-request cached result.
export type GymCoreRow = {
  id: string
  name: string
  owner_id: string
  created_at: string
  onboarding_completed: boolean | null
  onboarding_data: Record<string, unknown> | null
  is_active: boolean | null
  subscription_status: string | null
  plan_type: string | null
  trial_ends_at: string | null
  subscription_ends_at: string | null
}

const GYM_CORE_COLUMNS =
  'id, name, owner_id, created_at, onboarding_completed, onboarding_data, is_active, subscription_status, plan_type, trial_ends_at, subscription_ends_at'

export const getGymCore = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: gym, error } = await timed('gym core (merged, 1 query)', () =>
    supabase.from('gyms').select(GYM_CORE_COLUMNS).eq('owner_id', userId).single()
  )
  return { gym: (gym as GymCoreRow | null) ?? null, error }
})

// ── Gym identity ──────────────────────────────────────────────────────────────
// Same shape callers already expect (id, name, onboarding_completed, owner_id,
// created_at, onboarding_data). Now served from the shared getGymCore query, so
// this no longer costs its own round trip or needs Redis invalidation.
export const getGym = cache(async (userId: string) => {
  const { gym, error } = await getGymCore(userId)
  if (!gym) return { gym: null, error }
  return {
    gym: {
      id: gym.id,
      name: gym.name,
      onboarding_completed: gym.onboarding_completed,
      owner_id: gym.owner_id,
      created_at: gym.created_at,
      onboarding_data: gym.onboarding_data,
    },
    error,
  }
})

// ── Gym subscription state (always fresh) ─────────────────────────────────────
// Reads from the same uncached getGymCore query, so it keeps its freshness
// guarantee while no longer costing a second round trip.
export const getGymSubscription = cache(async (userId: string) => {
  const { gym, error } = await getGymCore(userId)
  if (!gym) return { gym: null, error }
  return {
    gym: {
      id: gym.id,
      owner_id: gym.owner_id,
      subscription_status: gym.subscription_status,
      plan_type: gym.plan_type,
      trial_ends_at: gym.trial_ends_at,
      subscription_ends_at: gym.subscription_ends_at,
    },
    error,
  }
})

// ── is_active check (always fresh) ───────────────────────────────────────────
// Determines whether the gym account is allowed to log in at all (admin ban /
// login_disabled flag). Served from the same uncached row, so a ban still takes
// effect on the very next navigation.
export const getGymIsActive = cache(async (userId: string) => {
  const { gym, error } = await getGymCore(userId)
  return { isActive: gym?.is_active ?? true, error }
})

// ── Unread admin messages (cached 30s) ────────────────────────────────────────
// Takes the OWNER id rather than the gym id, so it no longer has to wait for
// the gym row to load and can run in parallel with getGymCore.
//
// No `gym_id` filter is needed: the "owners read their gym's messages" RLS
// policy already restricts rows to
//   EXISTS (SELECT 1 FROM gyms WHERE id = admin_messages.gym_id
//           AND owner_id = auth.uid())
// so the database scopes this to exactly the caller's own gym.
export const getUnreadAdminMessages = cache(async (userId: string) => {
  return cacheWrapper(cacheKeys.unreadCount(userId), 30, async () => {
    const supabase = await createClient()
    const { count, error } = await timed('unread admin messages', () =>
      supabase
        .from('admin_messages')
        .select('*', { count: 'exact', head: true })
        .is('read_at', null)
    )
    return { count, error }
  })
})

// ── Subscription state helper ─────────────────────────────────────────────────
// Computes the effective subscription state from either a full gym row or the
// narrow subscription row returned by getGymSubscription().
type GymSubFields = {
  subscription_status?: string | null
  plan_type?: string | null
  trial_ends_at?: string | null
  subscription_ends_at?: string | null
} | null

export function getSubscriptionState(gym: GymSubFields) {
  return computeSubscriptionState(gym as any)
}
