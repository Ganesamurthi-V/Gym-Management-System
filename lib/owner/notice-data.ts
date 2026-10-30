import 'server-only'
import { getServerClient } from '@/lib/supabase/server'
import { mapNoticeRow, NOTICE_COLUMNS } from '@/lib/notices/validate'
import type { GymNotice } from '@/types/notice'

/** All of a gym's notices (including hidden and expired), newest first, up to 100. Throws on error. */
export async function getOwnerNotices(gymId: string): Promise<GymNotice[]> {
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('gym_notices')
    .select(NOTICE_COLUMNS)
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Could not load notices: ${error.message}`)
  return (data ?? []).map(mapNoticeRow)
}
