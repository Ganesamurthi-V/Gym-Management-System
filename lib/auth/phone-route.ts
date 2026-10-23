import 'server-only'

import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/withAuth'

/**
 * Shared guard for /api/auth/phone/*. `withAuth` cannot be used because the caller has no
 * gym yet, so this does the same two jobs: CSRF header and server-resolved session user.
 */
export async function requirePhoneRouteUser(
  req: NextRequest,
  opts: { csrf: boolean },
): Promise<{ user: User } | { response: ReturnType<typeof apiError> }> {
  if (opts.csrf && req.headers.get('x-requested-with') !== 'XMLHttpRequest') {
    return { response: apiError(403, 'FORBIDDEN', 'Invalid request.') }
  }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { response: apiError(401, 'UNAUTHORIZED', 'You must be signed in to verify your number.') }
  }
  return { user }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
}
