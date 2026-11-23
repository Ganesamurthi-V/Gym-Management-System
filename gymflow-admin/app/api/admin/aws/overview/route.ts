import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyRequestAuth } from '@/lib/auth'
import { apiLogger } from '@/lib/logger'
import { getAwsOverview } from '@/lib/aws/overview'

export const dynamic = 'force-dynamic'

const RangeSchema = z.enum(['1h', '24h', '7d'])

// GET /api/admin/aws/overview?range=1h|24h|7d — read-only AWS health and cost snapshot
export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = RangeSchema.safeParse(req.nextUrl.searchParams.get('range') ?? '24h')
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_RANGE', message: 'range must be 1h, 24h or 7d' } },
      { status: 400 },
    )
  }
  const log = apiLogger('AWS_OVERVIEW_GET', req)
  try {
    const data = await getAwsOverview(parsed.data)
    log.summary(200)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    log.error('AWS_MONITOR_FAILED', err)
    log.summary(500)
    return NextResponse.json(
      { success: false, error: { code: 'AWS_MONITOR_FAILED', message: err instanceof Error ? err.message : 'Unknown error' } },
      { status: 500 },
    )
  }
}
