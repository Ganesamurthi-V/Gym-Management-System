'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Check, ChevronDown, Dumbbell, Target, Users } from 'lucide-react'
import type { WorkoutProgram } from '@/types/member-db'
import type { LastWeights } from '@/types/progress'
import { MY_PROGRAM_COOKIE } from '@/lib/member/todays-workout'
import { cn } from '@/lib/utils'
import { Sheet } from '@/components/ui/motion'
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
  // Only meaningful with 2+ programs; a stale id (unassigned program) simply matches nothing.
  const [mineId, setMineId] = useState<string | undefined>(myProgramId)
  const [prevMyProgramId, setPrevMyProgramId] = useState(myProgramId)
  if (myProgramId !== prevMyProgramId) {
    setPrevMyProgramId(myProgramId)
    setMineId(myProgramId)
  }
  const canChoose = programs.length > 1
  // Which program is shown: ?program=, else the "For me" pick, else the first. The tab opens on the plan itself.
  const [pickedId, setPickedId] = useState<string | undefined>(
    () => programs.find(p => p.id === openProgramId)?.id ?? programs.find(p => p.id === myProgramId)?.id,
  )
  const [sheetOpen, setSheetOpen] = useState(false)

  const program = programs.find(p => p.id === pickedId) ?? programs[0]

  function chooseForMe(id: string) {
    setMineId(id)
    try {
      document.cookie = `${MY_PROGRAM_COOKIE}=${id}; path=/m; max-age=31536000; samesite=lax`
    } catch { /* cookies blocked: the choice just does not persist */ }
    // Home reads the cookie on the server; refresh so its Start workout card follows the choice.
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-haspopup="dialog"
        className="mb-4 inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-surface-border bg-surface-card px-4 text-sm font-bold text-slate-900 transition-transform active:scale-[0.97]"
      >
        <span className="truncate">{program.name}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Your programs" description="Pick the plan to follow.">
        <div className="space-y-3 pb-2">
          {programs.map(prog => {
            const current = prog.id === program.id
            const isMine = mineId === prog.id
            return (
              <div
                key={prog.id}
                className={cn('rounded-3xl border p-4', current ? 'border-brand-500 bg-brand-50' : 'border-surface-border bg-surface-card')}
              >
                <button
                  type="button"
                  onClick={() => { setPickedId(prog.id); setSheetOpen(false) }}
                  aria-pressed={current}
                  className="block min-h-[44px] w-full text-left"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold leading-snug text-slate-900">{prog.name}</span>
                    {current && <Check aria-label="Current program" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />}
                  </span>
                  {prog.difficulty && (
                    <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-bold text-brand-700">
                      {prog.difficulty}
                    </span>
                  )}
                  {prog.summary && <span className="mt-2 block text-xs leading-relaxed text-slate-500">{prog.summary}</span>}
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {prog.duration} wks</span>
                    {prog.frequency && <span className="flex items-center gap-1"><Dumbbell className="h-3.5 w-3.5" /> {prog.frequency}×/wk</span>}
                    {prog.goal && <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" /> {prog.goal}</span>}
                    {prog.target_audience && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {prog.target_audience}</span>}
                  </span>
                </button>
                {canChoose && (
                  <div className="mt-2">
                    {isMine ? (
                      <span className="inline-flex min-h-[32px] items-center rounded-full bg-emerald-50 px-3 text-xs font-bold text-emerald-700">For me</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => chooseForMe(prog.id)}
                        className="min-h-[44px] rounded-full border border-brand-500 px-4 text-xs font-bold text-brand-600"
                      >
                        For me
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Sheet>

      {/* Keyed by program so the selected day and the "Do it by myself" state reset when switching */}
      <WorkoutDetail key={program.id} program={program} lastWeights={lastWeights} />
    </>
  )
}
