import { createClient } from '@/lib/supabase/server'
import { AccountClient } from './AccountClient'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const { getAuthUser, getGym, getGymSubscription } = await import('@/lib/dal')
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  const { gym: gymSub } = await getGymSubscription(user.id)

  const supabase = await createClient()

  // Extract onboarding details stored in JSONB
  const ob = (gym.onboarding_data ?? {}) as Record<string, any>

  // Fetch summary counts for display
  const [membersRes, membershipsRes, attendanceRes] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
    supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
  ])

  // Fetch UPI merchant config (null if not configured)
  const { data: upiConfig } = await supabase
    .from('gym_upi_config')
    .select('*')
    .eq('gym_id', gym.id)
    .maybeSingle()

  return (
    <AccountClient
      email={user.email ?? ''}
      gymId={gym.id}
      gymName={gym.name}
      gymCreatedAt={gym.created_at}
      memberCount={membersRes.count ?? 0}
      membershipCount={membershipsRes.count ?? 0}
      attendanceCount={attendanceRes.count ?? 0}
      gymType={ob.gymType ?? null}
      gymCity={ob.city ?? null}
      gymPhone={ob.phone ?? null}
      gymAddress={ob.address ?? null}
      openingYear={ob.openingYear ?? null}
      branchCount={ob.branchCount ?? null}
      subscriptionStatus={gymSub?.subscription_status ?? 'active'}
      planType={gymSub?.plan_type ?? null}
      trialEndsAt={gymSub?.trial_ends_at ?? null}
      subscriptionEndsAt={gymSub?.subscription_ends_at ?? null}
      upiConfig={upiConfig ?? null}
    />
  )
}
