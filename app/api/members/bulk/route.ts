import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'
import { isValidUUID } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/members/bulk
 *
 * Batch update member fields. Accepts array of { id, ...fields }.
 * All member IDs must belong to the authenticated user's gym.
 */
export const PATCH = withAuth('MEMBERS_BULK_PATCH', async (req: NextRequest, { supabase, gym }) => {
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
    if (!update.id || !isValidUUID(update.id)) {
      errors.push(`Invalid member id: ${update.id}`)
      continue
    }

    const fields: Record<string, unknown> = {}
    if (update.member_number !== undefined) fields.member_number = update.member_number
    if (update.name !== undefined) fields.name = typeof update.name === 'string' ? update.name.trim() : update.name
    if (update.phone !== undefined) fields.phone = typeof update.phone === 'string' ? update.phone.trim() : update.phone
    if (update.gender !== undefined) fields.gender = update.gender || null
    if (update.age !== undefined) fields.age = update.age
    if (update.area !== undefined) fields.area = typeof update.area === 'string' ? (update.area.trim() || null) : update.area
    if (update.pending_amount !== undefined) fields.pending_amount = update.pending_amount

    if (Object.keys(fields).length === 0) continue

    const { error } = await supabase
      .from('members')
      .update(fields)
      .eq('id', update.id)
      .eq('gym_id', gym.id)

    if (error) {
      errors.push(`Failed to update ${update.id}: ${error.message}`)
    }
  }

  await Promise.all([
    deleteCache(cacheKeys.membersList(gym.id)),
    deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
  ])

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
export const DELETE = withAuth('MEMBERS_BULK_DELETE', async (req: NextRequest, { supabase, gym }) => {
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
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: `Invalid UUID: ${id}` } },
        { status: 400 }
      )
    }
  }

  // Delete related records first (RLS + gym_id filter ensures authorization)
  await Promise.all([
    supabase.from('attendance').delete().in('member_id', ids),
    supabase.from('memberships').delete().in('member_id', ids),
  ])

  // Delete the members themselves (gym_id check ensures they belong to this gym)
  const { error } = await supabase.from('members').delete().in('id', ids).eq('gym_id', gym.id)
  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  await Promise.all([
    deleteCache(cacheKeys.membersList(gym.id)),
    deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
  ])

  return NextResponse.json({ success: true, data: { deleted: ids.length } })
})
