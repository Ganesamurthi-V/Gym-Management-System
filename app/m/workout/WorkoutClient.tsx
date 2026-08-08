'use client'

import { useState } from 'react'
import { Calendar, ChevronRight, Dumbbell, Target, Users } from 'lucide-react'
import type { WorkoutProgram } from '@/types/member-db'
import WorkoutDetail from './WorkoutDetail'

interface Props {
  programs: WorkoutProgram[]
}

export default function WorkoutClient({ programs }: Props) {
  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(null)

  if (selectedProgram) {
    return (
      <WorkoutDetail
        program={selectedProgram}
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
