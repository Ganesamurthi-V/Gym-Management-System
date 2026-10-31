import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser, getGymCore, getSubscriptionState, type GymCoreRow } from '@/lib/dal'
import { OWNER_HOME, PATHNAME_HEADER } from '@/lib/protected-routes'
import { decideShellGuard, type ShellData } from '@/lib/owner/shellGuard'

/** Maps the merged gyms row to ShellData. Shared by AppShell and requireOwnerAccess so they cannot drift. */
export function shellDataFromCore(core: GymCoreRow, memberCapped: boolean): ShellData {
  const subState = getSubscriptionState(core)
  return {
    gym: {
      id: core.id,
      name: core.name,
      onboarding_completed: core.onboarding_completed,
      owner_id: core.owner_id,
      created_at: core.created_at,
      onboarding_data: core.onboarding_data,
    },
    isActive: core.is_active ?? true,
    subscriptionStatus: subState.status,
    trialDaysLeft: subState.daysLeft ?? 0,
    isExpired: subState.isExpired,
    memberCapped,
  }
}

/**
 * Per-page access gate. AppShell's AccessGate lives in the shared layout, and Next does not
 * re-render a layout on soft client navigations between owner pages, so an owner whose
 * subscription expired (or who was banned) mid-session could keep soft-navigating and receive
 * page data. Every owner page therefore calls this first and enforces the same decideShellGuard
 * decision in its own server render.
 *
 * No extra query: getGymCore is React cache()-wrapped, so on a hard load this reuses the layout's
 * row, and on a soft nav it is the single gyms query the page already needed. Deliberately not
 * cached across requests (gym access-control state). cache() also dedupes a layout and its page
 * calling this in one render, so a redirect is only thrown once.
 */
export const requireOwnerAccess = cache(async () => {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  // x-pathname is set by middleware on every /owner request, soft-nav RSC requests included.
  // A missing header falls back to a normal owner page so it fails closed, as AccessGate does.
  const pathname = (await headers()).get(PATHNAME_HEADER) || OWNER_HOME

  const { gym: core } = await getGymCore(user.id)
  const target = decideShellGuard(core ? shellDataFromCore(core, false) : { gym: null, isActive: true, isExpired: false }, pathname)
  if (target !== 'ok') redirect(target)

  // decideShellGuard returns a redirect for a missing gym on owner paths; this only narrows the type.
  if (!core) redirect('/auth/add-phone')
  return { user, gym: core }
})
