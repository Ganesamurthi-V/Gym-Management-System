import { getAuthUser, getGymSubscription, getSubscriptionState } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import SubscriptionClient from './SubscriptionClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  // Always fetch a fresh subscription row — this page is only visited when
  // the user may be expired/on trial, and stale state is what caused the
  // "stuck on expired page after reactivation" bug. getGymSubscription()
  // bypasses Redis entirely so a hard refresh always reflects the real state.
  const { gym } = await getGymSubscription(user.id)
  if (!gym) redirect('/onboarding')

  const subState = getSubscriptionState(gym)

  // If the gym is already fully active (not expiring soon), skip the paywall
  if (!subState.isExpired && subState.status === 'active' && !subState.isExpiringSoon) {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  // We still need gym.id for the queries below. Fetch the full id via gym from sub row.
  const gymId = gym.id

  const [latestRequestResult, settingsResult] = await Promise.all([
    supabase
      .from('subscription_requests')
      .select('id, status, submitted_at, rejection_reason')
      .eq('gym_id', gymId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('platform_settings')
      .select('upi_id, upi_name, price_monthly, price_yearly')
      .single(),
  ])

  // Also fetch gym name for display (from the cached identity row is fine — it's just for display)
  const { getGym } = await import('@/lib/dal')
  const { gym: gymIdentity } = await getGym(user.id)

  return (
    <SubscriptionClient
      gym={{
        id: gymId,
        name: gymIdentity?.name ?? '',
        subscriptionStatus: gym.subscription_status ?? 'trial',
        trialEndsAt: gym.trial_ends_at ?? null,
        subscriptionEndsAt: gym.subscription_ends_at ?? null,
      }}
      subState={subState}
      latestRequest={latestRequestResult.data ?? null}
      settings={settingsResult.data ?? {
        upi_id: '',
        upi_name: 'GymFlow',
        price_monthly: 2999,
        price_yearly: 29999,
      }}
    />
  )
}
