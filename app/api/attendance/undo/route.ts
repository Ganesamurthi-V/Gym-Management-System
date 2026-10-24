import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/api/withAuth'
import { reportAlertInBackground } from '@/lib/monitoring/alert'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/undo
 *
 * Reverses the kiosk action the owner has just made, for the "entered the wrong
 * number?" button: a check-in is deleted, a check-out is cleared (the member goes
 * back to being checked in). Scoped to the server-resolved gym.
 *
 * Only a RECENT action can be undone. The button lives on the confirmation card
 * for a few seconds; without this bound the route would be a general
 * "delete any attendance row by id" for any logged-in owner session.
 *
 * Body: { attendance_id: uuid, action: 'check_in' | 'check_out' }
 */
const UNDO_WINDOW_MS = 5 * 60 * 1000

const bodySchema = z.object({
  attendance_id: z.string().uuid(),
  action: z.enum(['check_in', 'check_out']),
})

export const POST = withAuth('ATTENDANCE_UNDO', async (req: NextRequest, { supabase, gym, log }) => {
  let json: unknown
  try { json = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 },
    )
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'attendance_id and action are required' } },
      { status: 400 },
    )
  }
  const { attendance_id, action } = parsed.data

  const { data: row } = await supabase
    .from('attendance')
    .select('id, created_at, check_out_time')
    .eq('id', attendance_id)
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!row) {
    // Already undone (double tap) or not this gym's row: nothing left to reverse.
    return NextResponse.json({ success: true, data: { undone: false } })
  }

  const at = action === 'check_in' ? row.created_at : row.check_out_time
  if (!at || Date.now() - new Date(at).getTime() > UNDO_WINDOW_MS) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_LATE', message: 'This entry is too old to undo here.' } },
      { status: 409 },
    )
  }

  const { error } =
    action === 'check_in'
      ? await supabase.from('attendance').delete().eq('id', attendance_id).eq('gym_id', gym.id)
      : await supabase.from('attendance').update({ check_out_time: null }).eq('id', attendance_id).eq('gym_id', gym.id)

  if (error) {
    log.error('attendance undo failed', error)
    reportAlertInBackground({ key: '5xx:ATTENDANCE_UNDO', severity: 'critical', title: 'Attendance undo failed', body: `gymId=${gym.id} error=${error.message.slice(0, 300)}`, gymId: gym.id })
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
      { status: 500 },
    )
  }

  // A undone check-in lowers today's attendance count cached on the dashboard.
  await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

  return NextResponse.json({ success: true, data: { undone: true } })
})
