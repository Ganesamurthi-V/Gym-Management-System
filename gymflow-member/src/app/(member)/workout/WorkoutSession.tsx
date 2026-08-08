'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Timer } from 'lucide-react'
import WorkoutComplete from './WorkoutComplete'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExerciseSet {
  exerciseName?: string
  reps?: string
  weight?: string
  rest?: string
}

export interface SessionExercise {
  id: string
  name: string
  target: string
  type: string
  notes: string
  sets: ExerciseSet[]
}

interface Props {
  programName: string
  dayLabel: string
  exercises: SessionExercise[]
  onFinish: () => void
  onBack: () => void
}

interface SetLog {
  planned: ExerciseSet
  completed: boolean
  completedAt: number | null // timestamp
}

interface ExerciseLog {
  exercise: SessionExercise
  sets: SetLog[]
  startedAt: number | null
  finishedAt: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function parseRestSeconds(rest: string | undefined): number {
  if (!rest) return 0
  const num = parseInt(rest, 10)
  return Number.isFinite(num) && num > 0 ? num : 0
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkoutSession({ programName, dayLabel, exercises, onFinish, onBack }: Props) {
  // Build the full log structure on mount
  const initialLog = useMemo<ExerciseLog[]>(() =>
    exercises.map(ex => ({
      exercise: ex,
      sets: (ex.sets.length > 0 ? ex.sets : [{ reps: '10', weight: '', rest: '60' }]).map(s => ({
        planned: s,
        completed: false,
        completedAt: null,
      })),
      startedAt: null,
      finishedAt: null,
    })),
  [exercises])

  const [log, setLog] = useState<ExerciseLog[]>(initialLog)
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [currentSetIdx, setCurrentSetIdx] = useState(0)
  const [sessionStartedAt] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  // Rest timer state
  const [restCountdown, setRestCountdown] = useState(0)
  const [isResting, setIsResting] = useState(false)
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Session timer
  useEffect(() => {
    if (isComplete) return
    const t = setInterval(() => setElapsed(Date.now() - sessionStartedAt), 1000)
    return () => clearInterval(t)
  }, [sessionStartedAt, isComplete])

  // Rest countdown
  useEffect(() => {
    if (!isResting || restCountdown <= 0) {
      if (restTimerRef.current) clearInterval(restTimerRef.current)
      if (isResting && restCountdown <= 0) setIsResting(false)
      return
    }
    restTimerRef.current = setInterval(() => {
      setRestCountdown(prev => {
        if (prev <= 1) {
          setIsResting(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (restTimerRef.current) clearInterval(restTimerRef.current) }
  }, [isResting, restCountdown])

  // Mark the current exercise as started on first interaction
  useEffect(() => {
    setLog(prev => {
      const next = [...prev]
      if (next[currentExIdx] && !next[currentExIdx].startedAt) {
        next[currentExIdx] = { ...next[currentExIdx], startedAt: Date.now() }
      }
      return next
    })
  }, [currentExIdx])

  const currentExercise = log[currentExIdx]
  const currentSet = currentExercise?.sets[currentSetIdx]
  const totalSets = log.reduce((sum, ex) => sum + ex.sets.length, 0)
  const completedSets = log.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0)
  const progress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0

  const completeSet = useCallback(() => {
    const now = Date.now()

    setLog(prev => {
      const next = [...prev]
      const exLog = { ...next[currentExIdx] }
      const sets = [...exLog.sets]
      sets[currentSetIdx] = { ...sets[currentSetIdx], completed: true, completedAt: now }
      exLog.sets = sets
      next[currentExIdx] = exLog
      return next
    })

    const isLastSetOfExercise = currentSetIdx >= currentExercise.sets.length - 1
    const isLastExercise = currentExIdx >= log.length - 1

    if (isLastSetOfExercise && isLastExercise) {
      // All done!
      setLog(prev => {
        const next = [...prev]
        next[currentExIdx] = { ...next[currentExIdx], finishedAt: now }
        return next
      })
      setIsComplete(true)
      return
    }

    // Start rest timer if the set has a rest value
    const restSec = parseRestSeconds(currentSet?.planned.rest)

    if (isLastSetOfExercise) {
      // Move to next exercise
      setLog(prev => {
        const next = [...prev]
        next[currentExIdx] = { ...next[currentExIdx], finishedAt: now }
        return next
      })
      setCurrentExIdx(prev => prev + 1)
      setCurrentSetIdx(0)

      if (restSec > 0) {
        setRestCountdown(restSec)
        setIsResting(true)
      }
    } else {
      // Move to next set
      setCurrentSetIdx(prev => prev + 1)

      if (restSec > 0) {
        setRestCountdown(restSec)
        setIsResting(true)
      }
    }
  }, [currentExIdx, currentSetIdx, currentExercise, currentSet, log.length])

  const skipRest = useCallback(() => {
    setRestCountdown(0)
    setIsResting(false)
  }, [])

  // ── Completed view ──────────────────────────────────────────────────────────
  if (isComplete) {
    return (
      <WorkoutComplete
        programName={programName}
        dayLabel={dayLabel}
        log={log}
        totalElapsedMs={elapsed}
        onDone={onFinish}
      />
    )
  }

  // ── Active session view ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[70dvh]">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Exit
        </button>
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Timer className="h-3.5 w-3.5 text-brand-500" />
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {programName} · {dayLabel}
          </p>
          <p className="text-[10px] font-bold text-brand-600">{completedSets}/{totalSets} sets</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Rest timer overlay */}
      {isResting && (
        <div className="mb-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-5 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-2">Rest</p>
          <p className="text-4xl font-black text-amber-700 tabular-nums">{restCountdown}s</p>
          <button
            type="button"
            onClick={skipRest}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white border border-amber-200 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Skip Rest
          </button>
        </div>
      )}

      {/* Current exercise card */}
      {currentExercise && (
        <div className="flex-1">
          <div className="card p-5 border-brand-100 border-2 mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">
                  Exercise {currentExIdx + 1} of {log.length}
                </p>
                <h3 className="text-lg font-bold text-slate-900">{currentExercise.exercise.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{currentExercise.exercise.target} · {currentExercise.exercise.type}</p>
              </div>
            </div>

            {currentExercise.exercise.notes && (
              <p className="text-xs italic text-slate-400 mb-3 leading-relaxed">{currentExercise.exercise.notes}</p>
            )}

            {/* Sets overview */}
            <div className="space-y-2">
              {currentExercise.sets.map((setLog, si) => {
                const isCurrent = si === currentSetIdx
                const { planned } = setLog
                return (
                  <div
                    key={si}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all ${
                      setLog.completed
                        ? 'bg-emerald-50 border border-emerald-200'
                        : isCurrent
                          ? 'bg-brand-50 border-2 border-brand-300 shadow-sm'
                          : 'bg-slate-50 border border-slate-100'
                    }`}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      setLog.completed
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? 'bg-brand-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}>
                      {setLog.completed ? <Check className="h-3.5 w-3.5" /> : si + 1}
                    </div>
                    <div className="flex-1 flex items-center gap-3 text-xs">
                      {planned.reps && (
                        <span className={`font-semibold ${setLog.completed ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {planned.reps} reps
                        </span>
                      )}
                      {planned.weight && (
                        <span className="text-slate-400">{planned.weight}</span>
                      )}
                      {planned.rest && (
                        <span className="text-slate-400 ml-auto">rest {planned.rest}</span>
                      )}
                    </div>
                    {setLog.completed && (
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Complete set button */}
          {!isResting && currentSet && !currentSet.completed && (
            <button
              type="button"
              onClick={completeSet}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.97] hover:bg-emerald-600"
            >
              <Check className="h-5 w-5" />
              Complete Set {currentSetIdx + 1}
            </button>
          )}
        </div>
      )}

      {/* Exercise queue */}
      {log.length > 1 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Up Next</p>
          <div className="space-y-1.5">
            {log.slice(currentExIdx + 1, currentExIdx + 4).map((exLog, i) => (
              <div key={exLog.exercise.id} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[10px] font-bold text-slate-500">
                  {currentExIdx + 2 + i}
                </span>
                <span className="text-xs font-semibold text-slate-600 truncate">{exLog.exercise.name}</span>
                <span className="ml-auto text-[10px] text-slate-400">{exLog.sets.length} sets</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
