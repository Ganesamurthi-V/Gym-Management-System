import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const DAY_MS = 24 * 60 * 60 * 1000
const BATCH = 1000
/** Bounds one daily run (per category) so a large backlog cannot hold the cron; the rest goes next day. */
const MAX_BATCHES = 20

const RULES: { states: string[]; days: number }[] = [
  // Rows that never turned into attendance are only useful for debugging a short while.
  { states: ['unmapped', 'stale', 'duplicate', 'error', 'blocked'], days: 30 },
  { states: ['applied'], days: 365 },
]

/** Deletes old raw punches (by created_at). Attendance rows are separate and untouched. */
export async function purgeOldDevicePunches(db: SupabaseClient, now: Date = new Date()): Promise<{ deleted: number }> {
  let deleted = 0
  for (const rule of RULES) {
    const cutoff = new Date(now.getTime() - rule.days * DAY_MS).toISOString()
    for (let i = 0; i < MAX_BATCHES; i++) {
      const { data: ids, error } = await db
        .from('device_punches').select('id').in('state', rule.states).lt('created_at', cutoff).limit(BATCH)
      if (error) throw new Error(`device punch retention lookup failed: ${error.message}`)
      if (!ids || ids.length === 0) break
      const { error: delError } = await db.from('device_punches').delete().in('id', ids.map(r => r.id as string))
      if (delError) throw new Error(`device punch retention delete failed: ${delError.message}`)
      deleted += ids.length
      if (ids.length < BATCH) break
    }
  }
  return { deleted }
}
