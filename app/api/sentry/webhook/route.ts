/**
 * POST /api/sentry/webhook
 *
 * Sentry has no native Telegram action, so a Sentry Internal Integration posts here and we forward
 * into the existing alerter. Public and machine-called: authenticated only by the HMAC signature
 * (no session, no CSRF header, so no withAuth). /api/* is not covered by the middleware auth check.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { reportAlert } from '@/lib/monitoring/alert'
import { sentryEventToAlert, verifySentrySignature } from '@/lib/monitoring/sentryWebhook'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 })

  const raw = await req.text()
  if (!verifySentrySignature(raw, req.headers.get('sentry-hook-signature'), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // Always 200 past this point so Sentry does not retry-storm on our own failures.
  try {
    const alert = sentryEventToAlert(req.headers.get('sentry-hook-resource'), JSON.parse(raw))
    if (!alert) return NextResponse.json({ ok: true, ignored: true })
    await reportAlert(alert)
  } catch (e) {
    logger.warn('sentry webhook: forwarding failed', { reason: e instanceof Error ? e.name : 'unknown' })
  }
  return NextResponse.json({ ok: true })
}
