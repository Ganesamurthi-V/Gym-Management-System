import 'server-only'
import { cache } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { getMemberNotices } from '@/lib/member/notice-data'
import { RENEWAL_REQUEST_COLUMNS, mapRenewalRequest, type RenewalRequestRow } from '@/lib/member/renewal-data'
import {
  mergeNotifications, requestToNotification,
  type MemberNotification,
} from '@/lib/member/notificationsMerge'

export type { MemberNotification }

/**
 * Everything in the member's bell inbox: gym notices plus the outcome of their own payment requests.
 * Never throws: a failure is logged and whatever loaded is returned, so the home page cannot break.
 */
export const getMemberNotifications = cache(async (): Promise<{ items: MemberNotification[]; failed: boolean }> => {
  const supabase = await getServerClient()
  const [notices, res] = await Promise.all([
    getMemberNotices(20),
    supabase
      .from('member_renewal_requests')
      .select(RENEWAL_REQUEST_COLUMNS)
      .in('status', ['approved', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  if (res.error) logger.error('Could not load member request notifications', res.error)
  const requests = res.error
    ? []
    : ((res.data ?? []) as unknown as RenewalRequestRow[]).map(r => requestToNotification(mapRenewalRequest(r)))
  return { items: mergeNotifications(notices, requests), failed: !!res.error }
})
