'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, ChevronRight, Timer } from 'lucide-react'
import { api } from '@/lib/api/client'
import { PROGRESS_LIMITS, normaliseExerciseName, type LastWeights } from '@/types/progress'
import WorkoutComplete, { type SaveState } from './WorkoutComplete'

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
  lastWeights: LastWeights
  onFinish: () => void
  onBack: () => void
}

interface SetLog {
  planned: ExerciseSet
  completed: boolean
  completedAt: number | null // timestamp
  actualWeight: string // text typed by the member; '' = none
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

/** Empty -> null (bodyweight); invalid or out of range -> undefined. Accepts "42,5". */
function parseWeight(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= PROGRESS_LIMITS.liftMax ? n : undefined
}

function plannedNumber(text: string | undefined): number | null {
  const n = parseFloat(text ?? '')
  return Number.isFinite(n) ? n : null
}

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 3) | 8).toString(16)
  })
}

/** Short "Last time" hint: one value if all sets match, otherwise "40 / 42.5 / 45". */
function lastTimeText(weights: (number | null)[] | undefined): string | null {
  const w = (weights ?? []).filter((x): x is number => x != null)
  if (w.length === 0) return null
  const unique = [...new Set(w)]
  return `${unique.length === 1 ? unique[0] : unique.join(' / ')} kg`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkoutSession({ programName, dayLabel, exercises, lastWeights, onFinish, onBack }: Props) {
  const router = useRouter()
  // Build the full log structure on mount
  const initialLog = useMemo<ExerciseLog[]>(() =>
    exercises.map(ex => ({
      exercise: ex,
      sets: (ex.sets.length > 0 ? ex.sets : [{ reps: '10', weight: '', rest: '60' }]).map((s, i) => {
        const prefill = lastWeights[normaliseExerciseName(ex.name)]?.[i] ?? plannedNumber(s.weight)
        return {
          planned: s,
          completed: false,
          completedAt: null,
          actualWeight: prefill != null ? String(prefill) : '',
        }
      }),
      startedAt: null,
      finishedAt: null,
    })),
  [exercises, lastWeights])

  const [log, setLog] = useState<ExerciseLog[]>(initialLog)
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [currentSetIdx, setCurrentSetIdx] = useState(0)
  const [sessionStartedAt] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saving')
  const clientIdRef = useRef(newClientId())
  const startedAtRef = useRef(new Date(sessionStartedAt).toISOString())
  const saveStartedRef = useRef(false)

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
  const weightInvalid = currentSet ? parseWeight(currentSet.actualWeight) === undefined : false
  const lastHint = currentExercise ? lastTimeText(lastWeights[normaliseExerciseName(currentExercise.exercise.name)]) : null
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

  const setWeight = (text: string) => {
    setLog(prev => prev.map((ex, ei) => ei !== currentExIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, si) => si === currentSetIdx ? { ...s, actualWeight: text } : s),
    }))
  }

  const saveSession = useCallback(async () => {
    setSaveState('saving')
    try {
      await api.post('/api/member/workout-sessions', {
        client_id: clientIdRef.current,
        program_name: programName,
        day_label: dayLabel,
        started_at: startedAtRef.current,
        duration_seconds: Math.round(elapsed / 1000),
        exercises: log.map(ex => ({
          name: ex.exercise.name,
          sets: ex.sets.map(s => {
            const reps = parseInt(s.planned.reps ?? '', 10)
            return {
              reps: Number.isFinite(reps) ? reps : null,
              weight_kg: parseWeight(s.actualWeight) ?? null,
              done: s.completed,
            }
          }),
        })),
      })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [programName, dayLabel, elapsed, log])

  // Save once when the session completes; Retry re-sends the same client_id.
  useEffect(() => {
    if (!isComplete || saveStartedRef.current) return
    saveStartedRef.current = true
    void saveSession()
  }, [isComplete, saveSession])

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
        saveState={saveState}
        onRetrySave={() => void saveSession()}
        onDone={() => { router.refresh(); onFinish() }}
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
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-surface border border-amber-200 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors"
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
                {lastHint && <p className="text-xs text-slate-400 mt-0.5">Last time: {lastHint}</p>}
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

          {/* Weight actually used for the current set */}
          {!isResting && currentSet && !currentSet.completed && (
            <label className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-2">
              <span className="text-xs font-bold text-slate-700">Weight used, set {currentSetIdx + 1}</span>
              <span className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={currentSet.actualWeight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="0"
                  aria-invalid={weightInvalid}
                  className="h-11 w-24 rounded-xl border border-surface-border bg-surface px-3 text-right text-sm font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                />
                <span className="text-xs font-semibold text-slate-500">kg</span>
              </span>
            </label>
          )}

          {/* Complete set button */}
          {!isResting && currentSet && !currentSet.completed && (
            <button
              type="button"
              onClick={completeSet}
              disabled={weightInvalid}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.97] hover:bg-emerald-600 disabled:opacity-50"
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
