import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { format } from 'date-fns'
import { cacheWrapper } from '@/lib/cache'
import { PerformanceMetrics } from '@/lib/performance'

export const revalidate = 300

async function getReportsData(gymId: string, perf: PerformanceMetrics) {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  
  perf.start('Data')
  // New Architecture: 1 Supabase RPC -> Redis Cache
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_gym_reports', { 
    p_gym_id: gymId, 
    p_today: today 
  })
  perf.end('Data')

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
  const perf = new PerformanceMetrics('Reports')
  perf.start('Total')
  perf.start('Auth')
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  perf.start('Cache')
  const cacheKey = `gym:${gym.id}:reports`
  const reportsData = await cacheWrapper(cacheKey, 300, () => getReportsData(gym.id, perf))
  perf.end('Cache')
  
  perf.logPayloadSize('Data', reportsData)
  
  perf.end('Total')
  perf.logTotal()

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
