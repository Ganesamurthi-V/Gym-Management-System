/**
 * POST /api/whatsapp/queue/drain
 *
 * Drains a batch of the throttled WhatsApp send queue (up to BATCH_SIZE = 100 per 5 min,
 * stopping early at DRAIN_TIME_BUDGET_MS so it finishes inside maxDuration), then self-schedules
 * the next run via QStash if work remains (1 min if it stopped on time, else 5 min).
 *
 * Triggered by QStash (verified via the Upstash-Signature header) or manually
 * with the CRON_SECRET header (local dev / backstop). Never callable anonymously.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Receiver } from '@upstash/qstash'
import { timingSafeSecretEqual } from '@/lib/monitoring/health'
import { drainSendQueue } from '@/lib/whatsapp/queue'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // keep > DRAIN_TIME_BUDGET_MS (40 s) + reaper/count/publish margin

function adminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

/** Verify the request came from QStash (signed) or carries the CRON_SECRET. */
async function isAuthorized(req: NextRequest, rawBody: string): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  if (cronSecret && timingSafeSecretEqual(headerSecret, cronSecret)) return true

  const signature = req.headers.get('upstash-signature')
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY
  if (signature && currentKey && nextKey) {
    try {
      const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey })
      await receiver.verify({ signature, body: rawBody })
      return true
    } catch {
      return false
    }
  }
  return false
}

export async function POST(req: NextRequest) {
  // Read the raw body once — QStash signature verification is over the exact bytes.
  const rawBody = await req.text().catch(() => '')

  if (!(await isAuthorized(req, rawBody))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await drainSendQueue({ supabase: adminClient() })
    return NextResponse.json({ success: true, stats })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[WA Queue] drain failed:', message)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
