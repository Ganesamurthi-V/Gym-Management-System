import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'
import { computeSubscriptionState } from './subscription-utils'

// ── Auth ──────────────────────────────────────────────────────────────────────
// Uses getSession() (JWT-local, no network) rather than getUser().
// Middleware already does the authoritative getUser() check before any Server
// Component renders, so this is safe and fast.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  return { user: session?.user ?? null, error }
})

// ── Gym identity (cached) ─────────────────────────────────────────────────────
// Fetches only the stable, non-security-sensitive fields: id, name, owner info,
// and onboarding state. These almost never change after setup, so a 120s Redis
// TTL is safe and eliminates redundant Postgres round-trips on every navigation.
//
// DOES NOT include subscription_status, trial_ends_at, subscription_ends_at, or
// any field that affects access control. Those are fetched separately via
// getGymSubscription() which always bypasses the cache.
//
// IMPORTANT: any code path that writes to name, onboarding_completed, or
// onboarding_data MUST call deleteCache(cacheKeys.gym(userId)) after the write.
export const getGym = cache(async (userId: string) => {
  return cacheWrapper(`user:${userId}:gym`, 120, async () => {
    const supabase = await createClient()
    const { data: gym, error } = await supabase
      .from('gyms')
      .select('id, name, onboarding_completed, owner_id, created_at, onboarding_data')
      .eq('owner_id', userId)
      .single()
    return { gym, error }
  })
})

// ── Gym subscription state (never cached) ─────────────────────────────────────
// Always fetches a fresh row from Postgres. Subscription status is security-
// and access-control-critical — stale data causes the paywall bypass / stuck-
// on-expired-page bugs we've already seen. The query is deliberately narrow
// (only the 5 columns needed by computeSubscriptionState) to keep it cheap.
//
// Because this is wrapped in React.cache() it still deduplicates within a
// single render pass (e.g. AppShell + layout both calling it), but it will
// never serve a cross-request cached result.
export const getGymSubscription = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: gym, error } = await supabase
    .from('gyms')
    .select(`
      id, owner_id,
      subscription_status, plan_type,
      trial_ends_at, subscription_ends_at
    `)
    .eq('owner_id', userId)
    .single()
  return { gym, error }
})

// ── is_active check (never cached) ───────────────────────────────────────────
// Determines whether the gym account is allowed to log in at all (admin ban /
// login_disabled flag). Previously wrapped in a 120s Redis cache keyed by
// email, which caused blocked accounts to retain access until TTL expiry.
// A single-column select is fast enough to run on every navigation.
export const getGymIsActive = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gyms')
    .select('is_active')
    .eq('owner_id', userId)
    .single()
  return { isActive: data?.is_active ?? true, error }
})

// ── Unread admin messages (cached 30s) ────────────────────────────────────────
export const getUnreadAdminMessages = cache(async (gymId: string) => {
  return cacheWrapper(`unread_count:${gymId}`, 30, async () => {
    const supabase = await createClient()
    const { count, error } = await supabase
      .from('admin_messages')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .is('read_at', null)
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
