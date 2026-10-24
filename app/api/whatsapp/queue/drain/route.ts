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
import { reportAlertInBackground } from '@/lib/monitoring/alert'

/** Redis counter with TTL; null (never throws) when Redis is unconfigured or errors. */
async function bumpCounter(key: string, ttlSeconds: number): Promise<number | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  try {
    const { redis } = await import('@/lib/redis')
    const n = await redis.incr(key)
    await redis.expire(key, ttlSeconds)
    return n
  } catch {
    return null
  }
}

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
    // Anyone can send a bogus signature header, so a single failure is noise. Count per UTC hour
    // (not awaited: the 401 must not wait on Redis) and alert at 5+, which also covers rotated
    // QStash signing keys silently stopping the queue.
    if (req.headers.get('upstash-signature')) {
      const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '')
      void bumpCounter(`wa:drain:badsig:${hour}`, 7200).then(n => {
        if (n !== null && n >= 5) {
          reportAlertInBackground({
            key: 'wa:drain_unauthorized', severity: 'warning', title: 'WhatsApp drain rejected QStash calls',
            body: `${n} drain calls with an invalid signature this hour; check the QStash signing keys or probing.`,
            cooldownSeconds: 3600,
          })
        }
      }).catch(() => {})
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await drainSendQueue({ supabase: adminClient() })
    return NextResponse.json({ success: true, stats })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[WA Queue] drain failed:', message)
    reportAlertInBackground({ key: 'wa:drain_error', severity: 'critical', title: 'WhatsApp queue drain crashed', body: message })
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
