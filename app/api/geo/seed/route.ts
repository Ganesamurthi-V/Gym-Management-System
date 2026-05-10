import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SEED_LOCALITIES_DEDUPED } from '@/lib/geo/seed-data'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check if already seeded
  const { count: existing } = await supabase
    .from('geo_localities')
    .select('*', { count: 'exact', head: true })

  if ((existing ?? 0) > 0) {
    return NextResponse.json({
      message: `Already seeded — ${existing} localities exist. Delete them first to re-seed.`,
      count: existing,
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

    const { error, count } = await supabase
      .from('geo_localities')
      .insert(batch, { count: 'exact' })

    if (error) errors.push(`Batch ${i}–${i + BATCH}: ${error.message}`)
    else inserted += count ?? batch.length
  }

  return NextResponse.json({
    message: errors.length === 0
      ? `Successfully seeded ${inserted} localities.`
      : `Seeded ${inserted} with ${errors.length} error(s).`,
    inserted,
    total: SEED_LOCALITIES_DEDUPED.length,
    errors,
  })
}
