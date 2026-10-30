import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { passesCsrfCheck, apiError, apiSuccess } from '@/lib/api/withAuth'
import { workoutSessionSchema } from '@/lib/progress/validate'

export const dynamic = 'force-dynamic'

/**
 * POST /api/member/workout-sessions
 *   { client_id, program_name, day_label, started_at, duration_seconds, exercises: [{ name, sets: [{ reps, weight_kg, done }] }] }
 * Idempotent on client_id: a retry returns the id of the first save. Totals are computed in the database.
 */
export async function POST(req: NextRequest) {
  if (!passesCsrfCheck(req)) return apiError(403, 'FORBIDDEN', 'Forbidden')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError(401, 'FORBIDDEN', 'Unauthorized')

  const { allowed } = await checkRateLimit(user.id, 'POST /api/member/workout-sessions', 20)
  if (!allowed) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Invalid request.')
  }
  const parsed = workoutSessionSchema.safeParse(json)
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', 'Invalid workout data.')
  const s = parsed.data

  const { data: id, error } = await supabase.rpc('save_workout_session', {
    p_client_id: s.client_id,
    p_program_name: s.program_name,
    p_day_label: s.day_label,
    p_started_at: s.started_at,
    p_duration_seconds: s.duration_seconds,
    p_exercises: s.exercises,
  } as never)
  if (error || !id) {
    switch (error?.message) {
      case 'INVALID_SESSION':
        return apiError(400, 'VALIDATION_ERROR', 'Invalid workout data.')
      case 'NOT_MEMBER':
      case 'MEMBER_APP_BLOCKED':
        return apiError(403, 'FORBIDDEN', 'Forbidden')
    }
    logger.error('workout_session_save_failed', { error: error?.message })
    return apiError(500, 'SERVER_ERROR', 'Could not save your workout. Please try again.')
  }
  return apiSuccess({ id }, 201)
}
