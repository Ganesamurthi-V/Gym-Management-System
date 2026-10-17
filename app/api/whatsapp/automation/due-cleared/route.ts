/**
 * POST /api/whatsapp/automation/due-cleared
 *
 * Called fire-and-forget when a member's pending dues are fully cleared.
 * Cancels any active payment_due_reminder cycles for that member.
 *
 * Auth: must be a logged-in gym owner. Gym and phone come from the database for
 * the owner's own gym, never from the request.
 *
 * Body: { memberId, dueDate }
 *   dueDate — the trigger date used when the reminder cycle started (today's date when dues were created)
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { cancelReminderCycles } from '@/lib/whatsapp/automation'
import { z } from 'zod'

const schema = z.object({
  memberId: z.string().uuid(),
  dueDate:  z.string().min(1).max(30),
})

// Bulk edit fires one call per cleared member, so this limit is higher than the
// send routes; it only cancels queued reminders and sends nothing.
export const POST = withAuth('WHATSAPP_AUTOMATION_DUE_CLEARED', async (req, { gym, supabase }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
  }
  const { memberId, dueDate } = parsed.data

  const { data: member } = await supabase
    .from('members')
    .select('id, phone')
    .eq('id', memberId)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (!member || !member.phone) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // Cancel the due reminder cycle
  await cancelReminderCycles({
    gymId: gym.id,
    memberId: member.id,
    phone: member.phone,
    templates: ['payment_due_reminder'],
    triggerDate: dueDate,
  })

  return NextResponse.json({ success: true })
}, { rateLimit: 120 })
