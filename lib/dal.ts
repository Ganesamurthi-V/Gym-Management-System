import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
})

export const getGym = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, name, onboarding_completed, owner_id')
    .eq('owner_id', userId)
    .single()
  return { gym, error }
})
