import { createAdminClient } from '@/lib/supabase-admin'
import GymsClient from './GymsClient'

export default async function GymsPage() {
  const supabase = createAdminClient()

  const { data: gyms, error } = await supabase
    .from('gyms')
    .select('id, name, created_at, is_active, subscription_status, plan_type, members(count)')
    .order('created_at', { ascending: false })

  const normalized = (gyms ?? []).map(g => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    is_active: g.is_active,
    subscription_status: g.subscription_status ?? 'unknown',
    plan_type: g.plan_type ?? null,
    memberCount: (g.members as any)?.[0]?.count ?? 0,
  }))

  return <GymsClient gyms={normalized} error={error?.message ?? null} />
}
