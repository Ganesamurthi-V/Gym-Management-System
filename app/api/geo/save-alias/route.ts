import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput } from '@/lib/geo/normalizer'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const rawInput: string = String(body.raw_input ?? '').slice(0, 200).trim()
  const canonicalName: string = String(body.canonical_name ?? '').slice(0, 200).trim()
  const gymId: string | undefined = body.gym_id

  if (!rawInput || !canonicalName) {
    return NextResponse.json({ error: 'raw_input and canonical_name are required' }, { status: 400 })
  }

  const aliasNormalized = normalizeInput(rawInput)

  const { error } = await supabase
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
      { onConflict: 'alias_normalized,gym_id' }
    )

  if (error) {
    console.error('[save-alias] DB error saving alias')
    return NextResponse.json({ error: 'Failed to save alias' }, { status: 500 })
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

  return NextResponse.json({ success: true, alias: { raw: rawInput, canonical: canonicalName } })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gymId = req.nextUrl.searchParams.get('gym_id')

  const query = supabase
    .from('geo_gym_aliases')
    .select('id, alias_raw, canonical_name, created_at')
    .order('created_at', { ascending: false })

  if (gymId) query.eq('gym_id', gymId)

  const { data, error } = await query.limit(500)
  if (error) return NextResponse.json({ error: 'Failed to fetch aliases' }, { status: 500 })

  return NextResponse.json(data ?? [])
}
