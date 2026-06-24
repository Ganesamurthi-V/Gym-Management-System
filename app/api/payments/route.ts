import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

function mapSupabaseError(error: { code: string; message: string }) {
  if (error.code === 'PGRST116') return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' }
  if (error.code === '23505') return { status: 409, code: 'CONFLICT', message: 'Record already exists' }
  if (error.code === '23503') return { status: 400, code: 'FOREIGN_KEY_VIOLATION', message: 'Invalid reference' }
  if (error.code === '42501') return { status: 403, code: 'FORBIDDEN', message: 'Unauthorized' }
  return { status: 500, code: 'DATABASE_ERROR', message: 'A database error occurred' }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { searchParams } = req.nextUrl
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

    const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    const query = supabase
      .from('memberships')
      .select('id, member_id, plan, amount, start_date, end_date, created_at, members(name)')
      .order('created_at', { ascending: false })
      .limit(limit)
      .eq('gym_id', gym.id)

    const { data, error } = await query

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({
      success: true,
      data,
      meta: { duration_ms: Date.now() - startTime, has_more: (data?.length ?? 0) >= limit }
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

    const amount = parseInt(body.amount)
    if (isNaN(amount) || amount < 0) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Amount must be a non-negative integer' } }, { status: 400 })

    const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
    if (!gym) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })

    const { data, error } = await supabase
      .from('memberships')
      .insert({
        member_id: body.member_id,
        gym_id: gym.id,
        plan: body.plan,
        amount,
        start_date: body.start_date,
        end_date: body.end_date,
      })
      .select('id, member_id, plan, amount')
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
