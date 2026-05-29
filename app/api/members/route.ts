import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

function mapSupabaseError(error: { code: string; message: string }) {
  if (error.code === 'PGRST116') return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' }
  if (error.code === '23505') return { status: 409, code: 'CONFLICT', message: 'Record already exists' }
  if (error.code === '23503') return { status: 400, code: 'FOREIGN_KEY_VIOLATION', message: 'Invalid reference' }
  if (error.code === '42501') return { status: 403, code: 'FORBIDDEN', message: 'Unauthorized' }
  return { status: 500, code: 'DATABASE_ERROR', message: error.message }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { allowed } = checkRateLimit(user.id, '/api/members', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    const { searchParams } = req.nextUrl
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
    const offset = parseInt(searchParams.get('offset') ?? '0')

    const { data, error, count } = await supabase
      .from('members')
      .select('id, name, phone, age, gender, member_number, legacy_member_id, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        duration_ms: Date.now() - startTime,
        total_count: count,
        has_more: (count ?? 0) > (offset + limit)
      }
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    const age = parseInt(body.age)
    const member_number = parseInt(body.member_number)
    if (isNaN(age) || isNaN(member_number)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Age and member_number must be integers' } }, { status: 400 })

    const { data, error } = await supabase
      .from('members')
      .insert({
        name: body.name,
        phone: body.phone,
        age,
        gender: body.gender,
        member_number,
        gym_id: body.gym_id,
        owner_id: user.id
      })
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
