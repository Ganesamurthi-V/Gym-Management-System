import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: gym } = await supabase
    .from('gyms')
    .select('onboarding_completed')
    .eq('owner_id', user.id)
    .single()

  // Redirect to onboarding if the gym owner hasn't completed setup yet,
  // OR if they have no gym record at all (brand new user)
  if (!gym || gym.onboarding_completed === false) redirect('/onboarding')

  return <>{children}</>
}
