import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'
import ProgramsList from '@/components/programs/ProgramsList'
import { apiLogger } from '@/lib/logger'
import type { WorkoutProgramSummary } from '@/types'

// Programs are edited in place and the list must reflect a publish/delete
// immediately after router.refresh(), so this page is always rendered fresh.
export const revalidate = 0

const PAGE_SIZE = 200

export default async function ProgramsPage() {
  const log = apiLogger('PROGRAMS_PAGE')

  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')

  const { gym } = await getGym(user.id)
  if (!gym) redirect('/onboarding')

  const supabase = await createClient()

  log.start('FETCH_PROGRAMS')
  const { data, error } = await supabase
    .from('workout_programs')
    .select('id, name, summary, duration, frequency, difficulty, goal, category, is_draft, created_at')
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  log.end('FETCH_PROGRAMS')

  if (error) {
    // Render the empty state rather than crashing the shell when the
    // workout_programs migration has not been applied yet.
    log.error('Failed to load programs', error)
  }

  log.info('Payload ready', { returned: data?.length ?? 0 })
  log.summary(200)

  return <ProgramsList programs={(data ?? []) as WorkoutProgramSummary[]} />
}
