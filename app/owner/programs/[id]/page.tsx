import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import EditProgramClient from './EditProgramClient'
import type { WorkoutProgram } from '@/types'

export const revalidate = 0

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditProgramPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  // A malformed UUID would surface as a Postgres 22P02 error, so reject early.
  if (!UUID_RE.test(id)) notFound()

  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  const { gym } = await getGym(user.id)
  if (!gym) redirect('/owner/onboarding')

  const supabase = await createClient()

  // Tenant scoping is explicit here in addition to RLS: another gym's program
  // ID must read as "not found", never as a permission error.
  const { data: program, error } = await supabase
    .from('workout_programs')
    .select('*')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (error || !program) notFound()

  return <EditProgramClient program={program as WorkoutProgram} />
}
