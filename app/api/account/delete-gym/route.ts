import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { withAuth, apiError, apiSuccess, isValidUUID } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownerRegistrationIndexKey } from '@/lib/auth/owner-registration'
import { invalidatePattern } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * POST /api/account/delete-gym
 *
 * Permanently deletes a gym: all of its data, every member's login, and the
 * owner's own login. This is what the "Delete Entire Gym Account" dialog
 * promises, including the "Your login account" line.
 *
 * ─── WHY THIS WAS REWRITTEN ────────────────────────────────────────────────
 * The previous version deleted the gym data but always left the Supabase Auth
 * user behind, while still reporting success. Three separate faults:
 *
 *   1. It called `supabase.auth.admin.deleteUser()` on the ANON-key SSR client.
 *      The Admin API rejects the anon key, so the call could never succeed.
 *
 *   2. It wrapped that call in `try/catch`. `admin.deleteUser()` RESOLVES with
 *      an `{ error }` object instead of throwing, so the catch block was dead
 *      code and the failure was swallowed silently.
 *
 *   3. Member logins were never considered. Deleting the gym cascades the
 *      `members` rows, but each member who had activated the member app kept a
 *      live Auth user pointing at a gym that no longer exists — an orphaned
 *      account that can still authenticate.
 *
 * ─── ORDER OF OPERATIONS ───────────────────────────────────────────────────
 * Member auth ids are collected BEFORE the gym row is deleted, because the
 * cascade removes the rows that carry them. The owner's own Auth user is
 * deleted LAST, because deleting it invalidates the session every earlier step
 * depends on.
 *
 * ─── AUTHORIZATION ─────────────────────────────────────────────────────────
 * `withAuth` resolves the gym from the server-side session, so the gym being
 * destroyed is never taken from the request body. It also applies the CSRF
 * guard, which this endpoint previously had no protection from at all — a
 * meaningful gap on the most destructive route in the app.
 */
export const POST = withAuth('ACCOUNT_DELETE_GYM', async (req: NextRequest, ctx) => {
  const { supabase, user, gym, log } = ctx

  // The body is optional, but when a gym_id is supplied it must agree with the
  // session's gym. A mismatch means a stale client, so refuse rather than
  // delete something the owner is not currently looking at.
  let requestedGymId: string | undefined
  try {
    const body = (await req.json()) as { gym_id?: unknown }
    if (typeof body?.gym_id === 'string') requestedGymId = body.gym_id
  } catch {
    // No body is fine — the session already tells us which gym to delete.
  }

  if (requestedGymId !== undefined) {
    if (!isValidUUID(requestedGymId) || requestedGymId !== gym.id) {
      return apiError(403, 'FORBIDDEN', 'This gym could not be verified. Please reload and try again.')
    }
  }

  const admin = createAdminClient()
  const ownerEmail = user.email ?? null

  // ── 1. Collect member logins before the cascade removes the rows ──────────
  // Uses the admin client so an RLS policy cannot hide a member from this sweep
  // and leave their login behind.
  const { data: memberRows, error: memberLookupError } = await admin
    .from('members')
    .select('auth_user_id')
    .eq('gym_id', gym.id)
    .not('auth_user_id', 'is', null)

  if (memberLookupError) {
    log.error('Failed to collect member logins before deletion', memberLookupError)
    return apiError(500, 'INTERNAL_ERROR', 'We could not delete your account right now. Please try again.')
  }

  const memberAuthIds = [
    ...new Set(
      (memberRows ?? [])
        .map(row => row.auth_user_id as string | null)
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && id !== user.id),
    ),
  ]

  // ── 2. Delete the gym row; ON DELETE CASCADE clears the related tables ────
  // `.select()` returns the affected rows so a policy that silently matches
  // nothing cannot be mistaken for a successful delete — which would otherwise
  // destroy the login while leaving all the data in place.
  const { data: deletedGyms, error: gymDeleteError } = await supabase
    .from('gyms')
    .delete()
    .eq('id', gym.id)
    .eq('owner_id', user.id)
    .select('id')

  if (gymDeleteError) {
    log.error('Gym deletion failed', gymDeleteError)
    return apiError(500, 'INTERNAL_ERROR', 'We could not delete your gym data. Please try again.')
  }

  if (!deletedGyms || deletedGyms.length === 0) {
    log.error('Gym deletion affected no rows', { gymId: gym.id })
    return apiError(500, 'INTERNAL_ERROR', 'We could not delete your gym data. Please try again.')
  }

  // ── 3. Delete every member login belonging to that gym ───────────────────
  // Reported but not fatal: the gym data is already gone, and failing the whole
  // request here would strand the owner's login too.
  const failedMemberDeletions: string[] = []
  for (const memberAuthId of memberAuthIds) {
    const { error } = await admin.auth.admin.deleteUser(memberAuthId)
    if (error) {
      failedMemberDeletions.push(memberAuthId)
      log.error('Failed to delete member login', { memberAuthId, message: error.message })
    }
  }

  // ── 4. Delete the owner's login LAST — this invalidates the session ──────
  // The result is checked explicitly. This is the exact step that used to fail
  // silently and leave the account visible under Authentication → Users.
  const { error: ownerDeleteError } = await admin.auth.admin.deleteUser(user.id)

  // Best-effort cleanup of the email→auth-user index used by resend recovery, so
  // a future signup on the same address cannot consult a deleted user.
  if (ownerEmail) {
    try {
      await redis.del(ownerRegistrationIndexKey(ownerEmail))
    } catch (indexError) {
      log.error('Failed to clear owner registration index', indexError)
    }
  }

  await invalidatePattern(`gym:${gym.id}:*`)

  if (ownerDeleteError) {
    // Deliberately NOT reported as success. The data is gone but the login still
    // exists, and the owner needs to know rather than discover it at next login.
    log.error('Owner login deletion failed', {
      userId: user.id,
      message: ownerDeleteError.message,
    })
    return apiError(
      500,
      'LOGIN_DELETE_FAILED',
      'Your gym data was deleted, but your login account could not be removed. Please contact support so we can finish removing it.',
    )
  }

  return apiSuccess({
    gymDeleted: true,
    loginDeleted: true,
    memberLoginsDeleted: memberAuthIds.length - failedMemberDeletions.length,
    memberLoginsFailed: failedMemberDeletions.length,
  })
})
