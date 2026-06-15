import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { format } from 'date-fns'
import { cacheWrapper } from '@/lib/cache'
import { PerformanceMetrics } from '@/lib/performance'

export const revalidate = 300

async function getReportsData(gymId: string, perf: PerformanceMetrics) {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  
  // New Architecture: 1 Supabase RPC -> Redis Cache
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_gym_reports', { 
    p_gym_id: gymId, 
    p_today: today 
  })

  if (rpcError || !rpcData) {
    console.error('get_gym_reports RPC failed:', rpcError)
    throw new Error('Failed to fetch reports from database. Have you run the RPC migration?')
  }

  // Calculate total members from active + expired (matches original logic)
  const totalMembers = (rpcData.activeCount ?? 0) + (rpcData.expiredCount ?? 0)

  return {
    ...rpcData,
    totalMembers
  }
}

export default async function ReportsPage() {
  console.error("[TRACE] REPORTS_PAGE_EXECUTED")
  const perf = new PerformanceMetrics('Reports')
  perf.start('Total')
  perf.start('Auth')
  
  const supabase = await createClient()
  console.error("[TRACE] REPORTS_BEFORE_AUTH")
  const { data: { user } } = await supabase.auth.getUser()
  console.error("[TRACE] REPORTS_AFTER_AUTH")
  perf.end('Auth')
  
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  if (!gym) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <p className="text-2xl font-bold text-slate-300">No gym found</p>
        <p className="text-sm text-slate-400">Set up your gym profile first to see reports.</p>
      </div>
    )
  }

  const { data: gymProfile } = await supabase
    .from('gyms')
    .select('city, gst_number, phone')
    .eq('id', gym.id)
    .single()
    .then(r => r.error ? { data: null } : r)

  console.error("[TRACE] REPORTS_BEFORE_CACHE")
  const cacheKey = `gym:${gym.id}:reports`
  const reportsData = await cacheWrapper(cacheKey, 300, () => getReportsData(gym.id, perf), perf)
  console.error("[TRACE] REPORTS_AFTER_CACHE")
  
  perf.logPayloadSize('Data', reportsData)
  
  perf.end('Total')
  perf.logTotal()

  console.error("[TRACE] REPORTS_BEFORE_RETURN")
  return (
    <ReportsClient
      {...reportsData}
      gymName={gym.name}
      gymCity={gymProfile?.city ?? null}
      gymGST={gymProfile?.gst_number ?? null}
      gymPhone={gymProfile?.phone ?? null}
      gymId={gym.id}
    />
  )
}
