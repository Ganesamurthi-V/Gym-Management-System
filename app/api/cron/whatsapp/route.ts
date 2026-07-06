/**
 * POST /api/cron/whatsapp
 *
 * Daily cron job that sends scheduled WhatsApp automation messages:
 *  - membership_expiry_reminder  (every 3 days, up to 7 times)
 *  - membership_expired          (every 3 days, up to 7 times)
 *  - payment_due_reminder        (every 3 days, up to 7 times)
 *  - birthday_wishes             (once per year on member's birthday)
 *
 * Security: Protected by CRON_SECRET header.
 * Vercel Cron calls this automatically based on vercel.json schedule.
 *
 * Manual trigger: POST /api/cron/whatsapp
 *   Header: x-cron-secret: <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { runDailyWhatsAppAutomation } from '@/lib/whatsapp/automation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for large gyms

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Cron/WA] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Vercel sends the secret as Authorization: Bearer <secret>
  // Manual callers can use x-cron-secret header
  const authHeader    = req.headers.get('authorization') ?? ''
  const cronHeader    = req.headers.get('x-cron-secret') ?? ''
  const bearerToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isAuthorized  = bearerToken === cronSecret || cronHeader === cronSecret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  const startMs = Date.now()
  console.log('[Cron/WA] Starting daily WhatsApp automation...')

  try {
    const stats = await runDailyWhatsAppAutomation()
    const durationMs = Date.now() - startMs

    console.log(`[Cron/WA] Done in ${durationMs}ms:`, stats)

    return NextResponse.json({
      success: true,
      durationMs,
      stats,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Cron/WA] Fatal error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// Allow GET for Vercel's cron ping (Vercel always uses GET for scheduled crons)
export async function GET(req: NextRequest) {
  return POST(req)
}
