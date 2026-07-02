import { createAdminClient } from '@/lib/supabase-admin'
import GymsClient from './GymsClient'

export default async function GymsPage() {
  const supabase = createAdminClient()

  // Single query — fetch gyms with member count via Supabase aggregate
  const { data: gyms, error } = await supabase
    .from('gyms')
    .select('id, name, created_at, is_active, members(count)')
    .order('created_at', { ascending: false })

  const normalized = (gyms ?? []).map(g => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    is_active: g.is_active,
    memberCount: (g.members as any)?.[0]?.count ?? 0,
  }))

  return <GymsClient gyms={normalized} error={error?.message ?? null} />
}
