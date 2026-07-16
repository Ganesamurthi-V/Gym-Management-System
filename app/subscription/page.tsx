import { getAuthUser, getGym, getSubscriptionState } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import SubscriptionClient from './SubscriptionClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { gym } = await getGym(user.id)

  if (!gym) redirect('/onboarding')

  // Check for the latest subscription request
  const { data: latestRequest } = await supabase
    .from('subscription_requests')
    .select('id, status, submitted_at, rejection_reason')
    .eq('gym_id', gym.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Platform settings (UPI details, pricing)
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('upi_id, upi_name, qr_code_url, price_monthly, price_yearly')
    .single()

  const subState = getSubscriptionState(gym)

  return (
    <SubscriptionClient
      gym={{
        id: gym.id,
        name: gym.name,
        subscriptionStatus: (gym as any).subscription_status ?? 'trial',
        trialEndsAt: (gym as any).trial_ends_at ?? null,
      }}
      subState={subState}
      latestRequest={latestRequest ?? null}
      settings={settings ?? {
        upi_id: '',
        upi_name: 'GymFlow',
        qr_code_url: '',
        price_monthly: 999,
        price_yearly: 9999,
      }}
    />
  )
}
