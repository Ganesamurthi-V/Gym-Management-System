import { createClient } from '@/lib/supabase/server'
import { EditMembersClient } from './BulkEditClient'
import { redirect } from 'next/navigation'

export default async function EditMembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
  if (!gym) redirect('/dashboard')

  const { data: members } = await supabase
    .from('members')
    .select('id, member_number, name, phone, gender, area, pending_amount')
    .eq('gym_id', gym.id)
    .order('member_number', { ascending: true })

  return <EditMembersClient members={members ?? []} gymId={gym.id} />
}
