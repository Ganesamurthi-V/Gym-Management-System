import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import { DashboardClient } from './DashboardClient'
import { format } from 'date-fns'

import { cacheWrapper } from '@/lib/cache'
import { apiLogger, type RequestLogger } from '@/lib/logger'

async function getDashboardData(gymId: string, logger: RequestLogger) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const cacheKey = `gym:${gymId}:dashboard:${today}`

  return cacheWrapper(cacheKey, 300, async () => {
    const supabase = await createClient()

    // Try RPC first (Phase 4 optimization)
    logger.start('RPC get_gym_dashboard')
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_gym_dashboard', { p_gym_id: gymId, p_today: today })
    logger.end('RPC get_gym_dashboard')
    
    if (!rpcError && rpcData) {
      return rpcData as { stats: any, expiringMembers: any[] }
    }

    // Fallback to JS aggregation if RPC is not yet created in the DB
    console.warn('Fallback to JS aggregation for Dashboard. Please run the dashboard RPC migration.')
    
    // Only fetch memberships expiring within last/next year to prevent full table scan
    const oneYearAgo = format(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    
    logger.start('DB_QUERIES')
    const [membershipsRes, attendanceRes, todayPaymentsRes, duesRes] = await Promise.all([
      supabase
        .from('memberships')
        .select('member_id, end_date, member:members(id, name, phone, member_number)')
        .eq('gym_id', gymId)
        .gte('end_date', oneYearAgo)
        .order('created_at', { ascending: false }),
      supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('gym_id', gymId).eq('date', today),
      supabase.from('memberships').select('amount, admission_fee').eq('gym_id', gymId).eq('start_date', today),
      supabase.from('members').select('pending_amount').eq('gym_id', gymId).gt('pending_amount', 0),
    ])
    logger.end('DB_QUERIES')

    const memberMap = new Map<string, any>()
    for (const m of membershipsRes.data ?? []) {
      if (!m.member || memberMap.has(m.member_id)) continue
      const status = getMemberStatus(m.end_date)
      const daysRemaining = getDaysRemaining(m.end_date)
      memberMap.set(m.member_id, { ...(m.member as any), latest_membership: m as any, status, days_remaining: daysRemaining })
    }

    const allMembers = Array.from(memberMap.values()) as any[]
    const expiringThisWeek = allMembers.filter(m => m.status === 'expiring')

    const todayCollection = (todayPaymentsRes.data ?? []).reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
    const totalDues = (duesRes.data ?? []).reduce((s, m) => s + (m.pending_amount ?? 0), 0)

    return {
      stats: {
        total_active: allMembers.filter(m => m.status === 'active' || m.status === 'expiring').length,
        expiring_this_week: expiringThisWeek.length,
        expired_count: allMembers.filter(m => m.status === 'expired').length,
        today_attendance: attendanceRes.count ?? 0,
        today_collection: todayCollection,
        total_dues: totalDues,
      },
      expiringMembers: expiringThisWeek.sort((a, b) => a.days_remaining - b.days_remaining),
    }
  })
}

export default async function DashboardPage() {
  const logger = apiLogger('DASHBOARD')
  
  try {
    logger.start('AUTH')
    const { user } = await getAuthUser()
    logger.end('AUTH')
    logger.info('AFTER AUTH')
    
    if (!user) return null

    logger.start('QUERY gyms')
    const { gym } = await getGym(user.id)
    logger.end('QUERY gyms')

    if (!gym) {
      return (
        <div className="card p-6 text-center">
          <p className="text-slate-500">No gym found. Please contact support.</p>
        </div>
      )
    }

    logger.start('CACHE')
    const dashboardData = await getDashboardData(gym.id, logger)
    logger.end('CACHE')
    
    logger.summary(200)

    return (
      <DashboardClient gymName={gym.name} stats={dashboardData.stats} expiringMembers={dashboardData.expiringMembers} gymId={gym.id} />
    )
  } catch (error: any) {
    logger.error('ERROR', error)
    throw error
  }
}
