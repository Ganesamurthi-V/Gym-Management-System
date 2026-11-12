import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { reportAlertInBackground } from '@/lib/monitoring/alert'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'
import { toggleAttendance } from '@/lib/attendance/toggle'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/check
 *
 * Handles the full check-in/check-out flow for a member by member_number.
 * Returns the action taken (check_in, check_out, already_out) and member info.
 *
 * Body: { member_number: number, session: 'morning' | 'evening', date: string }
 */
export const POST = withAuth('ATTENDANCE_CHECK', async (req: NextRequest, { supabase, gym, log }) => {
  let body: { member_number?: number; session?: string; date?: string }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const { member_number, session, date } = body

  if (!member_number || typeof member_number !== 'number') {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'member_number is required' } },
      { status: 400 }
    )
  }

  if (!session || !['morning', 'evening'].includes(session)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'session must be morning or evening' } },
      { status: 400 }
    )
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'date must be YYYY-MM-DD' } },
      { status: 400 }
    )
  }

  // 1. Find member
  const { data: memberData, error: memberError } = await supabase
    .from('members')
    .select(`
      id, 
      name,
      member_number,
      memberships!fk_memberships_member_same_gym(end_date)
    `)
    .eq('gym_id', gym.id)
    .eq('member_number', member_number)
    .order('created_at', { referencedTable: 'memberships', ascending: false })
    .limit(1, { referencedTable: 'memberships' })
    .single()

  if (memberError || !memberData) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Member ID not found' } },
      { status: 404 }
    )
  }

  const memberships = memberData.memberships as { end_date: string }[] ?? []
  const latestEndDate = memberships.reduce((max: string, ms: { end_date: string }) => ms.end_date > max ? ms.end_date : max, '')

  // 2. Check today's attendance for this session and toggle (shared with biometric device punches)
  const now = new Date()
  const result = await toggleAttendance(supabase, {
    gymId: gym.id, memberId: memberData.id, date, session: session as 'morning' | 'evening', at: now,
  })

  if (!result.ok) {
    if (result.step === 'select') {
      log.error('attendance lookup failed', result.error)
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: result.error.message } },
        { status: 500 }
      )
    }
    if (result.step === 'insert') {
      log.error('attendance check-in insert failed', result.error)
      // Same key as withAuth's 5xx hook so the two alerts dedupe into one page.
      reportAlertInBackground({ key: '5xx:ATTENDANCE_CHECK', severity: 'critical', title: 'Attendance check-in failed', body: `gymId=${gym.id} step=insert error=${result.error.message.slice(0, 300)}`, gymId: gym.id })
    } else {
      log.error('attendance check-out update failed', result.error)
      reportAlertInBackground({ key: '5xx:ATTENDANCE_CHECK', severity: 'critical', title: 'Attendance check-out failed', body: `gymId=${gym.id} step=update error=${result.error.message.slice(0, 300)}`, gymId: gym.id })
    }
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: result.error.message } },
      { status: 500 }
    )
  }

  const memberInfo = { id: memberData.id, name: memberData.name, member_number: memberData.member_number }

  if (result.action === 'check_in') {
    // Dashboard caches today's attendance count for 5 minutes; same key it writes.
    await deleteCache(cacheKeys.dashboard(gym.id, todayIST()))

    return NextResponse.json({
      success: true,
      data: {
        action: 'check_in',
        // Lets the kiosk offer "entered the wrong number?" and undo exactly this row.
        attendance_id: result.attendanceId,
        member: memberInfo,
        expiry_date: latestEndDate || null,
        check_in_time: now.toISOString(),
      },
    })
  } else if (result.action === 'check_out') {
    const diffMins = Math.floor((now.getTime() - new Date(result.checkInTime!).getTime()) / 60000)

    return NextResponse.json({
      success: true,
      data: {
        action: 'check_out',
        attendance_id: result.attendanceId,
        member: memberInfo,
        expiry_date: latestEndDate || null,
        check_in_time: result.checkInTime,
        check_out_time: now.toISOString(),
        duration_minutes: diffMins,
      },
    })
  } else {
    // Already checked out
    return NextResponse.json({
      success: true,
      data: {
        action: 'already_out',
        member: memberInfo,
        expiry_date: latestEndDate || null,
        check_in_time: result.checkInTime,
        check_out_time: result.checkOutTime,
      },
    })
  }
})
