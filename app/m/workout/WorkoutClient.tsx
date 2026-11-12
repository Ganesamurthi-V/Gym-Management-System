'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Calendar, ChevronRight, Dumbbell, Play, Target, Users } from 'lucide-react'
import type { WorkoutProgram } from '@/types/member-db'
import type { LastWeights } from '@/types/progress'
import { MY_PROGRAM_COOKIE } from '@/lib/member/todays-workout'
import { spring } from '@/lib/motion'
import { Stagger, StaggerItem } from '@/components/ui/motion'
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
  const reduce = useReducedMotion()
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

  // The member's own pick (or the first program) is the one filled hero; the rest are neutral tiles.
  const heroId = (canChoose && programs.find(p => p.id === mineId)?.id) || programs[0]?.id

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {selectedProgram ? (
        <motion.div key={`detail-${selectedProgram.id}`} {...slide} transition={spring}>
          <WorkoutDetail
            program={selectedProgram}
            lastWeights={lastWeights}
            isMine={canChoose ? mineId === selectedProgram.id : undefined}
            onChooseForMe={canChoose ? () => chooseForMe(selectedProgram.id) : undefined}
            onBack={() => setSelectedProgram(null)}
          />
        </motion.div>
      ) : (
        <motion.div key="list" {...slide} transition={spring}>
          <Stagger className="space-y-3">
            {programs.map((prog) => {
              const isHero = prog.id === heroId
              const meta = isHero ? 'text-white/80' : 'text-slate-500'
              return (
                <StaggerItem key={prog.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedProgram(prog)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProgram(prog) } }}
                    className={
                      isHero
                        ? 'w-full cursor-pointer rounded-3xl bg-brand-500 p-5 text-left text-white shadow-lg shadow-brand-500/25 transition-transform active:scale-[0.98]'
                        : 'tile w-full cursor-pointer p-5 text-left transition-transform active:scale-[0.98]'
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className={`text-lg font-bold leading-snug tracking-tight ${isHero ? 'text-white' : 'text-slate-900'}`}>
                        {prog.name}
                      </h2>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {canChoose && mineId === prog.id && (
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${isHero ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                            For me
                          </span>
                        )}
                        {prog.difficulty && (
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${isHero ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700'}`}>
                            {prog.difficulty}
                          </span>
                        )}
                        {!isHero && <ChevronRight className="h-4 w-4 text-slate-300" />}
                      </div>
                    </div>

                    {prog.summary && (
                      <p className={`mt-2 line-clamp-2 text-xs leading-relaxed ${meta}`}>{prog.summary}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                      <span className={`flex items-center gap-1 text-xs ${meta}`}>
                        <Calendar className="h-3.5 w-3.5" /> {prog.duration} wks
                      </span>
                      {prog.frequency && (
                        <span className={`flex items-center gap-1 text-xs ${meta}`}>
                          <Dumbbell className="h-3.5 w-3.5" /> {prog.frequency}×/wk
                        </span>
                      )}
                      {prog.goal && (
                        <span className={`flex items-center gap-1 text-xs ${meta}`}>
                          <Target className="h-3.5 w-3.5" /> {prog.goal}
                        </span>
                      )}
                      {prog.target_audience && (
                        <span className={`flex items-center gap-1 text-xs ${meta}`}>
                          <Users className="h-3.5 w-3.5" /> {prog.target_audience}
                        </span>
                      )}
                    </div>

                    {isHero && (
                      <span className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-brand-600">
                        <Play className="h-4 w-4" fill="currentColor" />
                        Start
                      </span>
                    )}
                  </div>
                </StaggerItem>
              )
            })}
          </Stagger>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
