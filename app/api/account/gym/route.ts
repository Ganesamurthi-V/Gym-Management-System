import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'

export const dynamic = 'force-dynamic'

/**
 * GET /api/account/gym
 *
 * Returns the authenticated user's gym info including onboarding_data.
 */
export const GET = withAuth('ACCOUNT_GYM_GET', async (req: NextRequest, { supabase, gym, user }) => {
  // Fetch the full gym row with onboarding_data
  const { data, error } = await supabase
    .from('gyms')
    .select('id, name, onboarding_data, subscription_status, plan_type, trial_ends_at, subscription_ends_at')
    .eq('id', gym.id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})

/**
 * PATCH /api/account/gym
 *
 * Update gym fields (name, onboarding_data).
 */
export const PATCH = withAuth('ACCOUNT_GYM_PATCH', async (req: NextRequest, { supabase, gym, user }) => {
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = {}

  // Update gym name
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!/^[a-zA-Z0-9\s.]{2,60}$/.test(name)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Gym name must be 2–60 characters (letters, numbers, spaces, dots)' } },
        { status: 400 }
      )
    }
    updates.name = name
  }

  // Update onboarding_data (merge)
  if (body.onboarding_data !== undefined) {
    // Fetch current data and merge
    const { data: current } = await supabase
      .from('gyms')
      .select('onboarding_data')
      .eq('id', gym.id)
      .single()

    const existing = (current?.onboarding_data ?? {}) as Record<string, unknown>
    updates.onboarding_data = { ...existing, ...(body.onboarding_data as Record<string, unknown>) }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'No fields to update' } },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('gyms')
    .update(updates)
    .eq('id', gym.id)

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  // Bust gym cache
  await deleteCache(cacheKeys.gym(user.id))

  return NextResponse.json(
    { success: true, data: { updated: Object.keys(updates) } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
