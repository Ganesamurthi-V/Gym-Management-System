import { getAuthUser, getGymCore, getSubscriptionState } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import SubscriptionClient from './SubscriptionClient'
import { redirect } from 'next/navigation'
import { startPageTimer } from '@/lib/perf'
import { isFreePlan } from '@/lib/subscription-utils'

// No `dynamic = 'force-dynamic'`: this page reads the auth cookie, which
// already makes it dynamic. The export was redundant.

export default async function SubscriptionPage() {
  const done = startPageTimer('subscription')
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  // getGymCore is never Redis-cached, so this page still always reflects the
  // real subscription state — which is what fixed the "stuck on expired page
  // after reactivation" bug. It now also carries the gym NAME, removing the
  // extra sequential getGym() round trip this page used to make at the end.
  const { gym } = await getGymCore(user.id)
  // No gym yet: finish registration (the mobile number is collected on /auth/add-phone) first. Onboarding would bounce back here.
  if (!gym) redirect('/auth/add-phone')

  const subState = getSubscriptionState(gym)

  // If the gym is already fully active (not expiring soon), skip the paywall
  // A Free gym has no paywall but still needs this page to buy the add-on or upgrade.
  const free = isFreePlan(gym.plan_type)
  if (!free && !subState.isExpired && subState.status === 'active' && !subState.isExpiringSoon) {
    redirect('/owner/dashboard')
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

  done()

  // The trial is over and the owner has not paid or picked Free yet.
  const trialEnded = gym.plan_type === 'trial'
    && (subState.isExpired || (!!gym.trial_ends_at && new Date(gym.trial_ends_at).getTime() < Date.now()))

  return (
    <SubscriptionClient
      gym={{
        id: gymId,
        name: gym.name,
        subscriptionStatus: gym.subscription_status ?? 'trial',
        trialEndsAt: gym.trial_ends_at ?? null,
        subscriptionEndsAt: gym.subscription_ends_at ?? null,
        isFree: free,
        trialEnded,
        whatsappAddonUntil: gym.whatsapp_addon_until ?? null,
      }}
      subState={subState}
      latestRequest={latestRequestResult.data ?? null}
      settings={settingsResult.data ?? {
        upi_id: '',
        upi_name: 'GymFlow',
        price_monthly: 999,
        price_yearly: 9999,
      }}
    />
  )
}
