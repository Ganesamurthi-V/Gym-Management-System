/**
 * POST /api/whatsapp/automation/import-batch
 *
 * Called (fire-and-forget) right after a bulk import finishes. Immediately
 * fires the expiry-reminder / expired templates for the just-imported members
 * so they don't have to wait for the next daily cron run.
 *
 * Expired members are notified only if they lapsed within the last 2 months
 * (IMPORT_EXPIRED_WINDOW_DAYS); longer-inactive members receive nothing.
 * Welcome messages are never sent here.
 *
 * Auth: must be the logged-in owner of the gym these members belong to.
 *
 * Body: { memberIds: string[] }   // UUIDs, max 500
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGymForUser } from '@/lib/supabase/queries'
import { runImportBatchAutomation } from '@/lib/whatsapp/automation'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // sending to a large batch can take a while

const schema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(500),
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

    // Resolve the caller's gym — members are scoped to it inside the runner, so
    // a caller can only trigger sends for members in their own gym.
    const gym = await getGymForUser(supabase, user.id)
    if (!gym) {
      return NextResponse.json({ success: false, error: 'Gym not found' }, { status: 404 })
    }

    const stats = await runImportBatchAutomation({
      gymId: gym.id,
      memberIds: parsed.data.memberIds,
    })

    return NextResponse.json({ success: true, stats })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
