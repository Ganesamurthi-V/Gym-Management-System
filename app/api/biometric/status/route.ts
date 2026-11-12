import { withAuth, apiSuccess, apiError } from '@/lib/api/withAuth'
import { deviceConnectionSummary } from '@/lib/devices/ui'

export const dynamic = 'force-dynamic'

// Used by the Add Member confirm screen to decide whether to offer "send to device". The gym comes from the
// session, never from the request.
export const GET = withAuth('BIOMETRIC_STATUS', async (_req, { supabase, gym }) => {
  const { data, error } = await supabase
    .from('attendance_devices')
    .select('last_seen_at, is_active')
    .eq('gym_id', gym.id)

  if (error) return apiError(500, 'DATABASE_ERROR', 'Could not check the biometric device.')

  return apiSuccess(
    deviceConnectionSummary(
      (data ?? []).map(d => ({ lastSeenAt: d.last_seen_at as string | null, isActive: !!d.is_active })),
    ),
  )
})
