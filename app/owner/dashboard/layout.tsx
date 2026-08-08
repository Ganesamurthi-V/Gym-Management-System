import { redirect } from 'next/navigation'
import { getAuthUser, getGym } from '@/lib/dal'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  const { gym } = await getGym(user.id)

  // Redirect to onboarding if the gym owner hasn't completed setup yet,
  // OR if they have no gym record at all (brand new user)
  if (!gym || gym.onboarding_completed === false) redirect('/owner/onboarding')

  return <>{children}</>
}
