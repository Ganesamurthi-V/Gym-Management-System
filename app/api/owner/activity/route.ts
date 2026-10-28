import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { passesCsrfCheck, apiError } from '@/lib/api/withAuth'
import { normalizeActivityPath } from '@/lib/activity/normalize'

export const dynamic = 'force-dynamic'

// 'action' is deliberately absent: feature actions are recorded server-side by withAuth only.
const bodySchema = z.object({
  kind: z.enum(['app_open', 'page_view']),
  path: z.string().max(400),
  platform: z.enum(['mobile', 'desktop']).optional(),
})

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * POST /api/owner/activity  { kind: 'app_open' | 'page_view', path, platform? }
 *
 * Not wrapped in withAuth on purpose: an owner whose subscription expired or was blocked is still
 * logged. The gym is resolved inside record_owner_activity from auth.uid(); nothing tenant-related is
 * accepted from the client. Logging failures never reach the browser.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('OWNER_ACTIVITY')
  if (!passesCsrfCheck(req)) return apiError(403, 'FORBIDDEN', 'Forbidden')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError(401, 'UNAUTHORIZED', 'Unauthorized')

  const { allowed } = await checkRateLimit(user.id, 'OWNER_ACTIVITY', 60)
  if (!allowed) return apiError(429, 'RATE_LIMITED', 'Too many requests')

  let json: unknown
  try { json = await req.json() } catch { return apiError(400, 'INVALID_BODY', 'Invalid request') }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return apiError(400, 'INVALID_BODY', 'Invalid request')

  const path = normalizeActivityPath(parsed.data.path)
  if (!path) return apiError(400, 'INVALID_PATH', 'Invalid request')

  try {
    const { error } = await supabase.rpc('record_owner_activity', {
      p_kind: parsed.data.kind,
      p_path: path,
      p_label: null,
      p_platform: parsed.data.platform ?? null,
    })
    if (error) log.error('record_owner_activity failed', error)
  } catch (err) {
    log.error('record_owner_activity threw', err)
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE })
}
