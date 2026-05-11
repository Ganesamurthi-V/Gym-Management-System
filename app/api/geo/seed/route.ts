import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SEED_LOCALITIES_DEDUPED } from '@/lib/geo/seed-data'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export async function POST() {
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

    const { allowed } = checkRateLimit(user.id, '/api/geo/seed', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' }
      }, { status: 429 })
    }

    // Check if already seeded using count-only query
    const { count: existing, error: countError } = await supabase
      .from('geo_localities')
      .select('id', { count: 'exact', head: true })

    if (countError) {
      return NextResponse.json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: countError.message }
      }, { status: 500 })
    }

    if ((existing ?? 0) > 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: `Already seeded — ${existing} localities exist.`,
          count: existing,
        },
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    const BATCH = 100
    let inserted = 0
    const errors: string[] = []

    for (let i = 0; i < SEED_LOCALITIES_DEDUPED.length; i += BATCH) {
      const batch = SEED_LOCALITIES_DEDUPED.slice(i, i + BATCH).map(l => ({
        name: l.name,
        name_normalized: l.name_normalized,
        name_phonetic: l.name_phonetic,
        district: l.district,
        state: l.state,
        locality_type: l.locality_type,
        ...(l.geonames_id ? { geonames_id: l.geonames_id } : {}),
        is_active: true,
      }))

      // Use upsert with onConflict to ensure idempotency
      const { error, data } = await supabase
        .from('geo_localities')
        .upsert(batch, { onConflict: 'name_normalized,district,state', count: 'exact' })
        .select('id')

      if (error) {
        errors.push(`Batch ${i}–${i + BATCH}: ${error.message}`)
      } else {
        inserted += data?.length ?? batch.length
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message: errors.length === 0
          ? `Successfully seeded ${inserted} localities.`
          : `Seeded ${inserted} with ${errors.length} error(s).`,
        inserted,
        total: SEED_LOCALITIES_DEDUPED.length,
        errors,
      },
      meta: { duration_ms: Date.now() - startTime }
    })

  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'An unexpected error occurred' }
    }, { status: 500 })
  }
}
