import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError, passesCsrf, csrfRejected, boundedInt, boundedText, UUID_RE } from '@/app/api/_guard'
import { recordOwnerAction } from '@/lib/activity/record'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'
import { assertGymWritable } from '@/lib/subscriptionGuard'


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid member id' } }, { status: 400 })
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/members/[id]', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    // Reads are refused too: a lapsed or banned owner must not keep reading member data.
    const readOnly = assertGymWritable(gym)
    if (readOnly) return readOnly

    const { data, error } = await supabase
      .from('members')
      .select('id, name, phone, age, gender, member_number, legacy_member_id, created_at')
      .eq('id', id)
      .eq('gym_id', gym.id)
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({ success: true, data, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: unknown) {
    console.error('[members/[id]] unhandled', err)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  try {
    if (!passesCsrf(req)) return csrfRejected()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid member id' } }, { status: 400 })
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/members/[id]', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    const readOnly = assertGymWritable(gym)
    if (readOnly) return readOnly

    const { data: memberCheck } = await supabase.from('members').select('gym_id').eq('id', id).eq('gym_id', gym.id).maybeSingle()
    if (!memberCheck) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid body' } }, { status: 400 })
    }

    // Explicit allowlist: only these columns can change through this route.
    const updates: Record<string, string | number | null> = {}
    if (body.name !== undefined) {
      const name = boundedText(body.name, 100)
      if (!name) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Name must be 1-100 characters' } }, { status: 400 })
      updates.name = name
    }
    if (body.phone !== undefined) {
      const phone = boundedText(body.phone, 20)
      if (!phone) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Phone must be 1-20 characters' } }, { status: 400 })
      updates.phone = phone
    }
    if (body.age !== undefined) {
      const age = boundedInt(body.age, 0, 120)
      if (age === null) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Age must be an integer between 0 and 120' } }, { status: 400 })
      updates.age = age
    }
    if (body.gender !== undefined) {
      if (body.gender === null || body.gender === '') {
        updates.gender = null
      } else if (!['male', 'female', 'other'].includes(body.gender)) {
        return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid gender value' } }, { status: 400 })
      } else {
        updates.gender = body.gender
      }
    }
    if (body.area !== undefined) {
      updates.area = typeof body.area === 'string' ? (body.area.trim().slice(0, 100) || null) : null
    }
    if (body.date_of_birth !== undefined) {
      if (body.date_of_birth === null || body.date_of_birth === '') {
        updates.date_of_birth = null
      } else {
        const dob = String(body.date_of_birth).slice(0, 10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(Date.parse(dob))) {
          return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'date_of_birth must be YYYY-MM-DD' } }, { status: 400 })
        }
        updates.date_of_birth = dob
      }
    }
    if (body.member_number !== undefined) {
      const num = boundedInt(body.member_number, 1, 1_000_000_000)
      if (num === null) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'member_number must be a positive integer' } }, { status: 400 })
      updates.member_number = num
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No fields to update' } }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('members')
      .update(updates)
      .eq('id', id)
      .eq('gym_id', gym.id)
      .select('id, name, phone, member_number')
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

    recordOwnerAction(supabase, req, 'MEMBERS_UPDATE')
    return NextResponse.json({ success: true, data, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: unknown) {
    console.error('[members/[id]] unhandled', err)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  try {
    if (!passesCsrf(req)) return csrfRejected()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid member id' } }, { status: 400 })
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/members/[id]', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    const readOnly = assertGymWritable(gym)
    if (readOnly) return readOnly

    // Verify the member belongs to this gym
    const { data: memberCheck } = await supabase.from('members').select('gym_id').eq('id', id).eq('gym_id', gym.id).maybeSingle()
    if (!memberCheck) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })
    }

    // Delete attendance and memberships in parallel, then the member row
    const [a1, a2] = await Promise.all([
      supabase.from('attendance').delete().eq('member_id', id).eq('gym_id', gym.id),
      supabase.from('memberships').delete().eq('member_id', id).eq('gym_id', gym.id),
    ])
    if (a1.error) {
      const mapped = mapSupabaseError(a1.error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }
    if (a2.error) {
      const mapped = mapSupabaseError(a2.error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    const { error } = await supabase.from('members').delete().eq('id', id).eq('gym_id', gym.id)
    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

    recordOwnerAction(supabase, req, 'MEMBERS_DELETE')
    return NextResponse.json({ success: true, data: { id }, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: unknown) {
    console.error('[members/[id]] unhandled', err)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 })
  }
}
