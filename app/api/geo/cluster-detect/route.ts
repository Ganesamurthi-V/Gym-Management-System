import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectDatasetCluster } from '@/lib/geo/clustering'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' }
      }, { status: 401 })
    }

    const { allowed } = await checkRateLimit(user.id, '/api/geo/cluster-detect', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' }
      }, { status: 429 })
    }

    let body
    try {
      body = await req.json()
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' }
      }, { status: 400 })
    }

    const inputs: string[] = (body.inputs ?? []).filter(Boolean).slice(0, 500)

    const cluster = detectDatasetCluster(inputs)

    return NextResponse.json({
      success: true,
      data: {
        top_district: cluster.top_district,
        top_state: cluster.top_state,
        confidence: cluster.confidence,
      },
      meta: { duration_ms: Date.now() - startTime }
    })

  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: (err instanceof Error ? err.message : String(err)) || 'An unexpected error occurred' }
    }, { status: 500 })
  }
}
