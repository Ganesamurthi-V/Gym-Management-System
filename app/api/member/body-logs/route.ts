import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { passesCsrfCheck, apiError, apiSuccess } from '@/lib/api/withAuth'
import { bodyLogSchema } from '@/lib/progress/validate'

export const dynamic = 'force-dynamic'

const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  INVALID_DATE: { status: 400, code: 'VALIDATION_ERROR', message: 'Choose today or a date within the last year.' },
  EMPTY_LOG: { status: 400, code: 'VALIDATION_ERROR', message: 'Enter at least one measurement.' },
  INVALID_VALUE: { status: 400, code: 'VALIDATION_ERROR', message: 'One of the values is out of range.' },
  NOT_MEMBER: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
  MEMBER_APP_BLOCKED: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
}

/**
 * POST /api/member/body-logs  { logged_on?, weight_kg?, waist_cm?, chest_cm?, hips_cm?, arm_cm?, thigh_cm? }
 * One entry per day: saving again the same day replaces it. Member and gym come from auth.uid() inside
 * save_body_log; nothing identifying is read from the body.
 */
export async function POST(req: NextRequest) {
  if (!passesCsrfCheck(req)) return apiError(403, 'FORBIDDEN', 'Forbidden')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError(401, 'FORBIDDEN', 'Unauthorized')

  const { allowed } = await checkRateLimit(user.id, 'POST /api/member/body-logs', 30)
  if (!allowed) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Invalid request.')
  }
  const parsed = bodyLogSchema.safeParse(json)
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid values.')
  }
  const b = parsed.data

  const { data: id, error } = await supabase.rpc('save_body_log', {
    p_logged_on: b.logged_on ?? null,
    p_weight_kg: b.weight_kg,
    p_waist_cm: b.waist_cm,
    p_chest_cm: b.chest_cm,
    p_hips_cm: b.hips_cm,
    p_arm_cm: b.arm_cm,
    p_thigh_cm: b.thigh_cm,
  } as never)
  if (error || !id) {
    const known = RPC_ERRORS[error?.message ?? '']
    if (known) return apiError(known.status, known.code, known.message)
    logger.error('body_log_save_failed', { error: error?.message })
    return apiError(500, 'SERVER_ERROR', 'Could not save. Please try again.')
  }
  return apiSuccess({ id }, 201)
}
