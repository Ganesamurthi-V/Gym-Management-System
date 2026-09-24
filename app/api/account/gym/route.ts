import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const log = logger.child({ component: 'ACCOUNT_GYM' })

type DatabaseError = { code?: string; message?: string; details?: string; hint?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isMissingContactColumn(error: DatabaseError | null): boolean {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  const contact = text.includes("'city'") || text.includes('"city"') ||
    text.includes("'phone'") || text.includes('"phone"')
  return contact && (error.code === 'PGRST204' || text.includes('schema cache'))
}

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
  try {
    const parsed: unknown = await req.json()
    if (!isRecord(parsed)) throw new Error('Request body is not an object')
    body = parsed
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'We could not read your changes. Refresh the page and try again.' } },
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
    if (!isRecord(body.onboarding_data)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'We could not read your gym details. Refresh the page and try again.' } },
        { status: 400 },
      )
    }

    // Fetch current data and merge. A read failure cannot be treated as an empty object:
    // doing that would overwrite every onboarding key not present in this small patch.
    const { data: current, error: readError } = await supabase
      .from('gyms')
      .select('onboarding_data')
      .eq('id', gym.id)
      .single()

    if (readError || !current) {
      log.error('Could not load gym before merging account changes', {
        code: readError?.code,
        error: readError?.message ?? 'No gym row returned',
      })
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: 'We could not load your gym details. Please try again.' } },
        { status: 500 },
      )
    }

    const existing = (current.onboarding_data ?? {}) as Record<string, unknown>
    const patch = body.onboarding_data
    updates.onboarding_data = { ...existing, ...patch }

    /*
      Mirror the fields that have a real column onto that column.

      `gyms.phone` and `gyms.city` have both existed in the schema since the start under
      "Basic info" and neither was ever written — the values lived only inside this JSONB
      blob, which is why the admin panel could not show a gym's phone without knowing the
      shape of another app's onboarding data. Onboarding now writes both, and so must this,
      or a column goes stale the moment an owner edits the field here and the admin panel
      keeps showing the original onboarding value forever. That is worse than showing
      nothing, because it looks current.

      `in` rather than a truthiness check, so clearing a field propagates as null instead of
      leaving the old value stranded in the column.
    */
    for (const key of ['phone', 'city'] as const) {
      if (key in patch) {
        const value = patch[key]
        updates[key] = typeof value === 'string' && value.trim() ? value.trim() : null
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'No fields to update' } },
      { status: 400 }
    )
  }

  let { error } = await supabase
    .from('gyms')
    .update(updates)
    .eq('id', gym.id)

  if (isMissingContactColumn(error)) {
    /*
      Compatibility path for databases that have not applied the contact-column migration.
      The same city/phone values are already inside onboarding_data, so retrying without the
      mirrors preserves the edit instead of blocking it with PostgREST's schema-cache error.
    */
    log.warn('Contact columns unavailable; saving account changes without mirrors', {
      code: error?.code,
      missingColumns: 'city_or_phone',
    })
    const fallbackUpdates = { ...updates }
    delete fallbackUpdates.phone
    delete fallbackUpdates.city

    const fallback = await supabase
      .from('gyms')
      .update(fallbackUpdates)
      .eq('id', gym.id)
    error = fallback.error
  }

  if (error) {
    log.error('Could not save gym account changes', {
      code: error.code,
      error: error.message,
      details: error.details,
      hint: error.hint,
    })
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'We could not save your gym details right now. Please try again.' } },
      { status: 500 }
    )
  }

  // Bust gym cache. The write has already succeeded, so cache cleanup is best-effort and
  // must not turn a successful edit into an error response.
  try {
    await deleteCache(cacheKeys.gym(user.id))
  } catch (cacheError) {
    log.warn('Gym account changes saved but cache cleanup failed', {
      error: cacheError instanceof Error ? cacheError.message : String(cacheError),
    })
  }

  return NextResponse.json(
    { success: true, data: { updated: Object.keys(updates) } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
