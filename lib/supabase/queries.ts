import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Retrieves the gym associated with the current user.
 *
 * **For use in API Route Handlers only** — accepts an already-created Supabase client
 * so no second client instantiation is needed within the same request.
 *
 * For Server Components and Server Actions, use `getGym()` from `lib/dal.ts` instead,
 * which is memoised with React.cache() for deduplication within the same render.
 *
 * @param supabase The authenticated Supabase client (already created in the route handler)
 * @param userId The UUID of the authenticated user
 * @returns The gym row (id, name) or null if not found
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
