import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { MembersClient } from './MembersClient'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import type { MemberWithStatus } from '@/types'
import { RequestLogger, apiLogger } from '@/lib/logger'
import { timed } from '@/lib/perf'

// No `revalidate` export: this page reads the auth cookie, which already makes
// it dynamic, so the export was redundant. Repeat visits are served from the
// client Router Cache (see experimental.staleTimes in next.config.js).

const PAGE_SIZE = 200

/**
 * REMOVED: the 300s Upstash `members_list` cache.
 *
 * The cached payload was ~55KB, and this project's Upstash instance takes
 * ~2563ms (median) to GET 55KB over its REST API — versus ~409-613ms to just
 * re-run the queries against Postgres. The cache was costing about 2 extra
 * seconds per page load to avoid half a second of database work, and it was the
 * single largest source of latency on this route.
 *
 * `lib/cache.ts` now refuses to store payloads above MAX_CACHEABLE_BYTES so this
 * cannot be reintroduced by accident.
 *
 * The three queries are also collapsed into ONE PostgREST embedded join.
 * Previously the members query had to resolve first to supply member IDs for the
 * two `.in(...)` membership queries — two serial stages. Fetching memberships
 * nested under members removes that dependency entirely
 * (measured: 407ms median / 205ms min, vs 519ms / 409ms).
 */
async function getMembersData(gymId: string, logger: RequestLogger) {
  logger.info('ENTER getMembersData')
  const supabase = await createClient()

  logger.start('FETCH_MEMBERS')
  const membersRes = await timed('members + memberships (joined)', () =>
    supabase
      .from('members')
      .select(
        'id, gym_id, member_number, name, phone, gender, age, area, pending_amount, created_at, legacy_member_id,' +
        ' memberships(id, plan, start_date, end_date, amount, payment_mode, category, created_at, member_id, gym_id)',
        { count: 'exact' }
      )
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
  )

  const members = membersRes.data ?? []
  const count = membersRes.count ?? 0
  logger.end('FETCH_MEMBERS')

  logger.start('AGGREGATION')
  const result: MemberWithStatus[] = members.map((m: any) => {
      // Pick latest (max created_at) and oldest (min start_date) in one pass.
      // This replaces the two separately-ordered database queries.
      const memberships: any[] = m.memberships ?? []
      let latest: any = null
      let oldest: any = null

      for (const ms of memberships) {
        if (!latest || (ms.created_at ?? '') > (latest.created_at ?? '')) latest = ms
        if (!oldest || (ms.start_date ?? '') < (oldest.start_date ?? '')) oldest = ms
      }

      const join_date = oldest?.start_date?.substring(0, 10) || m.created_at?.substring(0, 10) || ""

      const status = latest ? getMemberStatus(latest.end_date) : 'expired'
      const days_remaining = latest ? getDaysRemaining(latest.end_date) : -999

      return {
        id: m.id,
        gym_id: m.gym_id,
        member_number: m.member_number,
        name: m.name,
        phone: m.phone,
        gender: m.gender,
        age: m.age,
        area: m.area,
        pending_amount: m.pending_amount,
        created_at: m.created_at,
        latest_membership: latest,
        status,
        days_remaining,
        join_date,
        legacy_member_id: m.legacy_member_id
      }
    }).sort((a, b) => {
      const order = { expiring: 0, active: 1, expired: 2 }
      const statusDiff = order[a.status] - order[b.status]
      // Within each status group, sort alphabetically by name
      return statusDiff !== 0 ? statusDiff : a.name.localeCompare(b.name)
    })
  logger.end('AGGREGATION')

  return { result, count: count ?? 0 }
}

export default async function MembersPage() {
  const logger = apiLogger('MEMBERS')
  
  try {
    logger.start('AUTH')
    const { user } = await getAuthUser()
    logger.end('AUTH')
    
    if (!user) return null

    logger.start('QUERY gyms')
    const { gym } = await getGym(user.id)
    logger.end('QUERY gyms')

    if (!gym) return null

    logger.start('FETCH')
    const { result, count } = await getMembersData(gym.id, logger)
    logger.end('FETCH')
    
    // Security/perf: do NOT log the full member payload — it contains PII
    // (names, phone numbers) and serializing hundreds of records on every
    // request is pure overhead. Log only non-sensitive counts.
    logger.info('Payload ready', { returned: result.length, count })
    logger.summary(200)

    return (
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading members...</div>}>
        <MembersClient members={result} gymId={gym.id} totalCount={count} />
      </Suspense>
    )
  } catch (error: any) {
    logger.error('ERROR', error)
    throw error
  }
}
