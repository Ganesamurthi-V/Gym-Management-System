import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { sanitizeUUID } from '@/lib/sanitize'
import { describeActivity } from '@/lib/activity/describe'
import { activityQuerySchema } from '@/lib/activity/query'

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

// GET /api/gyms/[gymId]/activity — owner app opens, page views and actions (kept 15 days)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gymId: string }> }
) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const gymId = sanitizeUUID((await params).gymId)
  if (!gymId) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })

  const url = new URL(req.url)
  const parsed = activityQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    before: url.searchParams.get('before') ?? undefined,
    kind: url.searchParams.get('kind') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const { limit, before, kind } = parsed.data

  const supabase = createAdminClient()
  const now = Date.now()
  const since7 = new Date(now - 7 * DAY_MS).toISOString()
  const since15 = new Date(now - 15 * DAY_MS).toISOString()

  let list = supabase
    .from('owner_activity_events')
    .select('id, kind, path, label, platform, created_at')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1) // one extra row tells us whether another page exists
  if (kind !== 'all') list = list.eq('kind', kind)
  if (before) list = list.lt('created_at', new Date(before).toISOString())

  const opens = () =>
    supabase.from('owner_activity_events').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).eq('kind', 'app_open')

  const [listRes, last, c7, c15] = await Promise.all([
    list,
    supabase.from('owner_activity_events').select('created_at')
      .eq('gym_id', gymId).eq('kind', 'app_open')
      .order('created_at', { ascending: false }).limit(1),
    opens().gte('created_at', since7),
    opens().gte('created_at', since15),
  ])

  const failed = listRes.error ?? last.error ?? c7.error ?? c15.error
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 })

  const rows = listRes.data ?? []
  const page = rows.slice(0, limit)
  return NextResponse.json({
    success: true,
    data: {
      events: page.map((r) => ({
        id: r.id,
        kind: r.kind,
        path: r.path,
        label: r.label,
        title: describeActivity(r),
        platform: r.platform,
        createdAt: r.created_at,
      })),
      // Timestamp-only cursor: rows sharing the exact last created_at could be skipped; ties are negligible.
      nextBefore: rows.length > limit ? page[page.length - 1].created_at : null,
      summary: {
        lastOpenAt: last.data?.[0]?.created_at ?? null,
        opensLast7Days: c7.count ?? 0,
        opensLast15Days: c15.count ?? 0,
      },
    },
  })
}
