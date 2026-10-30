import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { mapRenewalRequest, RENEWAL_REQUEST_COLUMNS, type RenewalRequestRow } from '@/lib/member/renewal-data'
import type { OwnerRenewalRequest, RenewalStatus } from '@/types/renewal'

type OwnerRow = RenewalRequestRow & {
  member_id: string
  member: { name: string; member_number: number; phone: string } | null
}

/**
 * The gym's renewal requests, newest first. Runs as the owner (RLS applies); `gymId` must be the
 * server-resolved gym. `currentEndDate` is each member's latest membership end date.
 */
export async function getOwnerRenewalRequests(gymId: string, status?: RenewalStatus): Promise<OwnerRenewalRequest[]> {
  const supabase = await createClient()
  let query = supabase
    .from('member_renewal_requests')
    .select(
      `${RENEWAL_REQUEST_COLUMNS}, member_id, member:members!fk_member_renewal_requests_member_same_gym(name, member_number, phone)`,
    )
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    logger.error('owner_renewal_requests_failed', { error: error.message })
    throw new Error('Could not load renewal requests')
  }
  const rows = (data ?? []) as unknown as OwnerRow[]
  if (rows.length === 0) return []

  const memberIds = [...new Set(rows.map((r) => r.member_id))]
  const { data: ms, error: msError } = await supabase
    .from('memberships')
    .select('member_id, end_date')
    .eq('gym_id', gymId)
    .in('member_id', memberIds)
    .order('end_date', { ascending: false })
  if (msError) {
    logger.error('owner_renewal_memberships_failed', { error: msError.message })
    throw new Error('Could not load renewal requests')
  }
  const latestEnd = new Map<string, string>()
  for (const m of ms ?? []) if (!latestEnd.has(m.member_id)) latestEnd.set(m.member_id, m.end_date)

  return rows.map((r) => ({
    ...mapRenewalRequest(r),
    memberId: r.member_id,
    memberName: r.member?.name ?? '',
    memberNumber: r.member?.member_number ?? 0,
    memberPhone: r.member?.phone ?? '',
    currentEndDate: latestEnd.get(r.member_id) ?? null,
  }))
}

export async function countPendingRenewals(gymId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('member_renewal_requests')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .eq('status', 'pending')
  if (error) {
    logger.error('count_pending_renewals_failed', { error: error.message })
    return 0
  }
  return count ?? 0
}
