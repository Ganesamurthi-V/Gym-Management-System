// Server component — passes children to the client shell guard
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import ShellGuard from './ShellGuard'
import { getAuthUser, getGymCore, getSubscriptionState } from '@/lib/dal'
import { PATHNAME_HEADER, needsSubscriptionGuard } from '@/lib/protected-routes'
import { roleFromClaims } from '@/lib/auth/roles'
import { MEMBER_HOME } from '@/lib/member/redirect'
import { startPageTimer } from '@/lib/perf'

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

  let gym = null
  let isActive = true
  let subscriptionStatus = 'unknown'
  let trialDaysLeft = 0

  if (user) {
    // ONE merged `gyms` query supplies identity + subscription + is_active.
    // This replaced three separate single-row SELECTs (getGym, getGymSubscription,
    // getGymIsActive) that ran on every navigation. Measured on the live
    // project, selecting all of these columns costs the same ~205ms as
    // selecting one, so the round trips were pure waste.
    //
    // Because getGymCore is React cache()-wrapped, every page below this layout
    // that calls getGym()/getGymSubscription()/getGymIsActive() reuses this
    // exact query for free.
    //
    // ─── WHY THE UNREAD COUNT IS NO LONGER AWAITED HERE ────────────────────
    // This used to be `Promise.all([getGymCore, getUnreadAdminMessages])`. The
    // two run concurrently, so the shell paid the SLOWER of the pair — and
    // measured against this project the unread count is the slower one whenever
    // its 30s Redis entry has expired:
    //
    //     gyms single row .............. ~157ms
    //     admin_messages unread count .. ~214ms   (no gym_id predicate; row
    //                                              visibility comes from an RLS
    //                                              EXISTS subquery against gyms)
    //
    // Because this is a LAYOUT, nothing downstream can be sent until it resolves
    // — not even the `loading.tsx` skeleton. So a cosmetic notification badge was
    // setting the time-to-first-byte for every single owner page, roughly every
    // 30 seconds.
    //
    // The gym row genuinely has to block: it carries `is_active` and the
    // subscription columns behind the paywall redirect below, and a redirect must
    // be decided before any HTML is streamed. The badge does not. AccountMenu now
    // fetches it on mount instead, so it costs the shell nothing.
    const { gym: core } = await getGymCore(user.id)

    if (core) {
      gym = {
        id: core.id,
        name: core.name,
        onboarding_completed: core.onboarding_completed,
        owner_id: core.owner_id,
        created_at: core.created_at,
        onboarding_data: core.onboarding_data,
      }
      isActive = core.is_active ?? true

      const subState = getSubscriptionState(core)
      subscriptionStatus = subState.status
      trialDaysLeft = subState.daysLeft ?? 0

      /**
       * ─── SUBSCRIPTION PAYWALL ─────────────────────────────────────────────
       *
       * Moved here from `middleware.ts`, where it cost a dedicated ~206ms
       * `gyms` SELECT on every protected navigation. The row is already loaded
       * above, so the guard is now free.
       *
       * Still enforced server-side, on every route, before any page content is
       * streamed — so the protection is equivalent to the middleware version.
       * The path conditions come from the same shared helper the middleware
       * uses, so the two gates cannot drift apart.
       */
      const pathname = (await headers()).get(PATHNAME_HEADER) ?? ''
      if (subState.isExpired && needsSubscriptionGuard(pathname)) {
        redirect('/owner/subscription')
      }
    } else {
      // No gym row for this owner. The middleware version of this guard called
      // computeSubscriptionState(null), which returns isExpired: true, so it
      // redirected in this case too. Preserved exactly rather than silently
      // letting a gym-less session through.
      const pathname = (await headers()).get(PATHNAME_HEADER) ?? ''
      if (needsSubscriptionGuard(pathname)) {
        redirect('/owner/subscription')
      }
    }
  }

  done()

  return (
    <ShellGuard
      initialUser={user}
      initialGym={gym}
      initialIsActive={isActive}
      // `null` means "not fetched" — AccountMenu resolves it on mount so the
      // shell is not gated on a cosmetic badge. See the note above.
      initialUnreadCount={null}
      initialSubscriptionStatus={subscriptionStatus}
      initialTrialDaysLeft={trialDaysLeft}
    >
      {children}
    </ShellGuard>
  )
}
