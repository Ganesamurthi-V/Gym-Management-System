'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronRight, Dumbbell, Target, Users } from 'lucide-react'
import type { WorkoutProgram } from '@/types/member-db'
import type { LastWeights } from '@/types/progress'
import { MY_PROGRAM_COOKIE } from '@/lib/member/todays-workout'
import WorkoutDetail from './WorkoutDetail'

interface Props {
  programs: WorkoutProgram[]
  lastWeights: LastWeights
  /** Program to open straight away (from the home screen's Start workout). */
  openProgramId?: string
  /** Program the member marked "For me", when several are assigned. */
  myProgramId?: string
}

export default function WorkoutClient({ programs, lastWeights, openProgramId, myProgramId }: Props) {
  const router = useRouter()
  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(
    () => programs.find(p => p.id === openProgramId) ?? null,
  )
  // Only meaningful with 2+ programs; a stale id (unassigned program) simply matches nothing.
  const [mineId, setMineId] = useState<string | undefined>(myProgramId)
  const canChoose = programs.length > 1

  function chooseForMe(id: string) {
    setMineId(id)
    try {
      document.cookie = `${MY_PROGRAM_COOKIE}=${id}; path=/m; max-age=31536000; samesite=lax`
    } catch { /* cookies blocked: the choice just does not persist */ }
    // Home reads the cookie on the server; refresh so its Start workout card follows the choice.
    router.refresh()
  }

  if (selectedProgram) {
    return (
      <WorkoutDetail
        program={selectedProgram}
        lastWeights={lastWeights}
        isMine={canChoose ? mineId === selectedProgram.id : undefined}
        onChooseForMe={canChoose ? () => chooseForMe(selectedProgram.id) : undefined}
        onBack={() => setSelectedProgram(null)}
      />
    )
  }

  return (
    <div className="space-y-3">
      {programs.map((prog) => (
        <button
          key={prog.id}
          type="button"
          onClick={() => setSelectedProgram(prog)}
          className="card w-full p-4 text-left transition-all active:scale-[0.98] hover:border-brand-200 hover:shadow-md"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 leading-snug">{prog.name}</h2>
            <div className="flex items-center gap-1.5">
              {canChoose && mineId === prog.id && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  For me
                </span>
              )}
              {prog.difficulty && (
                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                  {prog.difficulty}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
            </div>
          </div>

          {prog.summary && (
            <p className="mb-3 text-xs leading-relaxed text-slate-500 line-clamp-2">{prog.summary}</p>
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
        </button>
      ))}
    </div>
  )
}
