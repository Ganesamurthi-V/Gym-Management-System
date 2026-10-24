/**
 * POST /api/member-app/invite-all
 *
 * Queues a member-app invitation WhatsApp for every member of the owner's gym who has a
 * phone and has not activated yet. Nothing is sent inline: each row goes onto the throttled
 * whatsapp_send_queue (100 msgs / 5 min), so Meta never sees a burst.
 *
 * The invitation token is NOT minted here. Tokens expire after 24h and a large gym can wait
 * in the queue for hours, so the drain worker mints each one just before its send.
 *
 * No request body: the gym comes from the session, never from the client.
 */

import { withAuth, apiError, apiSuccess } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWhatsAppEnabledForGym } from '@/lib/whatsapp/gymGate'
import { selectInviteTargets, type InviteCandidate } from '@/lib/whatsapp/inviteAll'
import { enqueueSend, kickDrain, BATCH_SIZE, DRAIN_INTERVAL_MINUTES } from '@/lib/whatsapp/queue'
import { estimateDrainMinutes, getRecipientWindowUsage, normalisePhone, QUEUE_RECIPIENT_CAP } from '@/lib/whatsapp/recipientLimit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// PostgREST caps a response at 1000 rows by default, so page through the gym's members.
const PAGE_SIZE = 1000

export const POST = withAuth('MEMBER_APP_INVITE_ALL', async (_req, { gym, supabase, log }) => {
  const admin = createAdminClient()

  if (!(await isWhatsAppEnabledForGym(gym.id, admin))) {
    return apiError(
      403,
      'WHATSAPP_DISABLED',
      'WhatsApp messages are turned off for your gym, so the invitations were not queued. Please contact GymFlow support.',
    )
  }

  const members: InviteCandidate[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('members')
      .select('id, name, phone, invitation_status')
      .eq('gym_id', gym.id)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      log.error('Failed to load members for invite-all', error)
      return apiError(500, 'FETCH_FAILED', 'Could not load your members. Please try again.')
    }
    members.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }

  const { targets, skippedNoPhone, alreadyActivated } = selectInviteTargets(members)

  // Unique index (member_id, template_name, cycle_key) while pending/sending makes a repeat
  // click a no-op: enqueued=false then means "already waiting in the queue".
  let queued = 0
  let alreadyQueued = 0
  for (const m of targets) {
    const res = await enqueueSend(admin, {
      gymId: gym.id,
      memberId: m.id,
      templateName: 'member_app_invitation',
      context: { phone: m.phone as string, gymName: gym.name, memberName: m.name, gymId: gym.id },
      cycleKey: `member_app_invitation:${m.id}`,
      logRowId: null,
    })
    if (res.enqueued) queued++
    else alreadyQueued++
  }

  if (queued > 0) await kickDrain().catch(() => {})

  // The queue is also bound by Meta's unique-customers-per-24h cap, which the rate-based
  // estimate ignores. Approximate: assumes the whole queued batch is new recipients and that
  // slots free in whole-day steps. Unreadable usage counts as no free slots (longer estimate).
  const unique = new Set(targets.map(m => normalisePhone(m.phone as string))).size
  const usage = await getRecipientWindowUsage(admin)
  const free = usage ? QUEUE_RECIPIENT_CAP - usage.inWindow : 0
  const estimatedMinutes = estimateDrainMinutes({
    queued,
    unique: queued > 0 ? unique : 0,
    free,
    cap: QUEUE_RECIPIENT_CAP,
    batchSize: BATCH_SIZE,
    intervalMinutes: DRAIN_INTERVAL_MINUTES,
  })

  return apiSuccess({
    queued,
    skippedNoPhone,
    alreadyActivated,
    alreadyQueued,
    estimatedMinutes,
    dailyRecipientLimit: QUEUE_RECIPIENT_CAP,
  })
}, { rateLimit: 3 })
