import 'server-only'
import { cache } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { todayIST } from '@/lib/utils'
import { mapNoticeRow, NOTICE_COLUMNS } from '@/lib/notices/validate'
import { NOTICE_LIMITS, type GymNotice } from '@/types/notice'

/**
 * Active, unexpired notices of the signed-in member's gym, newest first. RLS
 * scopes the rows to the member's own gym. A failure returns [] (and is logged)
 * so a notice problem never breaks the home page.
 */
export const getMemberNotices = cache(async (): Promise<GymNotice[]> => {
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('gym_notices')
    .select(NOTICE_COLUMNS)
    .eq('is_active', true)
    .or(`expires_on.is.null,expires_on.gte.${todayIST()}`)
    .order('created_at', { ascending: false })
    .limit(NOTICE_LIMITS.homeShown)

  if (error) {
    logger.error('Could not load member notices', error)
    return []
  }
  return (data ?? []).map(mapNoticeRow)
})
