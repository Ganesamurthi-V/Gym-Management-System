// Framework-free so the shell guard rules are unit tested and shared by the server guard
// (AppShell) and the client guard (ShellGuard), which can then never disagree.
import { isOnboardingPath, isOwnerPath, isPaywallPath } from '@/lib/protected-routes'

export const SUBSCRIPTION_PATH = '/owner/subscription'
export const ADD_PHONE_PATH = '/auth/add-phone'

/** Serializable gym state the shell needs. Resolved off the critical path (see AppShell). */
export interface ShellData {
  gym: {
    id: string
    name: string
    onboarding_completed: boolean | null
    owner_id: string
    created_at: string
    onboarding_data: Record<string, unknown> | null
  } | null
  isActive: boolean
  subscriptionStatus: string
  trialDaysLeft: number
  /** computeSubscriptionState(core).isExpired; false when there is no gym. */
  isExpired: boolean
  memberCapped: boolean
}

export const EMPTY_SHELL_DATA: ShellData = {
  gym: null,
  isActive: true,
  subscriptionStatus: 'unknown',
  trialDaysLeft: 0,
  isExpired: false,
  memberCapped: false,
}

export const ONBOARDING_PATH = '/owner/onboarding'
/** Server route that signs out a deactivated owner, then lands on /auth/login?error=blocked. */
export const BLOCKED_PATH = '/auth/blocked'

export type ShellGuardTarget =
  | 'ok'
  | typeof ADD_PHONE_PATH
  | typeof BLOCKED_PATH
  | typeof SUBSCRIPTION_PATH
  | typeof ONBOARDING_PATH

/**
 * The ONE redirect decision for a signed-in owner on an owner path, or 'ok'. First match wins:
 *  1. no gym row      -> /auth/add-phone, which creates the gym (/owner/subscription would loop:
 *                        it sends gym-less owners onward)
 *  2. is_active=false -> /auth/blocked (signs out; a plain /auth/login redirect would be bounced
 *                        back by middleware because the session is still live)
 *  3. expired         -> /owner/subscription (exempt on that page itself)
 *  4. onboarding not `true` -> /owner/onboarding (exempt on that page and on the paywall).
 *     Expiry is checked first only because a new trial gym always gets trial_ends_at at
 *     registration (finalize-registration), so a brand-new owner is never seen as expired.
 * Paths outside /owner are never decided here.
 */
export function decideShellGuard(
  data: Pick<ShellData, 'gym' | 'isExpired' | 'isActive'>,
  pathname: string,
): ShellGuardTarget {
  if (!isOwnerPath(pathname)) return 'ok'
  if (!data.gym) return ADD_PHONE_PATH
  if (!data.isActive) return BLOCKED_PATH
  if (data.isExpired && !isPaywallPath(pathname)) return SUBSCRIPTION_PATH
  if (data.gym.onboarding_completed !== true && !isOnboardingPath(pathname) && !isPaywallPath(pathname)) {
    return ONBOARDING_PATH
  }
  return 'ok'
}
