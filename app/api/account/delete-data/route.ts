import { NextRequest } from 'next/server'
import { withAuth, apiError, apiSuccess, isValidUUID } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/delete-data
 *
 * Deletes every member record for the gym — members, and by cascade their
 * memberships, attendance and payments — while leaving the gym row and the
 * owner's own login intact.
 *
 * ─── WHY MEMBER LOGINS GO TOO ──────────────────────────────────────────────
 * Members who activated the member app have their own Supabase Auth user, linked
 * by `members.auth_user_id`. Deleting only the `members` rows left those Auth
 * users alive and able to sign in, pointing at a member record that no longer
 * exists. So this now removes them alongside the rows they belong to.
 *
 * The owner's login is explicitly preserved — that is the whole distinction
 * between this endpoint and `/api/account/delete-gym`, and it is what the
 * dialog's "Your gym login and account will remain active" line promises.
 *
 * `withAuth` resolves the gym from the session rather than the request body, and
 * supplies the CSRF guard this destructive endpoint previously lacked.
 */
export const POST = withAuth('ACCOUNT_DELETE_DATA', async (req: NextRequest, ctx) => {
  const { supabase, user, gym, log } = ctx

  let requestedGymId: string | undefined
  try {
    const body = (await req.json()) as { gym_id?: unknown }
    if (typeof body?.gym_id === 'string') requestedGymId = body.gym_id
  } catch {
    // No body is fine — the session already tells us which gym to clear.
  }

  if (requestedGymId !== undefined) {
    if (!isValidUUID(requestedGymId) || requestedGymId !== gym.id) {
      return apiError(403, 'FORBIDDEN', 'This gym could not be verified. Please reload and try again.')
    }
  }

  const admin = createAdminClient()

  // Collect member logins first — deleting the rows discards `auth_user_id`.
  // The admin client is used so no RLS policy can hide a member and leave their
  // login behind.
  const { data: memberRows, error: memberLookupError } = await admin
    .from('members')
    .select('auth_user_id')
    .eq('gym_id', gym.id)
    .not('auth_user_id', 'is', null)

  if (memberLookupError) {
    log.error('Failed to collect member logins before data deletion', memberLookupError)
    return apiError(500, 'INTERNAL_ERROR', 'We could not delete your member data right now. Please try again.')
  }

  // Never remove the owner's own login here, even if it is somehow linked to a
  // member row. This endpoint must leave the owner able to sign in.
  const memberAuthIds = [
    ...new Set(
      (memberRows ?? [])
        .map(row => row.auth_user_id as string | null)
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && id !== user.id),
    ),
  ]

  // Memberships, attendance and payments cascade from members.
  const { error: membersError } = await supabase
    .from('members')
    .delete()
    .eq('gym_id', gym.id)

  if (membersError) {
    log.error('Member data deletion failed', membersError)
    return apiError(500, 'INTERNAL_ERROR', 'We could not delete your member data. Please try again.')
  }

  // Confirm the rows are actually gone before removing any login. A DELETE that
  // matched nothing — for example because an RLS policy filtered it out —
  // reports no error, and acting on that would strip members of their logins
  // while leaving their records in place.
  if (memberAuthIds.length > 0) {
    const { count, error: remainingError } = await admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gym.id)

    if (remainingError || (count ?? 0) > 0) {
      log.error('Member rows still present after deletion; leaving logins intact', {
        gymId: gym.id,
        remaining: count ?? 'unknown',
        message: remainingError?.message,
      })
      return apiError(500, 'INTERNAL_ERROR', 'We could not delete your member data. Please try again.')
    }
  }

  // `admin.deleteUser()` resolves with an `{ error }` object rather than
  // throwing, so each result is checked explicitly.
  let failed = 0
  for (const memberAuthId of memberAuthIds) {
    const { error } = await admin.auth.admin.deleteUser(memberAuthId)
    if (error) {
      failed += 1
      log.error('Failed to delete member login', { memberAuthId, message: error.message })
    }
  }

  return apiSuccess({
    memberLoginsDeleted: memberAuthIds.length - failed,
    memberLoginsFailed: failed,
  })
})
