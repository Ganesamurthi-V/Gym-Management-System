/**
 * POST /api/whatsapp/send
 *
 * Secure server-side endpoint for sending WhatsApp template messages.
 * The client never touches the access token.
 *
 * Body:
 *   {
 *     templateId: TemplateId,
 *     memberId:   uuid,          // member of the caller's own gym
 *     context:    { plan, startDate, validUntil, expiryDate, daysRemaining }
 *   }
 *
 * The recipient phone, member name, gym name and due amount are loaded from the
 * database, never from the request, so an owner cannot use this route to message
 * an arbitrary number with arbitrary text.
 *
 * Response:
 *   { success: true,  messageId: string }
 *   { success: false, error: string }
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/sender'
import type { TemplateId } from '@/lib/whatsapp/sender'
import { formatMemberId } from '@/types'
import { z } from 'zod'

// ─── Request schema ───────────────────────────────────────────────────────────

// member_app_invitation is deliberately absent: it needs a server-minted token and
// is sent by /api/member-app/invite, never from free-text client input.
const TEMPLATE_IDS: TemplateId[] = [
  '_gymflow_welcome_member',
  'membership_renewed',
  'membership_expiry_reminder',
  'membership_expired',
  'payment_due_reminder',
  '_birthday_wishes',
]

const sendSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]),
  memberId: z.string().uuid(),
  context: z.object({
    plan:          z.string().max(100).optional(),
    startDate:     z.string().max(30).optional(),
    validUntil:    z.string().max(30).optional(),
    expiryDate:    z.string().max(30).optional(),
    daysRemaining: z.number().optional(),
  }).default({}),
})

// ─── Route handler ────────────────────────────────────────────────────────────

// withAuth gives CSRF, auth and the server-resolved gym; the per-owner limit caps
// how fast one account can push messages through our WhatsApp number.
export const POST = withAuth('WHATSAPP_SEND', async (req, { gym, supabase }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      error: parsed.error.issues.map(i => i.message).join(', '),
    }, { status: 400 })
  }

  const { templateId, memberId, context } = parsed.data

  // Recipient comes from the owner's own gym only (RLS + explicit gym_id filter).
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('id, name, phone, member_number, pending_amount')
    .eq('id', memberId)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (memberErr) {
    return NextResponse.json({ success: false, error: 'Could not load member' }, { status: 500 })
  }
  if (!member || !member.phone || member.phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ success: false, error: 'Member not found or has no valid phone' }, { status: 404 })
  }

  const result = await sendWhatsAppTemplate(templateId, {
    ...context,
    phone:      member.phone,
    memberName: member.name,
    gymName:    gym.name,
    dueAmount:  member.pending_amount > 0 ? member.pending_amount : undefined,
    memberId:   formatMemberId(member.member_number),
    gymId:      gym.id,
  })

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.skipped ? 403 : 502 })
  }

  return NextResponse.json({ success: true, messageId: result.messageId })
}, { rateLimit: 20 })
