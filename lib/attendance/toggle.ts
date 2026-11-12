import type { SupabaseClient } from '@supabase/supabase-js'

export type ToggleResult =
  | { ok: true; action: 'check_in' | 'check_out' | 'already_out'; attendanceId: string | null; checkInTime: string | null; checkOutTime: string | null }
  | { ok: false; step: 'select' | 'insert' | 'update'; error: { message: string } }

/**
 * The kiosk's check-in / check-out toggle for one member, day and session, shared with device punches.
 * `at` is the instant to record (now for the kiosk, the punch time for a device).
 * `source` is only written for devices so the kiosk insert is unchanged and does not depend on the column.
 */
export async function toggleAttendance(
  db: SupabaseClient,
  args: { gymId: string; memberId: string; date: string; session: 'morning' | 'evening'; at: Date; source?: 'device' },
): Promise<ToggleResult> {
  const { gymId, memberId, date, session, at, source } = args

  const { data: attData, error: selectError } = await db
    .from('attendance')
    .select('id, created_at, check_out_time')
    .eq('gym_id', gymId)
    .eq('member_id', memberId)
    .eq('date', date)
    .eq('session', session)
    .maybeSingle()
  if (selectError) return { ok: false, step: 'select', error: selectError }

  if (!attData) {
    const { data: inserted, error: insertError } = await db
      .from('attendance')
      .insert({
        gym_id: gymId,
        member_id: memberId,
        date,
        session,
        created_at: at.toISOString(),
        ...(source ? { source } : {}),
      })
      .select('id')
      .single()
    if (insertError) return { ok: false, step: 'insert', error: insertError }
    return { ok: true, action: 'check_in', attendanceId: inserted?.id ?? null, checkInTime: at.toISOString(), checkOutTime: null }
  }

  if (!attData.check_out_time) {
    const { error: updateError } = await db
      .from('attendance')
      .update({ check_out_time: at.toISOString() })
      .eq('id', attData.id)
    if (updateError) return { ok: false, step: 'update', error: updateError }
    return { ok: true, action: 'check_out', attendanceId: attData.id, checkInTime: attData.created_at, checkOutTime: at.toISOString() }
  }

  return { ok: true, action: 'already_out', attendanceId: attData.id, checkInTime: attData.created_at, checkOutTime: attData.check_out_time }
}
