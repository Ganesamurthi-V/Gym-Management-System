// Server component — passes children to the client shell guard
import ShellGuard from './ShellGuard'
import { getAuthUser, getGym, getGymSubscription, getGymIsActive, getUnreadAdminMessages, getSubscriptionState } from '@/lib/dal'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()

  let gym = null
  let isActive = true
  let unreadCount = 0
  let subscriptionStatus = 'unknown'
  let trialDaysLeft = 0

  if (user) {
    // getGym: cached identity fields (name, id, onboarding) — stable, safe to cache.
    // getGymSubscription: always fresh from Postgres — never cached.
    // getGymIsActive: always fresh — security-critical.
    // getUnreadAdminMessages: cached 30s.
    // Run all four concurrently.
    const gymResult = await getGym(user.id)
    gym = gymResult.gym

    const [subResult, activeResult, unreadResult] = await Promise.all([
      getGymSubscription(user.id),
      getGymIsActive(user.id),
      gym ? getUnreadAdminMessages(gym.id) : Promise.resolve({ count: 0, error: null }),
    ])

    isActive = activeResult.isActive
    unreadCount = unreadResult.count ?? 0

    const subState = getSubscriptionState(subResult.gym)
    subscriptionStatus = subState.status
    trialDaysLeft = subState.daysLeft ?? 0
  }

  return (
    <ShellGuard
      initialUser={user}
      initialGym={gym}
      initialIsActive={isActive}
      initialUnreadCount={unreadCount}
      initialSubscriptionStatus={subscriptionStatus}
      initialTrialDaysLeft={trialDaysLeft}
    >
      {children}
    </ShellGuard>
  )
}
