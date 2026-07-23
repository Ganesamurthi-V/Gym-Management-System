import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { MembersClient } from './MembersClient'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import type { MemberWithStatus } from '@/types'
import { cacheWrapper } from '@/lib/cache'
import { RequestLogger, apiLogger } from '@/lib/logger'

// Issue 5 fix: Removed `export const revalidate = 0`.
// getMembersData is already wrapped in cacheWrapper (300s Redis TTL) and
// all mutation paths (new member, edit, bulk-edit, delete) call
// invalidateMembersCache() to bust the cache on actual data changes.
// Keeping revalidate=0 forced a full Server Component re-execute on every hit
// despite the data being served from Redis — pure waste with no correctness benefit.

const PAGE_SIZE = 200

async function getMembersData(gymId: string, logger: RequestLogger) {
  const cacheKey = `gym:${gymId}:members_list`

  return cacheWrapper(cacheKey, 300, async () => {
    logger.info('ENTER getMembersData')
    const supabase = await createClient()

    logger.start('FETCH_MEMBERS')
    // Fetch the current page of members first, then fetch ONLY those members'
    // memberships. Previously this pulled EVERY membership row for the whole gym
    // (unbounded) even though only PAGE_SIZE members are displayed — a full-table
    // scan that grew linearly with the gym's entire renewal history.
    const membersRes = await supabase
      .from('members')
      .select('id, gym_id, member_number, name, phone, gender, age, area, pending_amount, created_at, legacy_member_id', { count: 'exact' })
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    const members = membersRes.data ?? []
    const count = membersRes.count ?? 0
    const memberIds = members.map(m => m.id)

    // Build lookup maps for O(1) access
    const latestByMember = new Map<string, any>()
    const oldestByMember = new Map<string, any>()

    if (memberIds.length > 0) {
      const [latestMembershipsRes, oldestMembershipsRes] = await Promise.all([
        // Latest membership per member (most recent created_at)
        supabase
          .from('memberships')
          .select('id, plan, start_date, end_date, amount, payment_mode, category, created_at, member_id, gym_id')
          .in('member_id', memberIds)
          .order('member_id', { ascending: true })
          .order('created_at', { ascending: false }),
        // Oldest membership per member (earliest start_date)
        supabase
          .from('memberships')
          .select('start_date, member_id')
          .in('member_id', memberIds)
          .order('member_id', { ascending: true })
          .order('start_date', { ascending: true })
      ])

      for (const m of latestMembershipsRes.data ?? []) {
        if (!latestByMember.has(m.member_id)) {
          latestByMember.set(m.member_id, m)
        }
      }

      for (const m of oldestMembershipsRes.data ?? []) {
        if (!oldestByMember.has(m.member_id)) {
          oldestByMember.set(m.member_id, m)
        }
      }
    }
    logger.end('FETCH_MEMBERS')

    logger.start('AGGREGATION')
    const result: MemberWithStatus[] = members.map(m => {
      const latest = latestByMember.get(m.id) ?? null
      const oldest = oldestByMember.get(m.id) ?? null
      
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
  }, logger)
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

    logger.start('CACHE')
    const { result, count } = await getMembersData(gym.id, logger)
    logger.end('CACHE')
    
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
