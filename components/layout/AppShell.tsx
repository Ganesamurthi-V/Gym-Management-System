// Server component — passes children to the client shell guard
import ShellGuard from './ShellGuard'
import { getAuthUser, getGym, getGymSubscription, getGymIsActive, getUnreadAdminMessages, getSubscriptionState } from '@/lib/dal'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()

  let gym = null
  let isActive = true
  let unreadCount = 0

  if (user) {
    // getGym: cached identity (name, id, onboarding) — stable, safe to cache.
    // getGymSubscription: always fresh from Postgres — subscription status must never be stale.
    // getGymIsActive: always fresh — security-critical access control flag.
    // getUnreadAdminMessages: cached 30s — acceptable staleness for a notification count.
    const [gymResult, subResult, activeResult, unreadResult] = await Promise.all([
      getGym(user.id),
      getGymSubscription(user.id),
      getGymIsActive(user.id),
      getGym(user.id).then(g => g.gym ? getUnreadAdminMessages(g.gym.id) : Promise.resolve({ count: 0 })),
    ])

    gym = gymResult.gym
    isActive = activeResult.isActive
    unreadCount = unreadResult.count ?? 0

    // Compute subscription state from the always-fresh sub row
    const subState = getSubscriptionState(subResult.gym)

    return (
      <ShellGuard
        initialUser={user}
        initialGym={gym}
        initialIsActive={isActive}
        initialUnreadCount={unreadCount}
        initialSubscriptionStatus={subState.status}
        initialTrialDaysLeft={subState.daysLeft ?? 0}
      >
        {children}
      </ShellGuard>
    )
  }

  return (
    <ShellGuard
      initialUser={null}
      initialGym={null}
      initialIsActive={true}
      initialUnreadCount={0}
      initialSubscriptionStatus="unknown"
      initialTrialDaysLeft={0}
    >
      {children}
    </ShellGuard>
  )
}
