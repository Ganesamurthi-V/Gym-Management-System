import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingWizard } from './OnboardingWizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name, onboarding_completed')
    .eq('owner_id', user.id)
    .maybeSingle()

  // Already onboarded — send to dashboard
  if (gym?.onboarding_completed) redirect('/owner/dashboard')

  return <OnboardingWizard gymId={gym?.id ?? null} gymName={gym?.name ?? ''} />
}
