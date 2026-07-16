// Server component — passes children to the client shell guard
import ShellGuard from './ShellGuard'
import { getAuthUser, getGym, getGymActiveStatus, getUnreadAdminMessages, getSubscriptionState } from '@/lib/dal'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()

  let gym = null
  let isActive = true
  let unreadCount = 0

  if (user) {
    const { gym: gymResult } = await getGym(user.id)
    gym = gymResult

    // Issue 1 & 6 fix: Run getGymActiveStatus and getUnreadAdminMessages in parallel.
    // Previously getUnreadAdminMessages ran sequentially AFTER the first Promise.all
    // completed, adding ~30-100ms of unnecessary latency to every navigation.
    // Since getGymActiveStatus only needs user.email and getUnreadAdminMessages only
    // needs gym.id (now available after getGym resolves), they can run concurrently.
    const [activeStatusResult, unreadResult] = await Promise.all([
      getGymActiveStatus(user.email ?? ''),
      gym ? getUnreadAdminMessages(gym.id) : Promise.resolve({ count: 0 }),
    ])
    isActive = activeStatusResult.isActive !== false
    unreadCount = unreadResult.count ?? 0
  }

  // Compute subscription state for banner and redirect logic
  const subState = getSubscriptionState(gym)

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
