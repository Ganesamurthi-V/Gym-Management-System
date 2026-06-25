import { createClient } from '@/lib/supabase/server'
import { AttendanceClient } from './AttendanceClient'
import { getMemberStatus } from '@/lib/utils'
import { format } from 'date-fns'
import { cacheWrapper } from '@/lib/cache'
import { RequestLogger } from '@/lib/logger'

export const revalidate = 0

async function getAttendanceData(gymId: string, today: string, logger: RequestLogger) {
  const cacheKey = `gym:${gymId}:attendance:${today}`

  return cacheWrapper(cacheKey, 60, async () => {
    logger.step('ENTER getAttendanceData')
    const supabase = await createClient()

    logger.start('FETCH_MEMBERS')
    const { data: members } = await supabase
      .from('members')
      .select(`
        id,
        name,
        phone,
        member_number,
        memberships(
          end_date
        )
      `)
      .eq('gym_id', gymId)
      .order('name')
    logger.end('FETCH_MEMBERS')

    logger.start('FETCH_ATTENDANCE')
    const { data: todayAttendance } = await supabase
      .from('attendance')
      .select('member_id')
      .eq('gym_id', gymId)
      .eq('date', today)
    logger.end('FETCH_ATTENDANCE')

    logger.start('AGGREGATION')
    const presentSet = new Set((todayAttendance ?? []).map(a => a.member_id))

    const activeMembers = (members ?? []).map(m => {
      const memberships = m.memberships as { end_date: string }[] ?? []
      const latestEndDate = memberships.reduce(
        (max, ms) => ms.end_date > max ? ms.end_date : max,
        ''
      )
      const status = latestEndDate ? getMemberStatus(latestEndDate) : 'expired'
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        member_number: m.member_number,
        present: presentSet.has(m.id),
        status
      }
    }).filter(m => m.status !== 'expired')
    logger.end('AGGREGATION')

    return {
      activeMembers,
      totalPresent: presentSet.size
    }
  }, logger)
}

export default async function AttendancePage() {
  const logger = new RequestLogger('ATTENDANCE')
  
  try {
    logger.start('AUTH')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    logger.end('AUTH')
    
    if (!user) return null

    logger.start('QUERY gyms')
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    logger.end('QUERY gyms')

    if (!gym) return null

    const today = format(new Date(), 'yyyy-MM-dd')

    logger.start('CACHE')
    const { activeMembers, totalPresent } = await getAttendanceData(gym.id, today, logger)
    logger.end('CACHE')
    
    logger.setPayload({ totalPresent })
    logger.summary()

    return (
      <AttendanceClient
        members={activeMembers}
        gymId={gym.id}
        today={today}
        totalPresent={totalPresent}
      />
    )
  } catch (error: any) {
    logger.error('ERROR', error)
    throw error
  }
}
