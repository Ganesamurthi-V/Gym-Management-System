import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

function mapSupabaseError(error: { code: string; message: string }) {
  if (error.code === 'PGRST116') return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' }
  if (error.code === '23505') return { status: 409, code: 'CONFLICT', message: 'Record already exists' }
  if (error.code === '23503') return { status: 400, code: 'FOREIGN_KEY_VIOLATION', message: 'Invalid reference' }
  if (error.code === '42501') return { status: 403, code: 'FORBIDDEN', message: 'Unauthorized' }
  return { status: 500, code: 'DATABASE_ERROR', message: error.message }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 }) }

    const { rows, gym_id } = body

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Rows are required' } }, { status: 400 })
    }

    // Batch insert members
    const { data, error } = await supabase
      .from('members')
      .insert(rows.map((r: any) => ({
        ...r,
        gym_id,
        owner_id: user.id,
        age: parseInt(r.age),
        member_number: parseInt(r.member_number),
        legacy_member_id: r.legacy_member_id || null,
      })))
      .select('id')

    if (error) {
      const mapped = mapSupabaseError(error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    return NextResponse.json({
      success: true,
      data: { imported_count: data?.length ?? 0 },
      meta: { duration_ms: Date.now() - startTime }
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, { status: 500 })
  }
}
