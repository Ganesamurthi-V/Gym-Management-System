import { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess } from '@/lib/api/withAuth'
import {
  TOUR_VERSION,
  isTourChapterId,
  isTourStatus,
  readTourProgress,
  sanitizeTourProgress,
  MAX_TOUR_STEP_INDEX,
  type TourProgress,
} from '@/lib/tours/progress'

export const dynamic = 'force-dynamic'

/**
 * /api/tours — guided-tour progress for the authenticated owner's gym.
 *
 * Stored under the `tour` key of the existing `gyms.onboarding_data` JSONB
 * column, so there is no schema change, no migration and no new table.
 *
 * SECURITY
 * --------
 *   - `withAuth` resolves the gym from the server-side session via
 *     `getGymForUser()`. The client never supplies `gym_id`, `owner_id` or a
 *     role, and none would be trusted if it did.
 *   - Writes are additionally constrained by `owner_id = user.id`, matching the
 *     pattern in `/api/onboarding/complete`, so RLS plus an explicit predicate
 *     both have to agree before a row changes.
 *   - Every field of the request body is validated and clamped; unknown keys are
 *     dropped rather than merged.
 *   - Raw PostgREST errors are logged server-side and never returned.
 *
 * A deliberately small surface: one GET to read and one POST to write, rather
 * than separate progress/complete/reset endpoints that would each need their own
 * auth, validation and rate limit.
 */

/** GET → the caller's saved tour progress. */
export const GET = withAuth('TOURS_GET', async (_req: NextRequest, { supabase, gym, log }) => {
  const { data, error } = await supabase
    .from('gyms')
    .select('onboarding_data')
    .eq('id', gym.id)
    .single()

  if (error) {
    log.error('Failed to read tour progress', error)
    return apiError(500, 'INTERNAL_ERROR', 'Could not load tour progress')
  }

  return apiSuccess(readTourProgress(data?.onboarding_data))
})

/**
 * POST → save progress.
 *
 * Body: `{ status, chapterId?, stepIndex? }`
 *   status    'in_progress' while walking through, 'completed' on finish,
 *             'dismissed' when the owner closes it, 'not_started' to reset for a
 *             replay.
 *   chapterId chapter to resume in (null clears it)
 *   stepIndex index within that chapter
 *
 * Rate limit is raised above the 30/min default because progress is saved as the
 * owner advances; the browser hook debounces, so real traffic stays well under.
 */
export const POST = withAuth(
  'TOURS_POST',
  async (req: NextRequest, { supabase, user, gym, log }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return apiError(400, 'BAD_REQUEST', 'Invalid request')
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return apiError(400, 'BAD_REQUEST', 'Invalid request')
    }

    const payload = body as Record<string, unknown>

    // ── Validate every field explicitly; reject rather than coerce silently ──
    if (!isTourStatus(payload.status)) {
      return apiError(400, 'BAD_REQUEST', 'Invalid request')
    }

    const chapterId =
      payload.chapterId === undefined || payload.chapterId === null
        ? null
        : isTourChapterId(payload.chapterId)
          ? payload.chapterId
          : undefined

    if (chapterId === undefined) {
      return apiError(400, 'BAD_REQUEST', 'Invalid request')
    }

    let stepIndex = 0
    if (payload.stepIndex !== undefined) {
      if (
        typeof payload.stepIndex !== 'number' ||
        !Number.isInteger(payload.stepIndex) ||
        payload.stepIndex < 0 ||
        payload.stepIndex > MAX_TOUR_STEP_INDEX
      ) {
        return apiError(400, 'BAD_REQUEST', 'Invalid request')
      }
      stepIndex = payload.stepIndex
    }

    // ── Read-modify-write ────────────────────────────────────────────────────
    // `onboarding_data` also holds everything the setup wizard saved (gymType,
    // plans, metrics, operations, marketing, aiPersonalization, completedAt...).
    // Merging server-side in one handler means the tour can never overwrite
    // those fields, which a blind column update would wipe out.
    const { data: existing, error: readError } = await supabase
      .from('gyms')
      .select('onboarding_data')
      .eq('id', gym.id)
      .single()

    if (readError) {
      log.error('Failed to read onboarding_data before tour write', readError)
      return apiError(500, 'INTERNAL_ERROR', 'Could not save tour progress')
    }

    const currentBlob =
      typeof existing?.onboarding_data === 'object' &&
      existing.onboarding_data !== null &&
      !Array.isArray(existing.onboarding_data)
        ? (existing.onboarding_data as Record<string, unknown>)
        : {}

    const previous = sanitizeTourProgress(currentBlob.tour)
    const now = new Date().toISOString()

    const next: TourProgress = {
      version: TOUR_VERSION,
      status: payload.status,
      chapterId,
      stepIndex,
      // Preserve the original start time across resumes; clear it on reset.
      startedAt:
        payload.status === 'not_started'
          ? null
          : (previous.startedAt ?? now),
      updatedAt: now,
    }

    const { error: writeError } = await supabase
      .from('gyms')
      .update({ onboarding_data: { ...currentBlob, tour: next } })
      .eq('id', gym.id)
      .eq('owner_id', user.id)

    if (writeError) {
      log.error('Failed to save tour progress', writeError)
      return apiError(500, 'INTERNAL_ERROR', 'Could not save tour progress')
    }

    return apiSuccess(next)
  },
  { rateLimit: 60 },
)
