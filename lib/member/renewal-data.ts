import 'server-only'
import { cache } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { getMemberWithGym } from '@/lib/member/member-data'
import { logger } from '@/lib/logger'
import type { RenewalOptions, RenewalPageData, RenewalRequest } from '@/types/renewal'

/** Columns read from member_renewal_requests (never proof_path). */
export const RENEWAL_REQUEST_COLUMNS =
  'id, request_type, plan_name, duration, months, category, amount, status, transaction_id, notes, reject_reason, created_at, reviewed_at'

export type RenewalRequestRow = {
  id: string
  request_type: RenewalRequest['kind']
  plan_name: string
  duration: RenewalRequest['duration']
  months: number | null
  category: RenewalRequest['category']
  amount: number
  status: RenewalRequest['status']
  transaction_id: string | null
  notes: string | null
  reject_reason: string | null
  created_at: string
  reviewed_at: string | null
}

export function mapRenewalRequest(r: RenewalRequestRow): RenewalRequest {
  return {
    id: r.id,
    kind: r.request_type,
    planName: r.plan_name,
    duration: r.duration,
    months: r.months,
    category: r.category,
    amount: r.amount,
    status: r.status,
    transactionId: r.transaction_id,
    notes: r.notes,
    rejectReason: r.reject_reason,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  }
}

/**
 * Everything the member renew page needs, or null when the caller is not a member (or their gym's
 * plan has no member app). Runs as the member: the RPC resolves the gym from auth.uid(), and RLS limits
 * the request read to the member's own rows.
 */
export const getRenewalPageData = cache(async (): Promise<RenewalPageData | null> => {
  const access = await getMemberWithGym()
  if (!access) return null

  const supabase = await getServerClient()
  const newest = (kind: RenewalRequest['kind']) =>
    supabase
      .from('member_renewal_requests')
      .select(RENEWAL_REQUEST_COLUMNS)
      .eq('request_type', kind)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  const [optionsRes, latestRes, latestDueRes, memberRes] = await Promise.all([
    supabase.rpc('get_member_renewal_options'),
    newest('renewal'),
    newest('due'),
    // RLS limits this to the member's own row.
    supabase.from('members').select('pending_amount').limit(1).maybeSingle(),
  ])

  if (optionsRes.error) {
    logger.error('renewal_options_failed', { error: optionsRes.error.message })
    return null
  }
  if (latestRes.error) {
    logger.error('renewal_latest_failed', { error: latestRes.error.message })
    return null
  }
  if (latestDueRes.error) {
    logger.error('renewal_latest_due_failed', { error: latestDueRes.error.message })
    return null
  }
  if (memberRes.error) {
    logger.error('renewal_pending_due_failed', { error: memberRes.error.message })
    return null
  }
  const options = optionsRes.data as RenewalOptions | null
  if (!options) return null

  return {
    options,
    latest: latestRes.data ? mapRenewalRequest(latestRes.data as unknown as RenewalRequestRow) : null,
    pendingDue: Math.max(0, memberRes.data?.pending_amount ?? 0),
    latestDue: latestDueRes.data ? mapRenewalRequest(latestDueRes.data as unknown as RenewalRequestRow) : null,
  }
})
