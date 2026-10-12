'use server'

/**
 * Server Actions for the member Profile page.
 */

import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/dal'
import { checkRateLimit } from '@/lib/rateLimit'

export type LeaderboardVisibilityResult =
  | { success: true; visible: boolean }
  | { success: false; error: string }

/** A real person flips this a few times at most; anything faster is a script. */
const VISIBILITY_CHANGES_PER_MINUTE = 10

/**
 * The member's own "show me on the gym leaderboard" choice.
 *
 * Takes only the boolean. WHICH member is decided inside
 * `set_leaderboard_visibility()` from `auth.uid()`, so there is no member or
 * gym id here for a caller to tamper with, and an owner calling this changes
 * nothing (the function updates only a row linked to the caller's own login).
 *
 * A Server Action rather than a route handler: Next.js checks the Origin of
 * every action POST, which covers CSRF without the X-Requested-With plumbing.
 */
export async function setLeaderboardVisibility(visible: unknown): Promise<LeaderboardVisibilityResult> {
  const parsed = z.boolean().safeParse(visible)
  if (!parsed.success) return { success: false, error: 'Invalid value.' }

  // Local JWT verification (~1 ms); PostgREST verifies the token again for the RPC.
  const { user } = await getAuthUser()
  if (!user) return { success: false, error: 'Please sign in again.' }

  try {
    const { allowed } = await checkRateLimit(user.id, 'MEMBER_LEADERBOARD_VISIBILITY', VISIBILITY_CHANGES_PER_MINUTE)
    if (!allowed) return { success: false, error: 'Too many changes. Please wait a minute.' }
  } catch {
    // Fail open when Upstash is not configured (local dev) or unreachable: this
    // only edits the caller's own preference.
  }

  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('set_leaderboard_visibility', { p_visible: parsed.data })

  if (error) {
    console.error('[setLeaderboardVisibility] failed', { code: error.code, message: error.message })
    return { success: false, error: 'Could not save. Please try again.' }
  }
  // NULL: no member row is linked to this login, so nothing was updated.
  if (typeof data !== 'boolean') return { success: false, error: 'Could not save. Please try again.' }

  return { success: true, visible: data }
}
