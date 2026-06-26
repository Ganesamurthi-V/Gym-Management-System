import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'


export async function GET(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    const { searchParams } = req.nextUrl
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

    const gym = await getGymForUser(supabase, user.id)
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
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

    const paymentMode = body.payment_mode
    if (!['cash', 'upi', 'card'].includes(paymentMode)) return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid payment mode' } }, { status: 400 })

    const gym = await getGymForUser(supabase, user.id)
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
        payment_mode: paymentMode,
      })
      .select('id, member_id, plan, amount')
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    await deleteCache(cacheKeys.payments12mo(gym.id))
    await deleteCache(cacheKeys.paymentsAll(gym.id))
    await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))

    return NextResponse.json({ success: true, data, meta: { duration_ms: Date.now() - startTime } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
