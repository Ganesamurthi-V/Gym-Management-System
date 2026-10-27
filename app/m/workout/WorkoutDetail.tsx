'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api/client'
import { ArrowLeft, Calendar, Dumbbell, Play, Target } from 'lucide-react'
import type { WorkoutProgram } from '@/types/member-db'
import type { Json } from '@/types/member-db'
import type { LastWeights } from '@/types/progress'
import WorkoutSession, { newClientId } from './WorkoutSession'

interface ExerciseSet {
  exerciseName?: string
  reps?: string
  weight?: string
  rest?: string
}

interface ExerciseInstance {
  id: string
  name: string
  type: string
  target: string
  notes: string
  progressions: Record<number, ExerciseSet[]>
}

interface Props {
  program: WorkoutProgram
  lastWeights: LastWeights
  /** Set only when the member has several programs: whether this one is their "For me" pick. */
  isMine?: boolean
  onChooseForMe?: () => void
  onBack: () => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const TODAY_INDEX = new Date().getDay() // 0=Sun, 1=Mon...
const TODAY_KEY = DAYS[TODAY_INDEX === 0 ? 6 : TODAY_INDEX - 1] // Reindex: Mon=0

function parseSchedule(raw: Json): Record<string, ExerciseInstance[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, ExerciseInstance[]> = {}
  for (const day of DAYS) {
    const entries = (raw as Record<string, unknown>)[day]
    out[day] = Array.isArray(entries) ? entries as ExerciseInstance[] : []
  }
  return out
}

export default function WorkoutDetail({ program, lastWeights, isMine, onChooseForMe, onBack }: Props) {
  const [activeDay, setActiveDay] = useState<string>(TODAY_KEY)
  const [sessionStarted, setSessionStarted] = useState(false)
  // "Do it by myself": the member trained without the phone, so the day is saved as done in one tap.
  const [selfLog, setSelfLog] = useState<'idle' | 'confirm' | 'saving' | 'saved' | 'error'>('idle')
  const selfClientId = useRef<string | null>(null)
  const router = useRouter()

  const schedule = useMemo(() => parseSchedule(program.schedule), [program.schedule])
  const exercises = schedule[activeDay] ?? []

  // Get sets for week 1 as the default display
  const getExerciseSets = (ex: ExerciseInstance): ExerciseSet[] => {
    if (!ex.progressions) return []
    // Find the first available week
    const weeks = Object.keys(ex.progressions).map(Number).sort((a, b) => a - b)
    if (weeks.length === 0) return []
    return ex.progressions[weeks[0]] ?? []
  }

  // Days that have at least one exercise
  const activeDays = DAYS.filter(d => (schedule[d] ?? []).length > 0)

  async function markDoneByMyself() {
    setSelfLog('saving')
    selfClientId.current ??= newClientId()
    try {
      await api.post('/api/member/workout-sessions', {
        client_id: selfClientId.current,
        program_name: program.name,
        day_label: activeDay,
        started_at: new Date().toISOString(),
        duration_seconds: 0,
        exercises: exercises.map(ex => ({
          name: ex.name,
          sets: (getExerciseSets(ex).length > 0 ? getExerciseSets(ex) : [{ reps: '10' }]).map(s => {
            const reps = parseInt(s.reps ?? '', 10)
            return { reps: Number.isFinite(reps) ? reps : null, weight_kg: null, done: true }
          }),
        })),
      })
      setSelfLog('saved')
      router.refresh()
    } catch {
      setSelfLog('error')
    }
  }

  if (sessionStarted && exercises.length > 0) {
    return (
      <WorkoutSession
        programName={program.name}
        lastWeights={lastWeights}
        dayLabel={activeDay}
        exercises={exercises.map(ex => ({
          id: ex.id,
          name: ex.name,
          target: ex.target,
          type: ex.type,
          notes: ex.notes,
          sets: getExerciseSets(ex),
        }))}
        onFinish={() => setSessionStarted(false)}
        onBack={() => setSessionStarted(false)}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Programs
      </button>

      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">{program.name}</h2>
          {onChooseForMe && (isMine ? (
            <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">For me</span>
          ) : (
            <button
              type="button"
              onClick={onChooseForMe}
              className="min-h-[44px] shrink-0 rounded-full border border-brand-500 px-3 text-xs font-bold text-brand-600"
            >
              For me
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {program.duration} weeks</span>
          {program.frequency && <span className="flex items-center gap-1"><Dumbbell className="h-3.5 w-3.5" /> {program.frequency}×/week</span>}
          {program.goal && <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" /> {program.goal}</span>}
        </div>
        {program.summary && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{program.summary}</p>
        )}
      </div>

      {/* Day tabs */}
      {activeDays.length > 0 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {activeDays.map(day => (
            <button
              key={day}
              type="button"
              onClick={() => { setActiveDay(day); setSelfLog('idle'); selfClientId.current = null }}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeDay === day
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              } ${day === TODAY_KEY ? 'ring-2 ring-brand-200 ring-offset-1' : ''}`}
            >
              {day}
              {day === TODAY_KEY && <span className="ml-1 text-[9px] opacity-75">Today</span>}
            </button>
          ))}
        </div>
      )}

      {/* Exercise list for the selected day */}
      {exercises.length === 0 ? (
        <div className="card flex flex-col items-center py-10 text-center">
          <Dumbbell className="mb-2 h-8 w-8 text-slate-200" />
          <p className="text-sm font-bold text-slate-600">Rest Day</p>
          <p className="mt-1 text-xs text-slate-400">No exercises scheduled for {activeDay}.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-5">
            {exercises.map((ex, idx) => {
              const sets = getExerciseSets(ex)
              return (
                <div key={ex.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{ex.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{ex.target} · {ex.type}</p>

                      {sets.length > 0 && (
                        <div className="mt-2.5 space-y-1">
                          {sets.map((set, si) => (
                            <div key={si} className="flex items-center gap-2 text-xs text-slate-600">
                              <span className="w-12 shrink-0 font-semibold text-slate-400">Set {si + 1}</span>
                              {set.reps && <span>{set.reps} reps</span>}
                              {set.weight && <span className="text-slate-400">· {set.weight}</span>}
                              {set.rest && <span className="text-slate-400">· rest {set.rest}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {ex.notes && (
                        <p className="mt-2 text-[11px] italic text-slate-400">{ex.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Start Workout button */}
          <button
            type="button"
            onClick={() => setSessionStarted(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all active:scale-[0.97] hover:bg-brand-600"
          >
            <Play className="h-5 w-5" fill="currentColor" />
            Start Workout
          </button>

          {selfLog === 'saved' ? (
            <p role="status" className="mt-3 text-center text-sm font-semibold text-emerald-600">
              Marked as completed. <Link href="/m/progress/workouts" className="underline">See your history</Link>
            </p>
          ) : selfLog === 'idle' ? (
            <button
              type="button"
              onClick={() => setSelfLog('confirm')}
              className="mt-2 min-h-[44px] w-full text-center text-sm font-semibold text-slate-500"
            >
              Do it by myself
            </button>
          ) : (
            <div className="mt-3 rounded-2xl border border-surface-border bg-surface-card p-4">
              <p className="text-sm font-semibold text-slate-900">Mark {activeDay}&apos;s workout as completed?</p>
              <p className="mt-0.5 text-xs text-slate-500">
                All sets are saved as done, without weights. Use this when you trained without the app.
              </p>
              {selfLog === 'error' && (
                <p role="alert" className="mt-2 text-sm font-semibold text-red-600">Could not save. Try again.</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={selfLog === 'saving'}
                  onClick={() => setSelfLog('idle')}
                  className="min-h-[44px] rounded-xl bg-slate-100 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selfLog === 'saving'}
                  onClick={() => void markDoneByMyself()}
                  className="min-h-[44px] rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
                >
                  {selfLog === 'saving' ? 'Saving…' : 'Mark done'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
