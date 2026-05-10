import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput } from '@/lib/geo/normalizer'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q = searchParams.get('q') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '8'), 20)

  if (q.length < 2) return NextResponse.json([])

  const normalized = normalizeInput(q)

  const { data } = await supabase
    .rpc('search_localities_autocomplete', {
      query_text: normalized,
      prefix_text: normalized,
      result_limit: limit,
    })

  return NextResponse.json(data ?? [])
}
