/**
 * lib/auth/roles.ts
 *
 * Role classification for the unified app at app.gymflow.sbs.
 *
 * Pure functions over JWT claims — no imports, no DB, no Node built-ins — so
 * this is safe to use from Edge middleware, Server Components, and Route
 * Handlers alike.
 *
 * ── WHY user_metadata AND NOT A DB LOOKUP ───────────────────────────────────
 * Members are provisioned by the owner console, which stamps
 * `user_metadata: { member_id, gym_id, role: 'member' }` at invite time — see
 * `app/owner/member-app/actions.ts` and `app/api/member-app/invite/route.ts`.
 * Every subsequent metadata write in the activation flow spreads the existing
 * metadata forward, so the marker survives activation.
 *
 * Reading it off the verified JWT costs 0ms, versus ~300ms for a `members`
 * SELECT on every navigation. The claim is inside the ES256-signed token, so
 * it cannot be forged by the client.
 *
 * ── WHAT THIS IS *NOT* ──────────────────────────────────────────────────────
 * This is a ROUTING signal, not an authorization decision. It picks which
 * experience to render. Actual data access stays gated by:
 *   - Postgres RLS on every table (the real authority),
 *   - `app/m/layout.tsx`, which confirms a real `members` row exists,
 *   - `AppShell`, which confirms a real `gyms` row + live subscription.
 * A tampered or stale role claim therefore cannot leak another user's data.
 */

export type AppRole = 'owner' | 'member'

/** Shape of the pieces of the verified JWT payload we care about. */
type RoleClaims = {
  user_metadata?: Record<string, unknown> | null
  app_metadata?: Record<string, unknown> | null
} | null | undefined

/**
 * Resolves the app role from verified JWT claims.
 *
 * Defaults to `'owner'`: owner accounts are created by public sign-up and carry
 * no role marker, so "absence of a member marker" is the owner signal. Members
 * are always explicitly marked because only the owner console can create them.
 */
export function roleFromClaims(claims: RoleClaims): AppRole {
  const userMeta = (claims?.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (claims?.app_metadata ?? {}) as Record<string, unknown>

  if (userMeta.role === 'member' || appMeta.role === 'member') return 'member'

  // Fallback for member accounts invited before `role` was stamped: the
  // member_id marker has been written by every invite path from the start.
  if (typeof userMeta.member_id === 'string' && userMeta.member_id.length > 0) {
    return 'member'
  }

  return 'owner'
}

/** Landing route for a role. */
export function homeForRole(role: AppRole): string {
  return role === 'member' ? '/m/home' : '/owner/dashboard'
}
