import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/check
 *
 * Handles the full check-in/check-out flow for a member by member_number.
 * Returns the action taken (check_in, check_out, already_out) and member info.
 *
 * Body: { member_number: number, session: 'morning' | 'evening', date: string }
 */
export const POST = withAuth('ATTENDANCE_CHECK', async (req: NextRequest, { supabase, gym }) => {
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
      memberships(end_date)
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

  // 2. Check today's attendance for this session
  const { data: attData } = await supabase
    .from('attendance')
    .select('id, created_at, check_out_time')
    .eq('gym_id', gym.id)
    .eq('member_id', memberData.id)
    .eq('date', date)
    .eq('session', session)
    .maybeSingle()

  const now = new Date()

  if (!attData) {
    // Check In
    const { error: insertError } = await supabase
      .from('attendance')
      .insert({
        gym_id: gym.id,
        member_id: memberData.id,
        date,
        session,
        created_at: now.toISOString(),
      })

    if (insertError) {
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: insertError.message } },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        action: 'check_in',
        member: { id: memberData.id, name: memberData.name, member_number: memberData.member_number },
        expiry_date: latestEndDate || null,
        check_in_time: now.toISOString(),
      },
    })
  } else if (!attData.check_out_time) {
    // Check Out
    const { error: updateError } = await supabase
      .from('attendance')
      .update({ check_out_time: now.toISOString() })
      .eq('id', attData.id)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: updateError.message } },
        { status: 500 }
      )
    }

    const checkInDate = new Date(attData.created_at)
    const diffMs = now.getTime() - checkInDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    return NextResponse.json({
      success: true,
      data: {
        action: 'check_out',
        member: { id: memberData.id, name: memberData.name, member_number: memberData.member_number },
        expiry_date: latestEndDate || null,
        check_in_time: attData.created_at,
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
        member: { id: memberData.id, name: memberData.name, member_number: memberData.member_number },
        expiry_date: latestEndDate || null,
        check_in_time: attData.created_at,
        check_out_time: attData.check_out_time,
      },
    })
  }
})
