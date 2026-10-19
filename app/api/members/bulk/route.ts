import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'
import { isValidUUID } from '@/lib/api/withAuth'
import { boundedInt, boundedText } from '@/app/api/_guard'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/members/bulk
 *
 * Batch update member fields. Accepts array of { id, ...fields }.
 * All member IDs must belong to the authenticated user's gym.
 */
export const PATCH = withAuth('MEMBERS_BULK_PATCH', async (req: NextRequest, { supabase, gym, log }) => {
  let body: { updates?: Array<{ id: string; member_number?: number; name?: string; phone?: string; gender?: string | null; age?: number | null; area?: string | null; pending_amount?: number }> }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const updates = body.updates
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'updates array is required' } },
      { status: 400 }
    )
  }

  if (updates.length > 200) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Too many updates (max 200)' } },
      { status: 400 }
    )
  }

  // Process each update
  const errors: string[] = []
  for (const update of updates) {
    if (!update || typeof update.id !== 'string' || !isValidUUID(update.id)) {
      errors.push('Invalid member id')
      continue
    }

    // Explicit allowlist with type/range checks; a bad field skips the row
    // instead of writing garbage (names, ages and balances feed reports).
    const fields: Record<string, unknown> = {}
    let invalid = false
    if (update.member_number !== undefined) {
      const v = boundedInt(update.member_number, 1, 1_000_000_000)
      if (v === null) invalid = true; else fields.member_number = v
    }
    if (update.name !== undefined) {
      const v = boundedText(update.name, 100)
      if (v === null) invalid = true; else fields.name = v
    }
    if (update.phone !== undefined) {
      const v = boundedText(update.phone, 20)
      if (v === null) invalid = true; else fields.phone = v
    }
    if (update.gender !== undefined) {
      if (update.gender && !['male', 'female', 'other'].includes(update.gender)) invalid = true
      else fields.gender = update.gender || null
    }
    if (update.age !== undefined) {
      if (update.age === null) fields.age = null
      else {
        const v = boundedInt(update.age, 0, 120)
        if (v === null) invalid = true; else fields.age = v
      }
    }
    if (update.area !== undefined) {
      if (update.area !== null && typeof update.area !== 'string') invalid = true
      else fields.area = typeof update.area === 'string' ? (update.area.trim().slice(0, 100) || null) : null
    }
    if (update.pending_amount !== undefined) {
      const v = boundedInt(update.pending_amount, 0, 10_000_000)
      if (v === null) invalid = true; else fields.pending_amount = v
    }
    if (invalid) {
      errors.push(`Invalid field values for ${update.id}`)
      continue
    }

    if (Object.keys(fields).length === 0) continue

    const { error } = await supabase
      .from('members')
      .update(fields)
      .eq('id', update.id)
      .eq('gym_id', gym.id)

    if (error) {
      log.error('Bulk member update failed', error)
      errors.push(`Failed to update ${update.id}`)
    }
  }

  await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

  if (errors.length > 0) {
    return NextResponse.json(
      { success: false, error: { code: 'PARTIAL_FAILURE', message: errors.join('; ') }, data: { updated: updates.length - errors.length, failed: errors.length } },
      { status: 207 }
    )
  }

  return NextResponse.json({ success: true, data: { updated: updates.length } })
})

/**
 * DELETE /api/members/bulk
 *
 * Batch delete members. Accepts { ids: string[] }.
 * All member IDs must belong to the authenticated user's gym.
 */
export const DELETE = withAuth('MEMBERS_BULK_DELETE', async (req: NextRequest, { supabase, gym, log }) => {
  let body: { ids?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'ids array is required' } },
      { status: 400 }
    )
  }

  if (ids.length > 200) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Too many ids (max 200)' } },
      { status: 400 }
    )
  }

  // Validate all IDs are UUIDs
  for (const id of ids) {
    if (typeof id !== 'string' || !isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid member id in ids' } },
        { status: 400 }
      )
    }
  }

  // Delete related records first, scoped to this gym so a foreign member id in
  // the list can never touch another gym's rows even if RLS were relaxed.
  const [att, ms] = await Promise.all([
    supabase.from('attendance').delete().in('member_id', ids).eq('gym_id', gym.id),
    supabase.from('memberships').delete().in('member_id', ids).eq('gym_id', gym.id),
  ])
  if (att.error || ms.error) {
    log.error('Bulk member delete: related rows failed', att.error ?? ms.error)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not delete the members. Please try again.' } },
      { status: 500 }
    )
  }

  // Delete the members themselves (gym_id check ensures they belong to this gym)
  const { error } = await supabase.from('members').delete().in('id', ids).eq('gym_id', gym.id)
  if (error) {
    log.error('Bulk member delete failed', error)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not delete the members. Please try again.' } },
      { status: 500 }
    )
  }

  await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

  return NextResponse.json({ success: true, data: { deleted: ids.length } })
})
