import type { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess, handleSupabaseError, isValidUUID } from '@/lib/api/withAuth'
import { giveRewardSchema } from '@/lib/gamification/events'

export const dynamic = 'force-dynamic'

/**
 * POST /api/gamification/events/[id]/give   body: { memberId }
 * Owner marks the item reward as handed over. Idempotent: a second call returns
 * the original timestamp. Scoped by the server-resolved gym; RLS plus the
 * column grant (only reward_given_at is updatable) back it up.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return apiError(400, 'BAD_REQUEST', 'Invalid event id')

  return withAuth('GAMIFICATION_EVENT_GIVE', async (r, { gym, supabase }) => {
    let body: unknown
    try {
      body = await r.json()
    } catch {
      return apiError(400, 'BAD_REQUEST', 'Invalid JSON body')
    }
    const parsed = giveRewardSchema.safeParse(body)
    if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', 'memberId is required')
    const { memberId } = parsed.data

    const { data: row, error } = await supabase
      .from('gym_event_completions')
      .select('id, reward_text, reward_given_at')
      .eq('event_id', id)
      .eq('member_id', memberId)
      .eq('gym_id', gym.id)
      .maybeSingle()
    if (error) return handleSupabaseError(error)
    if (!row) return apiError(404, 'NOT_FOUND', 'This member has not completed the event')
    if (!row.reward_text) return apiError(400, 'NO_ITEM_REWARD', 'This event has no item reward to hand over')

    if (row.reward_given_at) {
      return apiSuccess({ memberId, rewardGivenAt: row.reward_given_at as string })
    }

    // `is null` guard: two simultaneous taps stamp once and both succeed.
    const { data: updated, error: updateError } = await supabase
      .from('gym_event_completions')
      .update({ reward_given_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('gym_id', gym.id)
      .is('reward_given_at', null)
      .select('reward_given_at')
      .maybeSingle()
    if (updateError) return handleSupabaseError(updateError)

    if (!updated) {
      const { data: again } = await supabase
        .from('gym_event_completions')
        .select('reward_given_at')
        .eq('id', row.id)
        .eq('gym_id', gym.id)
        .maybeSingle()
      return apiSuccess({ memberId, rewardGivenAt: (again?.reward_given_at as string | null) ?? null })
    }
    return apiSuccess({ memberId, rewardGivenAt: updated.reward_given_at as string })
  })(req)
}
