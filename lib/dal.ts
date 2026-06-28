import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'

// Issue 2 fix: Use getSession() instead of getUser() for in-render reads.
// getSession() validates the JWT signature/expiry locally — no network call.
// Middleware already performs the authoritative server-side getUser() check
// for every request before any Server Component renders, so this is safe.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  return { user: session?.user ?? null, error }
})

// Issue 3 fix: Wrap in cacheWrapper with 120s Redis TTL.
// Previously only React.cache() was used, which only deduplicates within a
// single render pass — meaning a fresh Postgres query on every navigation.
// The gym record almost never changes between page loads.
// IMPORTANT: any code path that writes to the gyms table MUST call
// deleteCache(`user:${userId}:gym`) after the write.
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

export const getGymActiveStatus = cache(async (email: string) => {
  return cacheWrapper(`active_status:${email}`, 120, async () => {
    const supabase = await createClient()
    const { data: isActive, error } = await supabase.rpc('check_gym_active', { p_email: email })
    return { isActive, error }
  })
})

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
