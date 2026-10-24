import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { logger } from '@/lib/logger'
import { reportAlertInBackground } from '@/lib/monitoring/alert'
import { startPageTimer, timed } from '@/lib/perf'
import { reportSchema } from './report-data'
import { ReportsClient } from './ReportsClient'
import { parseTopic } from './topics'

/**
 * Deliberately not Redis-cached, unlike the version of this page that was
 * archived in June.
 *
 * A cached report has to be invalidated by every mutation that moves a number on
 * it — payments, dues, members, memberships, imports, inventory sales, check-ins —
 * or an owner records a payment and then reads a revenue figure without it. The
 * saving on offer is small: the payload is ~5KB, a size lib/cache.ts measured at
 * ~511ms per Upstash GET, set against one RPC; and repeat visits are already
 * absorbed by the 180s Router Cache.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ topic?: string | string[] }> }) {
  const { topic } = await searchParams
  const done = startPageTimer('reports')
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) {
    return (
      <div className="card p-6 text-center">
        <p className="text-slate-500">No gym found. Please contact support.</p>
      </div>
    )
  }

  // The gym's calendar day, not the server's: Vercel runs in UTC, where it is
  // still "yesterday" until 5:30 am in India.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

  const supabase = await createClient()
  const { data, error } = await timed('reports (get_gym_reports)', () =>
    supabase.rpc('get_gym_reports', { p_gym_id: gym.id, p_today: today })
  )
  done()

  const report = error ? null : reportSchema.safeParse(data)
  if (!report?.success) {
    logger.error('reports: get_gym_reports failed or returned an unexpected shape — has 20261005120000_restore_reports_rpc.sql been run?', {
      component: 'reports',
      gymId: gym.id,
      rpcError: error?.message,
      shapeError: report && !report.success ? report.error.issues.slice(0, 3) : undefined,
    })
    // Owners see an empty page here, so page us (usually a missing migration or RPC failure).
    reportAlertInBackground({
      key: 'reports:rpc_failed',
      severity: 'critical',
      title: 'Owner reports RPC failed',
      body: `gymId=${gym.id} ${error ? `code=${error.code ?? 'n/a'} message=${String(error.message).slice(0, 300)}` : 'unexpected response shape'}`,
      gymId: gym.id,
    })
    return (
      <div className="card p-6 text-center max-w-lg mx-auto mt-10 space-y-1.5">
        <p className="font-semibold text-slate-900">Reports are not available right now</p>
        <p className="text-sm text-slate-500">We could not load your reports. Please try again in a few minutes.</p>
      </div>
    )
  }

  return <ReportsClient data={report.data} gymName={gym.name} today={today} initialTopic={parseTopic(topic)} />
}
