/**
 * POST /api/whatsapp/automation/welcome
 *
 * Called server-side (fire-and-forget) immediately after a new member is created.
 * Sends the _gymflow_welcome_member template exactly once.
 *
 * Auth: must be a logged-in gym owner (same session that created the member).
 * The gym, gym name, member name and phone all come from the database for the
 * owner's own gym; the request only identifies the member.
 *
 * Body: { memberId, plan, startDate }
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { sendWelcomeMessage } from '@/lib/whatsapp/automation'
import { z } from 'zod'

const schema = z.object({
  memberId:  z.string().uuid(),
  plan:      z.string().min(1).max(100),
  startDate: z.string().min(1).max(30),
})

export const POST = withAuth('WHATSAPP_AUTOMATION_WELCOME', async (req, { gym, supabase }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
  }
  const { memberId, plan, startDate } = parsed.data

  // Phone and name are read from the member row of the owner's gym, never the request.
  const { data: member } = await supabase
    .from('members')
    .select('id, name, phone')
    .eq('id', memberId)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (!member || !member.phone) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // Send (idempotent — skips if already sent)
  await sendWelcomeMessage({
    gymId: gym.id,
    gymName: gym.name ?? '',
    memberId: member.id,
    memberName: member.name,
    phone: member.phone,
    plan,
    startDate,
  })

  return NextResponse.json({ success: true })
}, { rateLimit: 30 })
