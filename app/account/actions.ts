'use server'

import { createClient } from '@/lib/supabase/server'
import { deleteCache } from '@/lib/cache'

/**
 * Invalidates the Redis cache for a gym row after a write to the gyms table.
 * Must be called after any supabase.from('gyms').update() or .upsert() from
 * client components (which cannot import server-only Redis modules directly).
 *
 * Cache key mirrors the one in lib/dal.ts getGym: `user:${userId}:gym`
 */
export async function invalidateGymCache(): Promise<void> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return

  await deleteCache(`user:${session.user.id}:gym`)
}
