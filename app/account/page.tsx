import { createClient } from '@/lib/supabase/server'
import { AccountClient } from './AccountClient'
import { startPageTimer, timed } from '@/lib/perf'

// No `dynamic = 'force-dynamic'`: this page reads the auth cookie, which
// already makes it dynamic. The export was redundant.

export default async function AccountPage() {
  const done = startPageTimer('account')

  const { getAuthUser, getGymCore } = await import('@/lib/dal')
  const { user } = await getAuthUser()
  if (!user) {
    done()
    return null
  }

  // ONE merged gyms query gives identity AND subscription fields. Previously
  // this page awaited getGym() and then getGymSubscription() as two separate
  // ~200ms round trips. Both are now served by the same query the root layout
  // already ran, so they cost nothing here.
  const { gym } = await getGymCore(user.id)
  if (!gym) {
    done()
    return null
  }

  const supabase = await createClient()

  // Extract onboarding details stored in JSONB
  const ob = (gym.onboarding_data ?? {}) as Record<string, any>

  // The three counts and the UPI config are all independent. The UPI lookup
  // used to run as a fifth sequential stage after the counts resolved.
  const [membersRes, membershipsRes, attendanceRes, upiRes] = await Promise.all([
    timed('members count', () =>
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id)),
    timed('memberships count', () =>
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id)),
    timed('attendance count', () =>
      supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id)),
    timed('upi config', () =>
      supabase.from('gym_upi_config').select('*').eq('gym_id', gym.id).maybeSingle()),
  ])

  done()

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
      subscriptionStatus={gym.subscription_status ?? 'active'}
      planType={gym.plan_type ?? null}
      trialEndsAt={gym.trial_ends_at ?? null}
      subscriptionEndsAt={gym.subscription_ends_at ?? null}
      upiConfig={upiRes.data ?? null}
    />
  )
}
