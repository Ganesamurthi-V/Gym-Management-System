import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import { PlansClient } from './PlansClient'
import { readSavedPlans } from '@/lib/plans/validate'

export default async function PlansPage() {
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gyms')
    .select('onboarding_data')
    .eq('id', gym.id)
    .single()
  if (error || !data) throw new Error(`Could not load plans: ${error?.message ?? 'no gym row'}`)

  const onboarding = data.onboarding_data as { plans?: unknown } | null
  const { plans, unreadable } = readSavedPlans(onboarding?.plans)

  return <PlansClient plans={plans} gymName={gym.name} unreadable={unreadable} />
}
