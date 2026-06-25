'use server'

import { createClient } from '@/lib/supabase/server'
import { RequestLogger } from '@/lib/logger'

export async function fetchAttendanceLogsAction(
  gymId: string,
  startDate: string | null,
  endDate: string | null,
  session: 'all' | 'morning' | 'evening'
) {
  const logger = new RequestLogger('ATTENDANCE_LOG_ACTION')
  try {
    logger.step('ENTER fetchAttendanceLogsAction')
    const supabase = await createClient()
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Verify gym ownership
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .eq('id', gymId)
      .single()
    
    if (!gym) throw new Error('Unauthorized')

    let query = supabase
      .from('attendance')
      .select(`
        id, member_id, gym_id, date, created_at, check_out_time, session,
        members ( id, name, member_number, phone )
      `)
      .eq('gym_id', gymId)

    if (startDate) {
      if (startDate.includes('T')) {
        query = query.gte('created_at', new Date(startDate).toISOString())
      } else {
        query = query.gte('date', startDate)
      }
    }
    if (endDate) {
      if (endDate.includes('T')) {
        query = query.lte('created_at', new Date(endDate).toISOString())
      } else {
        query = query.lte('date', endDate)
      }
    }
    if (session !== 'all') {
      query = query.eq('session', session)
    }

    // Default limit to 1000 records to prevent browser crashing
    query = query.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1000)

    logger.start('FETCH_LOGS')
    const { data, error } = await query
    logger.end('FETCH_LOGS')

    if (error) throw error

    return { success: true, data }
  } catch (err: any) {
    logger.error('ERROR', err)
    return { success: false, error: err.message || 'Failed to fetch logs' }
  } finally {
    logger.summary()
  }
}
