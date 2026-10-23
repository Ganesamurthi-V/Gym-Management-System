import { NextRequest } from 'next/server'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePhoneRouteUser } from '@/lib/auth/phone-route'

export const dynamic = 'force-dynamic'

/** GET /api/auth/phone/status: has the signed-in user verified a mobile number? */
export async function GET(req: NextRequest) {
  const auth = await requirePhoneRouteUser(req, { csrf: false })
  if ('response' in auth) return auth.response

  const { data, error } = await createAdminClient()
    .from('owner_verified_phones')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) {
    console.error('[auth/phone/status] lookup failed:', error.message)
    return apiError(500, 'DATABASE_ERROR', 'We could not check your verification. Please try again.')
  }
  return apiSuccess({ verified: Boolean(data) })
}
