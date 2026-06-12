import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditProgramClient from './EditProgramClient'

export const revalidate = 0

export default async function EditProgramPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  const { data: program, error } = await supabase
    .from('workout_programs')
    .select('*')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .single()

  if (error || !program) {
    notFound()
  }

  return <EditProgramClient program={program} />
}
