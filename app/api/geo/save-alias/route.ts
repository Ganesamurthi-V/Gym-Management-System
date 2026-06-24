import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput } from '@/lib/geo/normalizer'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

import { mapSupabaseError } from '@/lib/utils/errorMapper'

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

    const { allowed } = await checkRateLimit(user.id, '/api/geo/save-alias', ROUTE_LIMITS.SAVE_ALIAS)
    if (!allowed) {
      return NextResponse.json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' }
      }, { status: 429 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' }
      }, { status: 400 })
    }

    const rawInput: string = String(body.raw_input ?? '').slice(0, 200).trim()
    const canonicalName: string = String(body.canonical_name ?? '').slice(0, 200).trim()
    const gymId: string | undefined = body.gym_id

    if (!rawInput || !canonicalName) {
      return NextResponse.json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'raw_input and canonical_name are required' }
      }, { status: 400 })
    }

    const aliasNormalized = normalizeInput(rawInput)

    const { error: upsertError } = await supabase
      .from('geo_gym_aliases')
      .upsert(
        {
          alias_raw: rawInput,
          alias_normalized: aliasNormalized,
          canonical_name: canonicalName,
          gym_id: gymId ?? null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'gym_id,alias_normalized' }
      )

    if (upsertError) {
      const mapped = mapSupabaseError(upsertError)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    if (gymId) {
      void supabase
        .from('geo_review_queue')
        .update({
          status: 'resolved',
          resolved_to: canonicalName,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('gym_id', gymId)
        .eq('raw_input', rawInput)
        .eq('status', 'pending')
    }

    return NextResponse.json({
      success: true,
      data: { raw: rawInput, canonical: canonicalName },
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

    const gymId = req.nextUrl.searchParams.get('gym_id')

    const query = supabase
      .from('geo_gym_aliases')
      .select('id, alias_raw, canonical_name, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (gymId) query.eq('gym_id', gymId)

    const { data, error } = await query
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
