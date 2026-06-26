import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    // Rate limit import attempts
    const { allowed } = await checkRateLimit(user.id, '/api/import', 5) // 5 imports per minute
    if (!allowed) return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    // This route is a stub. The real import pipeline is at POST /api/import/confirm.
    // Returning 501 here prevents callers from accidentally sending data to this endpoint
    // and receiving a false success response while data is silently discarded.
    return NextResponse.json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Use POST /api/import/confirm to submit import rows.'
      }
    }, { status: 501 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
