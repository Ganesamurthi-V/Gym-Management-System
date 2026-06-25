import { createClient } from '@/lib/supabase/server'
import { ReportsClient } from './ReportsClient'
import { format } from 'date-fns'
import { cacheWrapper } from '@/lib/cache'
import { RequestLogger } from '@/lib/logger'

export const revalidate = 300

async function getReportsData(gymId: string, logger: RequestLogger) {
  logger.step('ENTER getReportsData')
  try {
    const supabase = await createClient()
    const today = format(new Date(), 'yyyy-MM-dd')
    
    logger.start('QUERY get_gym_reports')
    // New Architecture: 1 Supabase RPC -> Redis Cache
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_gym_reports', { 
      p_gym_id: gymId, 
      p_today: today 
    })
    logger.end('QUERY get_gym_reports')

    if (rpcError || !rpcData) {
      console.error('get_gym_reports RPC failed:', rpcError)
      throw new Error('Failed to fetch reports from database. Have you run the RPC migration?')
    }

    logger.start('AGGREGATION')
    // Calculate total members from active + expired (matches original logic)
    const totalMembers = (rpcData.activeCount ?? 0) + (rpcData.expiredCount ?? 0)
    logger.end('AGGREGATION')

    logger.step('BEFORE RETURN')
    const result = {
      ...rpcData,
      totalMembers
    }
    logger.step('RETURN OBJECT CREATED')
    return result
  } catch (error: any) {
    logger.error('ERROR', error)
    throw error
  }
}

export default async function ReportsPage() {
  const logger = new RequestLogger('REPORTS')
  
  try {
    logger.start('AUTH')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    logger.end('AUTH')
    logger.step('AFTER AUTH')
    
    if (!user) return null

    logger.start('QUERY gyms')
    const { data: gym } = await supabase
      .from('gyms')
      .select('id, name')
      .eq('owner_id', user.id)
      .single()
    logger.end('QUERY gyms')

    if (!gym) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
          <p className="text-2xl font-bold text-slate-300">No gym found</p>
          <p className="text-sm text-slate-400">Set up your gym profile first to see reports.</p>
        </div>
      )
    }

    logger.start('QUERY gymProfile')
    const { data: gymProfile } = await supabase
      .from('gyms')
      .select('city, gst_number, phone')
      .eq('id', gym.id)
      .single()
      .then(r => r.error ? { data: null } : r)
    logger.end('QUERY gymProfile')

    const cacheKey = `gym:${gym.id}:reports`
    logger.start('CACHE')
    const reportsData = await cacheWrapper(cacheKey, 300, () => getReportsData(gym.id, logger), logger)
    logger.end('CACHE')
    
    logger.setPayload(reportsData)
    logger.summary()

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
  } catch (error: any) {
    logger.error('ERROR', error)
    throw error
  }
}
