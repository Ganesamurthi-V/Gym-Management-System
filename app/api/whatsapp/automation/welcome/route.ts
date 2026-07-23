/**
 * POST /api/whatsapp/automation/welcome
 *
 * Called server-side (fire-and-forget) immediately after a new member is created.
 * Sends the _gymflow_welcome_member template exactly once.
 *
 * Auth: must be a logged-in gym owner (same session that created the member).
 *
 * Body: {
 *   gymId, gymName, memberId, memberName, phone, plan, startDate
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeMessage } from '@/lib/whatsapp/automation'
import { z } from 'zod'

const schema = z.object({
  gymId:      z.string().uuid(),
  // Optional: when the caller omits it, the route resolves the gym name
  // server-side from the ownership check below. This keeps the client's save
  // path from having to make an extra blocking SELECT just for the gym name.
  gymName:    z.string().min(1).optional(),
  memberId:   z.string().uuid(),
  memberName: z.string().min(1),
  phone:      z.string().min(10),
  plan:       z.string().min(1),
  startDate:  z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    // Auth guard
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

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
    }

    const { gymId, gymName, memberId, memberName, phone, plan, startDate } = parsed.data

    // Verify gym ownership AND resolve the gym name in a single query, so the
    // client never needs a separate blocking SELECT just to pass gymName.
    const { data: gym } = await supabase
      .from('gyms')
      .select('id, name')
      .eq('id', gymId)
      .eq('owner_id', user.id)
      .single()

    if (!gym) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const resolvedGymName = gymName ?? gym.name ?? ''

    // Send (idempotent — skips if already sent)
    await sendWelcomeMessage({ gymId, gymName: resolvedGymName, memberId, memberName, phone, plan, startDate })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
