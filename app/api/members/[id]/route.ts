import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/members/[id]', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

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
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/members/[id]', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    const { data: memberCheck } = await supabase.from('members').select('gym_id').eq('id', id).single()
    if (!memberCheck || memberCheck.gym_id !== gym.id) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    const updates: Record<string, string | number | null> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.phone !== undefined) updates.phone = body.phone
    if (body.age !== undefined) {
      const age = parseInt(body.age)
      if (isNaN(age)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Age must be an integer' } }, { status: 400 })
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
      updates.area = typeof body.area === 'string' ? (body.area.trim() || null) : null
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
      const num = parseInt(body.member_number)
      if (isNaN(num)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'member_number must be an integer' } }, { status: 400 })
      updates.member_number = num
    }

    const { data, error } = await supabase
      .from('members')
      .update(updates)
      .eq('id', id)
      .select('id, name, phone, member_number')
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await deleteCache(cacheKeys.membersList(gym.id))
    await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))

    return NextResponse.json({ success: true, data, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/members/[id]', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    // Verify the member belongs to this gym
    const { data: memberCheck } = await supabase.from('members').select('gym_id').eq('id', id).single()
    if (!memberCheck || memberCheck.gym_id !== gym.id) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })
    }

    // Delete attendance and memberships in parallel, then the member row
    const [a1, a2] = await Promise.all([
      supabase.from('attendance').delete().eq('member_id', id),
      supabase.from('memberships').delete().eq('member_id', id),
    ])
    if (a1.error) {
      const mapped = mapSupabaseError(a1.error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }
    if (a2.error) {
      const mapped = mapSupabaseError(a2.error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    const { error } = await supabase.from('members').delete().eq('id', id)
    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await Promise.all([
      deleteCache(cacheKeys.membersList(gym.id)),
      deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
    ])

    return NextResponse.json({ success: true, data: { id }, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
