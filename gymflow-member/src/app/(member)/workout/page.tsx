import { Dumbbell, Calendar, Target, Users } from 'lucide-react'
import { getMemberWithGym, getGymWorkoutPrograms } from '@/lib/member-data'

export const revalidate = 0

export default async function WorkoutPage() {
  const data = await getMemberWithGym()
  if (!data) return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load workout programs.</p></div>
  const { member, gym } = data
  const programs = await getGymWorkoutPrograms(member.gym_id)

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Workout Programs</h1>
        <p className="mt-1 text-xs text-slate-500">{gym.name}</p>
      </header>

      {programs.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50">
            <Dumbbell className="h-7 w-7 text-orange-400" />
          </div>
          <p className="text-sm font-bold text-slate-700">No programs published yet</p>
          <p className="mt-1 text-xs text-slate-400">Your gym will add workout programs here soon.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((prog) => (
            <div key={prog.id} className="card p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 leading-snug">{prog.name}</h2>
                {prog.difficulty && (
                  <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                    {prog.difficulty}
                  </span>
                )}
              </div>

              {prog.summary && (
                <p className="mb-3 text-xs leading-relaxed text-slate-500">{prog.summary}</p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar className="h-3.5 w-3.5" /> {prog.duration} wks
                </span>
                {prog.frequency && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Dumbbell className="h-3.5 w-3.5" /> {prog.frequency}×/wk
                  </span>
                )}
                {prog.goal && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Target className="h-3.5 w-3.5" /> {prog.goal}
                  </span>
                )}
                {prog.target_audience && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Users className="h-3.5 w-3.5" /> {prog.target_audience}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
