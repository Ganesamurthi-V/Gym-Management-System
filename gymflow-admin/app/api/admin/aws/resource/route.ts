import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyRequestAuth } from '@/lib/auth'
import { apiLogger } from '@/lib/logger'
import { getAwsResourceDetail, ResourceNotFoundError } from '@/lib/aws/detail'

export const dynamic = 'force-dynamic'

const ParamsSchema = z.object({
  type: z.enum(['lambda', 'cloudfront', 'dynamodb', 's3']),
  id: z.string().min(1).max(256),
  range: z.enum(['1h', '24h', '7d']).default('24h'),
})

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

// GET /api/admin/aws/resource?type=&id=&range= — read-only detail for one monitored resource
export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sp = req.nextUrl.searchParams
  const parsed = ParamsSchema.safeParse({
    type: sp.get('type') ?? undefined, id: sp.get('id') ?? undefined, range: sp.get('range') ?? undefined,
  })
  if (!parsed.success) return fail(400, 'INVALID_PARAMS', 'type, id (1-256 chars) and range (1h, 24h, 7d) are required')
  const log = apiLogger('AWS_RESOURCE_GET', req)
  try {
    const data = await getAwsResourceDetail(parsed.data.type, parsed.data.id, parsed.data.range)
    log.summary(200)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      log.summary(404)
      return fail(404, 'NOT_FOUND', err.message)
    }
    log.error('AWS_RESOURCE_FAILED', err)
    log.summary(500)
    return fail(500, 'AWS_RESOURCE_FAILED', err instanceof Error ? err.message : 'Unknown error')
  }
}
