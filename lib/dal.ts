import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'

export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
})

export const getGym = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, name, onboarding_completed, owner_id, created_at, onboarding_data')
    .eq('owner_id', userId)
    .single()
  return { gym, error }
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
