import { NextRequest, NextResponse } from 'next/server'
import { timingSafeSecretEqual } from '@/lib/monitoring/health'
import { checkWhatsAppMeta } from '@/lib/monitoring/checks'
import { CHECK_NAMES, runWatchdog, simulateCheck } from '@/lib/monitoring/watchdog'
import { reportAlert } from '@/lib/monitoring/alert'
import { createAdminClient } from '@/lib/supabase/admin'
import { redis } from '@/lib/redis'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/health/watchdog: business-logic checks, called every 5 min by the external watcher.
 * Same auth as /api/health/deep. Always 200 once authorised and completed: the watcher reads the
 * JSON, and a 5xx here would make uptime monitors page twice for one business failure.
 * `?simulate=<checkName>` raises that check's alert once for a drill and touches no data.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) {
    return NextResponse.json({ status: 'unconfigured' }, { status: 503, headers: NO_STORE })
  }
  const provided = req.headers.get('x-health-secret') ?? ''
  if (!timingSafeSecretEqual(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const simulate = req.nextUrl.searchParams.get('simulate')
  if (simulate !== null) {
    if (!CHECK_NAMES.includes(simulate)) {
      return NextResponse.json({ error: 'Unknown check', checks: CHECK_NAMES }, { status: 400, headers: NO_STORE })
    }
    await simulateCheck(simulate, { reportAlert })
    return NextResponse.json(
      { status: 'alerting', simulated: simulate, checks: {}, timestamp: new Date().toISOString() },
      { headers: NO_STORE },
    )
  }

  const configured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  const summary = await runWatchdog({
    // The caller is verified by the shared secret above, and every query is global ops metadata
    // (counts and gym ids only), so RLS-bypassing access is appropriate here.
    supabase: createAdminClient(),
    redis: configured ? redis : null,
    reportAlert,
    now: () => new Date(),
    metaCheck: () => checkWhatsAppMeta(),
  })
  return NextResponse.json({ ...summary, timestamp: new Date().toISOString() }, { headers: NO_STORE })
}
