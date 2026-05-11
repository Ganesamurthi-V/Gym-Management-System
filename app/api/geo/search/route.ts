import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput } from '@/lib/geo/normalizer'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

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

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' }
      }, { status: 401 })
    }

    const { allowed } = checkRateLimit(user.id, '/api/geo/search', ROUTE_LIMITS.DEFAULT)
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

  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'An unexpected error occurred' }
    }, { status: 500 })
  }
}
