import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getFcm, isPushConfigured } from '@/lib/firebase-admin'

// firebase-admin is a Node-only SDK — it cannot run on the Edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/push/dispatch
 *
 * Reads notifications with pushed_at IS NULL, sends each to every registered
 * device via FCM, then stamps pushed_at so they are never re-sent. Device
 * tokens that FCM reports as unregistered/invalid are pruned.
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-cron-secret header.
 * Triggered from the DB: a pg_net AFTER-INSERT trigger on notifications POSTs
 * here on every new row (see 20260925170000_push_dispatch_pg_net.sql), giving
 * instant delivery with no external cron. Batches co-arriving rows since it
 * always drains all unpushed notifications, not just the one that triggered it.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') ?? ''
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!cronSecret || (bearer !== cronSecret && cronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isPushConfigured()) {
    // Not an error: push simply isn't wired yet. In-app notifications still work.
    return NextResponse.json({ skipped: 'push_not_configured' })
  }

  const supabase = createAdminClient()

  /*
    1. Pick a bounded batch of candidates, then CLAIM them atomically.

    The trigger fires once per inserted notification, so several dispatch requests
    can be in flight at the same time and would otherwise all read the same
    unpushed rows and all send them — the admin gets the same alert two or three
    times. Stamping pushed_at in an UPDATE guarded by `pushed_at IS NULL` makes the
    claim atomic: Postgres re-checks that predicate after taking the row lock, so
    the losing request matches zero rows and sends nothing.
  */
  const { data: candidates, error: candidatesErr } = await supabase
    .from('notifications')
    .select('id')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (candidatesErr) {
    return NextResponse.json({ error: candidatesErr.message }, { status: 500 })
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ sent: 0, notifications: 0 })
  }

  const candidateIds = candidates.map(c => c.id as string)

  const { data: claimed, error: claimErr } = await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .is('pushed_at', null)
    .in('id', candidateIds)
    .select('id, type, title, body, gym_id, entity_id, created_at')

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 })
  }
  if (!claimed || claimed.length === 0) {
    // A concurrent dispatch already claimed this batch. Nothing to do.
    return NextResponse.json({ sent: 0, notifications: 0, reason: 'already_claimed' })
  }

  // RETURNING has no defined order; send oldest-first for a sensible arrival order.
  const batch = [...claimed].sort(
    (a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
  )
  const claimedIds = batch.map(n => n.id as string)

  /** Hand the batch back so a later trigger retries it, then fail loudly. */
  async function release() {
    await supabase.from('notifications').update({ pushed_at: null }).in('id', claimedIds)
  }

  try {
    // 2. Fetch all device tokens once for the whole batch.
    const { data: tokenRows, error: tokenErr } = await supabase
      .from('device_push_tokens')
      .select('token')

    if (tokenErr) throw new Error(tokenErr.message)

    const tokens = (tokenRows ?? []).map(r => r.token as string)

    /*
      No devices registered. The rows stay claimed on purpose: they are already
      visible in the in-app feed, and releasing them would mean the first device to
      register later gets a flood of historic alerts.
    */
    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0, notifications: batch.length, reason: 'no_devices' })
    }

    const fcm = getFcm()
    const invalidTokens = new Set<string>()
    // Distinct FCM error codes seen this run, surfaced in the response so a
    // "sent: 0, pruned: 0" outcome is diagnosable instead of silent.
    const failureCodes = new Map<string, number>()
    let sent = 0
    let failed = 0

    // 3. Send each notification to all devices.
    for (const n of batch) {
      const res = await fcm.sendEachForMulticast({
        tokens,
        notification: { title: n.title as string, body: n.body as string },
        // FCM data values must be strings; the app reads these to deep-link on tap.
        data: {
          type: String(n.type),
          gymId: n.gym_id ? String(n.gym_id) : '',
          entityId: n.entity_id ? String(n.entity_id) : '',
          notificationId: String(n.id),
        },
        android: { priority: 'high', notification: { channelId: 'admin-alerts' } },
        apns: { payload: { aps: { sound: 'default' } } },
      })

      sent += res.successCount
      failed += res.failureCount

      res.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error?.code ?? 'unknown'
          failureCodes.set(code, (failureCodes.get(code) ?? 0) + 1)
          // Log the full reason once per failure so it lands in Vercel logs.
          console.error('[PUSH_DISPATCH] FCM send failed', {
            code,
            message: r.error?.message,
            token: tokens[i]?.slice(0, 12) + '…',
          })
          // Only prune tokens FCM says are permanently dead.
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            invalidTokens.add(tokens[i])
          }
        }
      })
    }

    // 4. Prune dead device tokens.
    if (invalidTokens.size > 0) {
      await supabase
        .from('device_push_tokens')
        .delete()
        .in('token', Array.from(invalidTokens))
    }

    return NextResponse.json({
      sent,
      failed,
      notifications: batch.length,
      devices: tokens.length,
      pruned: invalidTokens.size,
      // Only present when something failed; e.g. { "messaging/third-party-auth-error": 1 }
      ...(failureCodes.size > 0 && { failureCodes: Object.fromEntries(failureCodes) }),
    })
  } catch (error: unknown) {
    // The batch was claimed but not delivered — unclaim so it is retried.
    await release().catch(() => {})
    const message = error instanceof Error ? error.message : 'Dispatch failed'
    console.error('[PUSH_DISPATCH] failed, batch released:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
