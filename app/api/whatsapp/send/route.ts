/**
 * POST /api/whatsapp/send
 *
 * Secure server-side endpoint for sending WhatsApp template messages.
 * The client never touches the access token.
 *
 * Body:
 *   {
 *     templateId: TemplateId,
 *     context:    TemplateContext   // phone, gymName, memberName, plan, dates, amounts...
 *   }
 *
 * Response:
 *   { success: true,  messageId: string }
 *   { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/sender'
import type { TemplateId, TemplateContext } from '@/lib/whatsapp/sender'
import { z } from 'zod'

// ─── Request schema ───────────────────────────────────────────────────────────

const TEMPLATE_IDS: TemplateId[] = [
  '_gymflow_welcome_member',
  'membership_renewed',
  'membership_expiry_reminder',
  'membership_expired',
  'payment_due_reminder',
  '_birthday_wishes',
  'member_app_invitation',
]

const sendSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]),
  context: z.object({
    phone:          z.string().min(10),
    gymName:        z.string().min(1),
    memberName:     z.string().min(1),
    plan:           z.string().optional(),
    startDate:      z.string().optional(),
    validUntil:     z.string().optional(),
    expiryDate:     z.string().optional(),
    daysRemaining:  z.number().optional(),
    dueAmount:      z.number().optional(),
    memberId:       z.string().optional(),
    invitationToken: z.string().optional(),
  }),
})

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth check — must be a logged-in gym owner
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Parse body
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    // Validate
    const parsed = sendSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: parsed.error.issues.map(i => i.message).join(', '),
      }, { status: 400 })
    }

    const { templateId, context } = parsed.data

    // The gym comes from the logged-in owner, never from the request body, so the gym's
    // WhatsApp switch cannot be sidestepped by sending someone else's (or no) gym id.
    const { data: ownGym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle()
    if (!ownGym) {
      return NextResponse.json({ success: false, error: 'No gym found for this account' }, { status: 403 })
    }

    // Send
    const result = await sendWhatsAppTemplate(templateId, { ...(context as TemplateContext), gymId: ownGym.id })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.skipped ? 403 : 502 })
    }

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
