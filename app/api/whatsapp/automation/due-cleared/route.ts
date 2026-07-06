/**
 * POST /api/whatsapp/automation/due-cleared
 *
 * Called fire-and-forget when a member's pending dues are fully cleared.
 * Cancels any active payment_due_reminder cycles for that member.
 *
 * Auth: must be a logged-in gym owner.
 *
 * Body: { gymId, memberId, phone, dueDate }
 *   dueDate — the trigger date used when the reminder cycle started (today's date when dues were created)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelReminderCycles } from '@/lib/whatsapp/automation'
import { z } from 'zod'

const schema = z.object({
  gymId:    z.string().uuid(),
  memberId: z.string().uuid(),
  phone:    z.string().min(10),
  dueDate:  z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
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

    const { gymId, memberId, phone, dueDate } = parsed.data

    // Verify ownership
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('id', gymId)
      .eq('owner_id', user.id)
      .single()

    if (!gym) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Cancel the due reminder cycle
    await cancelReminderCycles({
      gymId,
      memberId,
      phone,
      templates: ['payment_due_reminder'],
      triggerDate: dueDate,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
