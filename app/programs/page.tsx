import { createClient } from '@/lib/supabase/server'
import ProgramsList from '@/components/programs/ProgramsList'

export const revalidate = 0

export default async function ProgramsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  const { data: programs, error } = await supabase
    .from('workout_programs')
    .select('*')
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })

  return <ProgramsList programs={programs || []} />
}
