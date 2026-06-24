import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

function mapSupabaseError(error: { code: string; message: string }) {
  if (error.code === 'PGRST116') return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' }
  if (error.code === '23505') return { status: 409, code: 'CONFLICT', message: 'Record already exists' }
  if (error.code === '23503') return { status: 400, code: 'FOREIGN_KEY_VIOLATION', message: 'Invalid reference' }
  if (error.code === '42501') return { status: 403, code: 'FORBIDDEN', message: 'Unauthorized' }
  return { status: 500, code: 'DATABASE_ERROR', message: 'A database error occurred' }
}

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

    const { data, error } = await supabase
      .from('members')
      .select('id, name, phone, age, gender, member_number, legacy_member_id, created_at')
      .eq('id', id)
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({ success: true, data, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, { status: 500 })
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

    const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    const { data: memberCheck } = await supabase.from('members').select('gym_id').eq('id', id).single()
    if (!memberCheck || memberCheck.gym_id !== gym.id) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized member access' } }, { status: 403 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    const updates: any = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.phone !== undefined) updates.phone = body.phone
    if (body.age !== undefined) {
      const age = parseInt(body.age)
      if (isNaN(age)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Age must be an integer' } }, { status: 400 })
      updates.age = age
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

    return NextResponse.json({ success: true, data, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, { status: 500 })
  }
}
