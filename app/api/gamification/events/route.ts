import { withAuth, apiError, apiSuccess } from '@/lib/api/withAuth'
import { handleSupabaseError } from '@/app/api/_guard'
import { EVENT_LIMITS } from '@/lib/gamification/constants'
import { createEventSchema } from '@/lib/gamification/events'
import { GYM_EVENT_COLUMNS, mapGymEventRow, type GymEventRow } from '@/lib/gamification/mapEvents'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gamification/events
 * Owner: every event of the gym (newest first) with completion counts.
 * `gym` comes from the session, never from the request.
 */
export const GET = withAuth('GAMIFICATION_EVENTS_GET', async (_req, { gym, supabase }) => {
  const [eventsRes, completionsRes] = await Promise.all([
    supabase
      .from('gym_events')
      .select(GYM_EVENT_COLUMNS)
      .eq('gym_id', gym.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('gym_event_completions')
      .select('event_id, reward_text, reward_given_at')
      .eq('gym_id', gym.id),
  ])

  if (eventsRes.error) return handleSupabaseError(eventsRes.error)
  if (completionsRes.error) return handleSupabaseError(completionsRes.error)

  // Counted here (not a SQL group-by) because a gym has at most a few hundred
  // completions and PostgREST has no cheap grouped count.
  const counts = new Map<string, { completed: number; pendingRewards: number }>()
  for (const c of completionsRes.data ?? []) {
    const entry = counts.get(c.event_id) ?? { completed: 0, pendingRewards: 0 }
    entry.completed++
    if (c.reward_text && !c.reward_given_at) entry.pendingRewards++
    counts.set(c.event_id, entry)
  }

  const events = ((eventsRes.data ?? []) as unknown as GymEventRow[]).map(row => ({
    ...mapGymEventRow(row),
    completionCount: counts.get(row.id)?.completed ?? 0,
    pendingRewardCount: counts.get(row.id)?.pendingRewards ?? 0,
  }))

  return apiSuccess({ events })
})

/**
 * POST /api/gamification/events
 * Creates an event, then evaluates every member so a back-dated window awards
 * immediately.
 */
export const POST = withAuth('GAMIFICATION_EVENTS_POST', async (req, { gym, supabase, log }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Invalid JSON body')
  }

  const parsed = createEventSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid event')
  }
  const v = parsed.data

  if (v.isActive) {
    const { count, error: countError } = await supabase
      .from('gym_events')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gym.id)
      .eq('is_active', true)
    if (countError) return handleSupabaseError(countError)
    if ((count ?? 0) >= EVENT_LIMITS.maxActiveEvents) {
      return apiError(409, 'EVENT_LIMIT', `You can have at most ${EVENT_LIMITS.maxActiveEvents} active events`)
    }
  }

  const { data, error } = await supabase
    .from('gym_events')
    .insert({
      gym_id: gym.id,
      title: v.title,
      description: v.description,
      goal_type: v.goalType,
      goal_target: v.goalTarget,
      min_session_minutes: v.minSessionMinutes,
      session_filter: v.sessionFilter,
      start_date: v.startDate,
      end_date: v.endDate,
      reward_xp: v.rewardXp,
      reward_text: v.rewardText,
      is_active: v.isActive,
    })
    .select(GYM_EVENT_COLUMNS)
    .single()

  if (error) {
    // The DB trigger enforces the limit too (race between two creates).
    if (error.code === '23514' && /at most 20/.test(error.message)) {
      return apiError(409, 'EVENT_LIMIT', `You can have at most ${EVENT_LIMITS.maxActiveEvents} active events`)
    }
    return handleSupabaseError(error)
  }

  const event = mapGymEventRow(data as unknown as GymEventRow)

  // The event exists either way; a failed evaluation is repaired by the next
  // attendance write or an edit, so it must not turn a successful create into an error.
  let newCompletions = 0
  if (event.isActive) {
    const { data: n, error: evalError } = await supabase.rpc('evaluate_gym_events', { p_event_id: event.id })
    if (evalError) log.error('evaluate_gym_events failed after create', evalError)
    else newCompletions = typeof n === 'number' ? n : 0
  }

  return apiSuccess({ event, newCompletions }, 201)
})
