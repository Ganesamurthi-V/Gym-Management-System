import type { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiError, apiSuccess, handleSupabaseError, isValidUUID, type AuthContext } from '@/lib/api/withAuth'
import { EVENT_LIMITS } from '@/lib/gamification/constants'
import {
  createEventSchema,
  EVENT_LOCKED_FIELDS,
  updateEventSchema,
  type GymEvent,
  type UpdateEventInput,
} from '@/lib/gamification/events'
import { GYM_EVENT_COLUMNS, mapGymEventRow, type GymEventRow } from '@/lib/gamification/mapEvents'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** withAuth has no route-params slot, so the id is closed over per request. */
function route(
  name: string,
  handler: (req: NextRequest, ctx: AuthContext, id: string) => Promise<NextResponse>,
) {
  return async (req: NextRequest, { params }: Params) => {
    const { id } = await params
    if (!isValidUUID(id)) return apiError(400, 'BAD_REQUEST', 'Invalid event id')
    return withAuth(name, (r, ctx) => handler(r, ctx, id))(req)
  }
}

async function loadEvent(ctx: AuthContext, id: string) {
  const { data, error } = await ctx.supabase
    .from('gym_events')
    .select(GYM_EVENT_COLUMNS)
    .eq('id', id)
    .eq('gym_id', ctx.gym.id)
    .maybeSingle()
  return { event: data ? mapGymEventRow(data as unknown as GymEventRow) : null, error }
}

async function completionCount(ctx: AuthContext, id: string) {
  const { count, error } = await ctx.supabase
    .from('gym_event_completions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('gym_id', ctx.gym.id)
  return { count: count ?? 0, error }
}

/**
 * GET /api/gamification/events/[id]
 * Event plus everyone who completed it (owner scope: name and phone are fine).
 */
export const GET = route('GAMIFICATION_EVENT_GET', async (_req, ctx, id) => {
  const { event, error } = await loadEvent(ctx, id)
  if (error) return handleSupabaseError(error)
  if (!event) return apiError(404, 'NOT_FOUND', 'Event not found')

  const { data: rows, error: compError } = await ctx.supabase
    .from('gym_event_completions')
    .select('member_id, completed_at, xp_awarded, reward_text, reward_given_at')
    .eq('event_id', id)
    .eq('gym_id', ctx.gym.id)
    .order('completed_at', { ascending: false })
  if (compError) return handleSupabaseError(compError)

  const memberIds = (rows ?? []).map(r => r.member_id as string)
  const names = new Map<string, { name: string; phone: string }>()
  if (memberIds.length > 0) {
    const { data: members, error: memberError } = await ctx.supabase
      .from('members')
      .select('id, name, phone')
      .eq('gym_id', ctx.gym.id)
      .in('id', memberIds)
    if (memberError) return handleSupabaseError(memberError)
    for (const m of members ?? []) names.set(m.id, { name: m.name, phone: m.phone })
  }

  const completions = (rows ?? []).map(r => ({
    memberId: r.member_id as string,
    memberName: names.get(r.member_id as string)?.name ?? 'Member',
    memberPhone: names.get(r.member_id as string)?.phone ?? null,
    completedAt: r.completed_at as string,
    xpAwarded: r.xp_awarded as number,
    rewardText: (r.reward_text as string | null) ?? null,
    rewardGivenAt: (r.reward_given_at as string | null) ?? null,
  }))

  return apiSuccess({ event, completions })
})

const PATCH_TO_COLUMN: Record<keyof UpdateEventInput, string> = {
  title: 'title',
  description: 'description',
  goalType: 'goal_type',
  goalTarget: 'goal_target',
  minSessionMinutes: 'min_session_minutes',
  sessionFilter: 'session_filter',
  startDate: 'start_date',
  endDate: 'end_date',
  rewardXp: 'reward_xp',
  rewardText: 'reward_text',
  isActive: 'is_active',
}

/**
 * PATCH /api/gamification/events/[id]
 * Any subset of the create fields. Once a member has completed the event the
 * goal, target, session length/filter and start date are locked (409
 * EVENT_LOCKED); title, description, rewards, end date and isActive stay
 * editable. Reward edits only affect FUTURE completions (history is snapshotted).
 */
export const PATCH = route('GAMIFICATION_EVENT_PATCH', async (req, ctx, id) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Invalid JSON body')
  }

  const parsed = updateEventSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid event')
  }
  const patch = parsed.data
  if (Object.keys(patch).length === 0) return apiError(400, 'VALIDATION_ERROR', 'Nothing to update')

  const { event: current, error } = await loadEvent(ctx, id)
  if (error) return handleSupabaseError(error)
  if (!current) return apiError(404, 'NOT_FOUND', 'Event not found')

  const { count, error: countError } = await completionCount(ctx, id)
  if (countError) return handleSupabaseError(countError)

  if (count > 0) {
    const changed = EVENT_LOCKED_FIELDS.filter(
      f => f in patch && patch[f] !== current[f as keyof GymEvent],
    )
    if (changed.length > 0) {
      return apiError(
        409,
        'EVENT_LOCKED',
        'The goal and start date cannot change after a member has completed this event. End it and create a new one.',
      )
    }
  }

  // Cross-field rules must hold for the merged result, not just the patch.
  const merged = createEventSchema.safeParse({ ...current, ...patch })
  if (!merged.success) {
    return apiError(400, 'VALIDATION_ERROR', merged.error.issues[0]?.message ?? 'Invalid event')
  }

  if (patch.isActive === true && !current.isActive) {
    const { count: active, error: activeError } = await ctx.supabase
      .from('gym_events')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', ctx.gym.id)
      .eq('is_active', true)
    if (activeError) return handleSupabaseError(activeError)
    if ((active ?? 0) >= EVENT_LIMITS.maxActiveEvents) {
      return apiError(409, 'EVENT_LIMIT', `You can have at most ${EVENT_LIMITS.maxActiveEvents} active events`)
    }
  }

  // Write the merged, normalised values for the touched keys only.
  const update: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as Array<keyof UpdateEventInput>) {
    update[PATCH_TO_COLUMN[key]] = merged.data[key]
  }

  const { data, error: updateError } = await ctx.supabase
    .from('gym_events')
    .update(update)
    .eq('id', id)
    .eq('gym_id', ctx.gym.id)
    .select(GYM_EVENT_COLUMNS)
    .single()

  if (updateError) {
    if (updateError.code === '23514') {
      const locked = /locked/.test(updateError.message)
      return apiError(
        409,
        locked ? 'EVENT_LOCKED' : 'EVENT_LIMIT',
        locked
          ? 'The goal and start date cannot change after a member has completed this event.'
          : `You can have at most ${EVENT_LIMITS.maxActiveEvents} active events`,
      )
    }
    return handleSupabaseError(updateError)
  }

  const event = mapGymEventRow(data as unknown as GymEventRow)

  // An extended window or a re-activated event may already be met by members.
  let newCompletions = 0
  if (event.isActive) {
    const { data: n, error: evalError } = await ctx.supabase.rpc('evaluate_gym_events', { p_event_id: id })
    if (evalError) ctx.log.error('evaluate_gym_events failed after edit', evalError)
    else newCompletions = typeof n === 'number' ? n : 0
  }

  return apiSuccess({ event, newCompletions })
})

/**
 * DELETE /api/gamification/events/[id]
 * Hard delete when nobody completed it; otherwise deactivate so the history
 * (and pending item rewards) survive.
 */
export const DELETE = route('GAMIFICATION_EVENT_DELETE', async (_req, ctx, id) => {
  const { event, error } = await loadEvent(ctx, id)
  if (error) return handleSupabaseError(error)
  if (!event) return apiError(404, 'NOT_FOUND', 'Event not found')

  const { count, error: countError } = await completionCount(ctx, id)
  if (countError) return handleSupabaseError(countError)

  if (count > 0) {
    const { error: offError } = await ctx.supabase
      .from('gym_events')
      .update({ is_active: false })
      .eq('id', id)
      .eq('gym_id', ctx.gym.id)
    if (offError) return handleSupabaseError(offError)
    return apiSuccess({ id, mode: 'deactivated' })
  }

  const { error: delError } = await ctx.supabase
    .from('gym_events')
    .delete()
    .eq('id', id)
    .eq('gym_id', ctx.gym.id)
  if (delError) return handleSupabaseError(delError)
  return apiSuccess({ id, mode: 'deleted' })
})
