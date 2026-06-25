import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput } from '@/lib/geo/normalizer'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

import { mapSupabaseError } from '@/lib/utils/errorMapper'

export async function GET(req: NextRequest) {
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

    const { allowed } = await checkRateLimit(user.id, '/api/geo/search', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' }
      }, { status: 429 })
    }

    const { searchParams } = req.nextUrl
    const q = searchParams.get('q') ?? ''
    const limitInput = parseInt(searchParams.get('limit') ?? '8')
    const limit = isNaN(limitInput) ? 8 : Math.min(limitInput, 50)

    if (q.length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    const normalized = normalizeInput(q)

    const { data, error } = await supabase
      .rpc('search_localities_autocomplete', {
        query_text: normalized,
        prefix_text: normalized,
        result_limit: limit,
      })

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      meta: { duration_ms: Date.now() - startTime }
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message }
    }, { status: 500 })
  }
}
