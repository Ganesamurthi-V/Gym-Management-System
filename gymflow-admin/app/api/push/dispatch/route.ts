import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getFcm, isPushConfigured } from '@/lib/firebase-admin'

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

  // 1. Pull a bounded batch of unpushed notifications (oldest first).
  const { data: pending, error: pendingErr } = await supabase
    .from('notifications')
    .select('id, type, title, body, gym_id, entity_id')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ sent: 0, notifications: 0 })
  }

  // 2. Fetch all device tokens once for the whole batch.
  const { data: tokenRows, error: tokenErr } = await supabase
    .from('device_push_tokens')
    .select('token')

  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 })
  }

  const tokens = (tokenRows ?? []).map(r => r.token as string)

  // No devices registered — mark the batch pushed so it doesn't pile up, and
  // return. (The rows remain in the in-app feed regardless.)
  if (tokens.length === 0) {
    await supabase
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .in('id', pending.map(n => n.id))
    return NextResponse.json({ sent: 0, notifications: pending.length, reason: 'no_devices' })
  }

  const fcm = getFcm()
  const invalidTokens = new Set<string>()
  let sent = 0

  // 3. Send each notification to all devices.
  for (const n of pending) {
    const res = await fcm.sendEachForMulticast({
      tokens,
      notification: { title: n.title, body: n.body },
      // Data travels as strings; the app reads these to deep-link on tap.
      data: {
        type: String(n.type),
        gymId: n.gym_id ? String(n.gym_id) : '',
        entityId: n.entity_id ? String(n.entity_id) : '',
        notificationId: String(n.id),
      },
      android: { priority: 'high', notification: { channelId: 'admin-alerts' } },
    })

    sent += res.successCount

    // Collect tokens FCM says are dead so we can prune them.
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code
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

  // 4. Stamp the whole batch as pushed.
  const { error: markErr } = await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('id', pending.map(n => n.id))

  if (markErr) {
    return NextResponse.json({ error: markErr.message }, { status: 500 })
  }

  // 5. Prune dead device tokens.
  if (invalidTokens.size > 0) {
    await supabase
      .from('device_push_tokens')
      .delete()
      .in('token', Array.from(invalidTokens))
  }

  return NextResponse.json({
    sent,
    notifications: pending.length,
    devices: tokens.length,
    pruned: invalidTokens.size,
  })
}

// Vercel Cron pings via GET.
export async function GET(req: NextRequest) {
  return POST(req)
}
