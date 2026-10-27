import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { passesCsrfCheck, apiError, apiSuccess } from '@/lib/api/withAuth'
import { bodyProfileSchema } from '@/lib/progress/validate'
import { targetDateValid } from '@/lib/progress/plan'
import { todayIST } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  INVALID_VALUE: { status: 400, code: 'VALIDATION_ERROR', message: 'Height, goal or target is out of range. The target date must be within the next 2 years.' },
  NOT_MEMBER: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
  MEMBER_APP_BLOCKED: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
}

/**
 * POST /api/member/body-profile  { height_cm, goal, target_weight_kg?, target_date? }
 * Saves (or replaces) the caller's height and goal. The member comes from auth.uid() inside
 * save_body_profile; nothing identifying is read from the body.
 */
export async function POST(req: NextRequest) {
  if (!passesCsrfCheck(req)) return apiError(403, 'FORBIDDEN', 'Forbidden')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError(401, 'FORBIDDEN', 'Unauthorized')

  const { allowed } = await checkRateLimit(user.id, 'POST /api/member/body-profile', 30)
  if (!allowed) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Invalid request.')
  }
  const parsed = bodyProfileSchema.safeParse(json)
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_ERROR', 'Enter a height between 100 and 230 cm, choose a goal, and give a target weight and date together.')
  }

  const { target_date } = parsed.data
  if (target_date && !targetDateValid(target_date, todayIST())) {
    return apiError(400, 'VALIDATION_ERROR', 'Choose a target date within the next 2 years.')
  }

  const { error } = await supabase.rpc('save_body_profile', {
    p_height_cm: parsed.data.height_cm,
    p_goal: parsed.data.goal,
    p_target_weight_kg: parsed.data.target_weight_kg ?? null,
    p_target_date: parsed.data.target_date ?? null,
  } as never)
  if (error) {
    const known = RPC_ERRORS[error.message]
    if (known) return apiError(known.status, known.code, known.message)
    logger.error('body_profile_save_failed', { error: error.message })
    return apiError(500, 'SERVER_ERROR', 'Could not save. Please try again.')
  }
  return apiSuccess({ saved: true })
}
