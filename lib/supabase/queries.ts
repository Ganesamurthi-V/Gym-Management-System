import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Retrieves the Gym ID associated with the current user.
 * Assumes the user is the owner of the gym.
 * 
 * @param supabase The authenticated Supabase client
 * @param userId The UUID of the authenticated user
 * @returns The gym ID or null if not found
 */
export async function getGymForUser(supabase: SupabaseClient, userId: string) {
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, name') // Some places need name as well
    .eq('owner_id', userId)
    .single()

  if (error || !gym) {
    return null
  }

  return gym
}
