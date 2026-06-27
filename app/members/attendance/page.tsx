import { Suspense } from 'react' // Force recompile
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { AttendanceLogClient } from './AttendanceLogClient'
import { RequestLogger } from '@/lib/logger'
import { redirect } from 'next/navigation'

export const revalidate = 0

async function getAttendanceLogs(gymId: string, logger: RequestLogger) {
  logger.step('ENTER getAttendanceLogs')
  const supabase = await createClient()

  logger.start('FETCH_LOGS')
  // Fetch the last 7 days by default to keep the initial load fast
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  const { data: logs, error } = await supabase
    .from('attendance')
    .select(`
      id, member_id, gym_id, date, created_at, check_out_time, session,
      members ( id, name, member_number, phone )
    `)
    .eq('gym_id', gymId)
    .gte('date', sevenDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  logger.end('FETCH_LOGS')
  if (error) throw error

  return logs ?? []
}

export default async function AttendanceLogPage() {
  const logger = new RequestLogger('ATTENDANCE_LOG')
  
  try {
    logger.start('AUTH')
    const { user } = await getAuthUser()
    logger.end('AUTH')
    
    if (!user) redirect('/auth/login')

    logger.start('QUERY gyms')
    const { gym } = await getGym(user.id)
    logger.end('QUERY gyms')

    if (!gym) redirect('/onboarding')

    const logs = await getAttendanceLogs(gym.id, logger)
    logger.summary()

    return (
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading attendance...</div>}>
        <AttendanceLogClient initialLogs={logs} gymId={gym.id} />
      </Suspense>
    )
  } catch (error: any) {
    logger.error('ERROR', error)
    throw error
  }
}
