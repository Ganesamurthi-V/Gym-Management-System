/**
 * POST /api/whatsapp/automation/renewal
 *
 * Called fire-and-forget after a membership renewal is saved.
 * Does two things atomically:
 *  1. Sends the membership_renewed template
 *  2. Cancels any active expiry / expired reminder cycles for this member
 *
 * Auth: must be a logged-in gym owner. Gym, gym name, member name and phone come
 * from the database for the owner's own gym, never from the request.
 *
 * Body: { memberId, plan, validUntil, previousEndDate? }
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { sendRenewalMessage, cancelReminderCycles } from '@/lib/whatsapp/automation'
import { z } from 'zod'

const schema = z.object({
  memberId:        z.string().uuid(),
  plan:            z.string().min(1).max(100),
  validUntil:      z.string().min(1).max(30),
  previousEndDate: z.string().max(30).optional(), // used to cancel the old expiry cycle
})

export const POST = withAuth('WHATSAPP_AUTOMATION_RENEWAL', async (req, { gym, supabase }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
  }
  const { memberId, plan, validUntil, previousEndDate } = parsed.data

  const { data: member } = await supabase
    .from('members')
    .select('id, name, phone')
    .eq('id', memberId)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (!member || !member.phone) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // 1. Send renewal confirmation
  await sendRenewalMessage({
    gymId: gym.id,
    gymName: gym.name ?? '',
    memberId: member.id,
    memberName: member.name,
    phone: member.phone,
    plan,
    validUntil,
  })

  // 2. Cancel expiry / expired reminder cycles tied to the previous membership
  if (previousEndDate) {
    await cancelReminderCycles({
      gymId: gym.id,
      memberId: member.id,
      phone: member.phone,
      templates: ['membership_expiry_reminder', 'membership_expired'],
      triggerDate: previousEndDate,
    })
  }

  return NextResponse.json({ success: true })
}, { rateLimit: 30 })
