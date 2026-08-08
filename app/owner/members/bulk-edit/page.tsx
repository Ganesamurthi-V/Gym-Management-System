import { createClient } from '@/lib/supabase/server'
import { EditMembersClient } from './BulkEditClient'
import { redirect } from 'next/navigation'

export default async function EditMembersPage() {
  const { getAuthUser, getGym } = await import('@/lib/dal')
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  const { gym } = await getGym(user.id)
  if (!gym) redirect('/owner/dashboard')

  const supabase = await createClient()

  const { data: members } = await supabase
    .from('members')
    .select('id, member_number, name, phone, gender, age, area, pending_amount')
    .eq('gym_id', gym.id)
    .order('member_number', { ascending: true })

  return <EditMembersClient members={members ?? []} gymId={gym.id} />
}
