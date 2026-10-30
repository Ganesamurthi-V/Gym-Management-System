import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiLogger } from '@/lib/logger'
import { normalizeRequestPath } from '@/lib/activity/normalize'

/**
 * Owner activity log for routes that authenticate themselves instead of using withAuth.
 * Call once on the success path, after authentication, with the route's own user client so the
 * RPC runs as the owner. after() runs once the response is sent, so it never delays it; a
 * logging failure is logged, never thrown.
 */
export function recordOwnerAction(
  supabase: Pick<SupabaseClient, 'rpc'>,
  req: { nextUrl: { pathname: string } },
  label: string,
): void {
  try {
    const log = apiLogger(label)
    const actionPath = normalizeRequestPath(req.nextUrl.pathname)
    if (actionPath === '/api/owner/activity') return
    after(async () => {
      try {
        const { error } = await supabase.rpc('record_owner_activity', {
          p_kind: 'action', p_path: actionPath, p_label: label, p_platform: null,
        })
        if (error) log.error('record_owner_activity failed', error)
      } catch (e) {
        log.error('record_owner_activity threw', e)
      }
    })
  } catch { /* no request scope or a bare test request; logging is best-effort */ }
}
