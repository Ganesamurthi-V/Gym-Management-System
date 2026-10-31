// Server component — passes children to the client shell guard
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import ShellGuard from './ShellGuard'
import { getAuthUser, getGymCore } from '@/lib/dal'
import { shellDataFromCore } from '@/lib/owner/access'
import GenericPageSkeleton from './GenericPageSkeleton'
import { OWNER_HOME, PATHNAME_HEADER } from '@/lib/protected-routes'
import { EMPTY_SHELL_DATA, decideShellGuard, type ShellData } from '@/lib/owner/shellGuard'
import { roleFromClaims } from '@/lib/auth/roles'
import { MEMBER_HOME } from '@/lib/member/redirect'
import { startPageTimer } from '@/lib/perf'
import { createClient } from '@/lib/supabase/server'
import { memberCapReached } from '@/lib/subscription-utils'

/**
 * ONE merged `gyms` query supplies identity + subscription + is_active (replacing three
 * separate SELECTs). getGymCore is React cache()-wrapped and deliberately uncached across
 * requests, so pages below reuse this query for free and access-control state is never stale.
 */
async function loadShellData(userId: string): Promise<ShellData> {
  const { gym: core } = await getGymCore(userId)
  if (!core) return EMPTY_SHELL_DATA

  // Add-member lock. plan_type is already loaded, so paid gyms (the hot path) skip the count
  // query entirely; trial/free gyms pay one head-only count scoped to the server-resolved gym.
  let memberCapped = false
  if (core.plan_type === 'trial' || core.plan_type === 'free') {
    const supabase = await createClient()
    const { count } = await supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', core.id)
    // A failed count leaves the control unlocked; the API and DB trigger still refuse.
    memberCapped = memberCapReached(core.plan_type, count ?? 0)
  }

  return shellDataFromCore(core, memberCapped)
}

/**
 * Server-side access gate. It awaits the gym row and redirects BEFORE returning `children`.
 * `children` is only an unrendered element here: React Flight serialises a server component's
 * props only after the component returns them, so while this suspends no page byte (not even
 * its loading.tsx) is emitted, and a redirecting owner never receives tenant data. The chrome
 * around it streams at once and the Suspense fallback is a neutral skeleton. The same
 * decideShellGuard runs in ShellGuard on client navigations (the layout does not re-run then).
 */
async function AccessGate({ shellData, children }: { shellData: Promise<ShellData>; children: React.ReactNode }) {
  const [data, pathname] = await Promise.all([
    shellData,
    // Always set by middleware for /owner/*; the fallback keeps a missing header failing closed
    // (decided as a normal owner page) instead of silently passing.
    headers().then(h => h.get(PATHNAME_HEADER) || OWNER_HOME),
  ])
  const target = decideShellGuard(data, pathname)
  if (target !== 'ok') redirect(target)
  return <>{children}</>
}

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const done = startPageTimer('AppShell')
  const { user } = await getAuthUser()

  /**
   * ─── ROLE SAFETY NET ───────────────────────────────────────────────────────
   *
   * The middleware already keeps members out of `/owner/*`, but this repeats the
   * check server-side, inside the layout that renders the owner chrome, so a
   * member can never be shown owner UI even if a request reaches here without
   * passing through the middleware matcher.
   *
   * Free: `getAuthUser()` builds its `User` from the verified JWT claims that
   * were already parsed, so this is a property read — no query, no round trip.
   */
  if (user && roleFromClaims(user) === 'member') {
    redirect(MEMBER_HOME)
  }

  // ─── WHY NOTHING BELOW IS AWAITED ─────────────────────────────────────────
  // This is a LAYOUT, so awaiting the ~200ms gym row here would hold back the sidebar and header.
  // The row is started here (not awaited) and handed to the client shell and to AccessGate as a
  // promise. The chrome streams at once; `children` sit inside AccessGate's <Suspense>, so the
  // page (and its data) is released only once the access decision says the owner may see it.
  // The unread badge is fetched by AccountMenu on mount for the same reason.
  // No session: middleware already redirects; this is the same safety net, decided before streaming.
  if (!user) redirect('/auth/login')
  const shellData = loadShellData(user.id)

  done()

  return (
    <ShellGuard initialUser={user} shellData={shellData} initialUnreadCount={null}>
      <Suspense fallback={<GenericPageSkeleton />}>
        <AccessGate shellData={shellData}>{children}</AccessGate>
      </Suspense>
    </ShellGuard>
  )
}
