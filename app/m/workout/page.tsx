import { Dumbbell } from 'lucide-react'
import { getWorkoutPageData } from '@/lib/member/member-data'
import { startPageTimer } from '@/lib/perf'
import WorkoutClient from './WorkoutClient'

export default async function WorkoutPage() {
  const done = startPageTimer('workout')

  const data = await getWorkoutPageData()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load workout programs.</p></div>
  }
  const { gym, programs } = data

  done()

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">My Workouts</h1>
        <p className="mt-1 text-xs text-slate-500">{gym.name}</p>
      </header>

      {programs.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50">
            <Dumbbell className="h-7 w-7 text-orange-400" />
          </div>
          <p className="text-sm font-bold text-slate-700">No programs assigned yet</p>
          <p className="mt-1 text-xs text-slate-400">Your gym will assign workout programs to you soon.</p>
        </div>
      ) : (
        <WorkoutClient programs={programs} />
      )}

    </div>
  )
}
