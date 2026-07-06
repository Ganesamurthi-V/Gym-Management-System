/**
 * POST /api/whatsapp/automation/renewal
 *
 * Called fire-and-forget after a membership renewal is saved.
 * Does two things atomically:
 *  1. Sends the membership_renewed template
 *  2. Cancels any active expiry / expired reminder cycles for this member
 *
 * Auth: must be a logged-in gym owner.
 *
 * Body: {
 *   gymId, gymName, memberId, memberName, phone,
 *   plan, validUntil, previousEndDate
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendRenewalMessage, cancelReminderCycles } from '@/lib/whatsapp/automation'
import { z } from 'zod'

const schema = z.object({
  gymId:           z.string().uuid(),
  gymName:         z.string().min(1),
  memberId:        z.string().uuid(),
  memberName:      z.string().min(1),
  phone:           z.string().min(10),
  plan:            z.string().min(1),
  validUntil:      z.string().min(1),
  previousEndDate: z.string().optional(), // used to cancel the old expiry cycle
})

export async function POST(req: NextRequest) {
  try {
    // Auth guard
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
    }

    const {
      gymId, gymName, memberId, memberName, phone,
      plan, validUntil, previousEndDate,
    } = parsed.data

    // Verify gym ownership
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('id', gymId)
      .eq('owner_id', user.id)
      .single()

    if (!gym) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // 1. Send renewal confirmation
    await sendRenewalMessage({ gymId, gymName, memberId, memberName, phone, plan, validUntil })

    // 2. Cancel expiry / expired reminder cycles tied to the previous membership
    if (previousEndDate) {
      await cancelReminderCycles({
        gymId,
        memberId,
        phone,
        templates: ['membership_expiry_reminder', 'membership_expired'],
        triggerDate: previousEndDate,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
