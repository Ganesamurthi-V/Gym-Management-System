import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_MEMBER_LIMIT } from '@/lib/subscription-utils'

/**
 * Ids of a trial gym's first PLAN_MEMBER_LIMIT members in join order: the members the trial's
 * Member App and WhatsApp cover.
 *
 * Ordered by (created_at, id), not by counting rows with an earlier created_at: a bulk import gives
 * every row of the batch the same created_at, so a strict count ranked a whole 50-row batch below
 * the limit (40 existing + 50 imported = 90 covered). The member app gate and the WhatsApp cron
 * both use this, so they always agree on who is covered. Throws on a query error; callers fail
 * closed.
 */
export async function getTrialEligibleMemberIds(db: SupabaseClient, gymId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('members')
    .select('id')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(PLAN_MEMBER_LIMIT)
  if (error) throw error
  if (!data) throw new Error('trial eligibility: no data')
  return new Set(data.map(r => r.id as string))
}
