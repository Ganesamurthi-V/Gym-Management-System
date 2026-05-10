import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectDatasetCluster } from '@/lib/geo/clustering'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const inputs: string[] = (body.inputs ?? []).filter(Boolean).slice(0, 5000)

  const cluster = detectDatasetCluster(inputs)

  return NextResponse.json({
    top_district: cluster.top_district,
    top_state: cluster.top_state,
    confidence: cluster.confidence,
  })
}
