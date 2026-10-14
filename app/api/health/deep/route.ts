import { NextRequest, NextResponse } from 'next/server'
import { runChecks, httpStatusFor, timingSafeSecretEqual } from '@/lib/monitoring/health'
import { buildChecks, runtimeInfo } from '@/lib/monitoring/checks'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/health/deep — secret-protected full-stack health for Better Stack.
 * Unset secret => 503 (never public); wrong secret => bare 401 before any check runs.
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

  const report = await runChecks(buildChecks(), { timeoutMs: 3000 })
  return NextResponse.json(
    { status: report.status, checks: report.checks, runtime: runtimeInfo(), timestamp: report.timestamp },
    { status: httpStatusFor(report.status), headers: NO_STORE },
  )
}
