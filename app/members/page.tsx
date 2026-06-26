import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { MembersClient } from './MembersClient'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import type { MemberWithStatus } from '@/types'
import { cacheWrapper } from '@/lib/cache'
import { RequestLogger } from '@/lib/logger'

export const revalidate = 0

const PAGE_SIZE = 200

async function getMembersData(gymId: string, logger: RequestLogger) {
  const cacheKey = `gym:${gymId}:members_list`

  return cacheWrapper(cacheKey, 60, async () => {
    logger.step('ENTER getMembersData')
    const supabase = await createClient()

    logger.start('FETCH_MEMBERS')
    const { data: members, count } = await supabase
      .from('members')
      .select(`
        id, gym_id, member_number, name, phone, gender, age, area, pending_amount, created_at, legacy_member_id,
        memberships(
          id, plan, start_date, end_date, amount, payment_mode, category, created_at, member_id, gym_id
        )
      `, { count: 'exact' })
      .eq('gym_id', gymId)
      .order('name')
      .limit(PAGE_SIZE)
    logger.end('FETCH_MEMBERS')

    logger.start('AGGREGATION')
    const result: MemberWithStatus[] = (members ?? []).map(m => {
      const memberships = m.memberships as any[] ?? [];
      
      const sortedByCreated = [...memberships].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const latest = sortedByCreated[0] ?? null;
      
      const sortedByStartDate = [...memberships].sort((a, b) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
        const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
        return dateA - dateB;
      });
      const oldest = sortedByStartDate[0] ?? null;
      
      const join_date = oldest?.start_date?.substring(0, 10) || m.created_at?.substring(0, 10) || "";
      
      const status = latest ? getMemberStatus(latest.end_date) : 'expired';
      const days_remaining = latest ? getDaysRemaining(latest.end_date) : -999;
      
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
      return order[a.status] - order[b.status]
    })
    logger.end('AGGREGATION')

    return { result, count: count ?? 0 }
  }, logger)
}

export default async function MembersPage() {
  const logger = new RequestLogger('MEMBERS')
  
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
    
    logger.setPayload({ result, count })
    logger.summary()

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
