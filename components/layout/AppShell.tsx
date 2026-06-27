// Server component — passes children to the client shell guard
import ShellGuard from './ShellGuard'
import { getAuthUser, getGym, getGymActiveStatus, getUnreadAdminMessages } from '@/lib/dal'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()

  let gym = null
  let isActive = true
  let unreadCount = 0

  if (user) {
    const [gymResult, activeStatusResult] = await Promise.all([
      getGym(user.id),
      getGymActiveStatus(user.email ?? '')
    ])
    gym = gymResult.gym
    isActive = activeStatusResult.isActive !== false

    if (gym) {
      const { count } = await getUnreadAdminMessages(gym.id)
      unreadCount = count ?? 0
    }
  }

  return (
    <ShellGuard 
      initialUser={user}
      initialGym={gym}
      initialIsActive={isActive}
      initialUnreadCount={unreadCount}
    >
      {children}
    </ShellGuard>
  )
}
