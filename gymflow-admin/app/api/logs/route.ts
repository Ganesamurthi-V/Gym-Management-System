import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { getSentryEvents } from '@/lib/sentry-api'

// GET /api/logs — list Sentry events for the mobile app
export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const events = await getSentryEvents(50).catch(() => [])
  return NextResponse.json(events)
}
