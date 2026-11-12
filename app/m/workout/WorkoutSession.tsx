'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, ChevronRight, Timer } from 'lucide-react'
import { ProgressRing, Sheet } from '@/components/ui/motion'
import { api } from '@/lib/api/client'
import { spring } from '@/lib/motion'
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

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 3) | 8).toString(16)
  })
}

/** Short "Last time" hint: one value if all sets match, otherwise "40 / 42.5 / 45". */
export function lastTimeText(weights: (number | null)[] | undefined): string | null {
  const w = (weights ?? []).filter((x): x is number => x != null)
  if (w.length === 0) return null
  const unique = [...new Set(w)]
  return `${unique.length === 1 ? unique[0] : unique.join(' / ')} kg`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkoutSession({ programName, dayLabel, exercises, lastWeights, onFinish, onBack }: Props) {
  const router = useRouter()
  const reduce = useReducedMotion()
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
  const [queueOpen, setQueueOpen] = useState(false)
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
  const progress = totalSets > 0 ? completedSets / totalSets : 0

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
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="flex flex-1 flex-col"
      >
        <WorkoutComplete
          programName={programName}
          dayLabel={dayLabel}
          log={log}
          totalElapsedMs={elapsed}
          saveState={saveState}
          onRetrySave={() => void saveSession()}
          onDone={() => { router.refresh(); onFinish() }}
        />
      </motion.div>
    )
  }

  // ── Active session view (rendered inside the full-screen FocusOverlay) ──────
  // The rest that just ended was planned on the previous set (or the last set of the previous exercise).
  const prevSet = currentSetIdx > 0
    ? currentExercise?.sets[currentSetIdx - 1]
    : log[currentExIdx - 1]?.sets[log[currentExIdx - 1].sets.length - 1]
  const restTotal = Math.max(parseRestSeconds(prevSet?.planned.rest), restCountdown, 1)
  const doneInExercise = currentExercise ? currentExercise.sets.filter(s => s.completed).length : 0
  const setsInExercise = currentExercise?.sets.length ?? 0
  const upNext = log.slice(currentExIdx + 1)

  return (
    <div className="flex flex-1 flex-col">

      {/* Top row */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[44px] items-center gap-1 pr-3 text-sm font-semibold text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Exit
        </button>
        <div className="flex items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1.5 text-xs font-bold tabular-nums text-slate-700">
          <Timer className="h-3.5 w-3.5 text-brand-500" />
          {formatTime(elapsed)}
        </div>
        <p className="min-w-[4.5rem] text-right text-xs font-bold text-slate-500">
          {currentExIdx + 1} of {log.length}
        </p>
      </div>

      {/* Overall progress: scaleX (transform) instead of animating width: no layout work per frame */}
      <div
        role="progressbar"
        aria-label={`${completedSets} of ${totalSets} sets done`}
        aria-valuemin={0}
        aria-valuemax={totalSets}
        aria-valuenow={completedSets}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <motion.div
          className="h-full origin-left rounded-full bg-brand-500"
          initial={false}
          animate={{ scaleX: progress }}
          transition={spring}
        />
      </div>
      <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {programName} · {dayLabel}
      </p>

      {/* Centre: ring (sets done, or the rest countdown), then the exercise */}
      {currentExercise && (
        <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
          {isResting ? (
            <ProgressRing
              value={restCountdown / restTotal}
              size={200}
              strokeWidth={12}
              className="text-amber-500"
              trackClassName="text-amber-100"
              label={`Rest, ${restCountdown} seconds left`}
            >
              <span className="flex flex-col items-center">
                <span className="text-xs font-bold uppercase tracking-widest text-amber-600">Rest</span>
                <span className="text-5xl font-black tabular-nums text-amber-700">{restCountdown}s</span>
              </span>
            </ProgressRing>
          ) : (
            <ProgressRing
              value={setsInExercise > 0 ? doneInExercise / setsInExercise : 0}
              size={200}
              strokeWidth={12}
              className="text-brand-500"
              label={`${doneInExercise} of ${setsInExercise} sets done`}
            >
              <span className="flex flex-col items-center">
                <span className="text-5xl font-black tabular-nums text-slate-900">{doneInExercise}/{setsInExercise}</span>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">sets</span>
              </span>
            </ProgressRing>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentExIdx}
              initial={{ opacity: 0, x: reduce ? 0 : 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : -24 }}
              transition={spring}
              className="mt-5 w-full"
            >
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">{currentExercise.exercise.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {currentSet ? `Set ${currentSetIdx + 1}` : ''}
                {currentSet?.planned.reps ? ` · ${currentSet.planned.reps} reps` : ''}
                {currentSet?.planned.weight ? ` · ${currentSet.planned.weight}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{currentExercise.exercise.target} · {currentExercise.exercise.type}</p>
              {lastHint && <p className="mt-0.5 text-xs text-slate-400">Last time: {lastHint}</p>}
              {currentExercise.exercise.notes && (
                <p className="mt-2 text-xs italic leading-relaxed text-slate-400">{currentExercise.exercise.notes}</p>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Weight actually used for the current set */}
          {!isResting && currentSet && !currentSet.completed && (
            <label className="mt-4 flex w-full items-center justify-between gap-3 rounded-3xl border border-surface-border bg-surface-card px-4 py-2 text-left">
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

          {upNext.length > 0 && (
            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-slate-500"
            >
              Up next: {upNext[0].exercise.name}
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Primary action, pinned to the bottom of the overlay */}
      <div className="sticky bottom-0 bg-surface pb-1 pt-3">
        {isResting ? (
          <button
            type="button"
            onClick={skipRest}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full border border-amber-200 bg-amber-50 text-base font-bold text-amber-700"
          >
            <ChevronRight className="h-5 w-5" />
            Skip Rest
          </button>
        ) : currentExercise && currentSet && !currentSet.completed ? (
          <motion.button
            type="button"
            onClick={completeSet}
            disabled={weightInvalid}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={spring}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-emerald-500 text-base font-bold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 disabled:opacity-50"
          >
            <Check className="h-5 w-5" />
            Complete set {currentSetIdx + 1}
          </motion.button>
        ) : null}
      </div>

      {/* Exercise queue */}
      <Sheet open={queueOpen} onOpenChange={setQueueOpen} title="Up next" description={`${upNext.length} left after this one`}>
        <div className="space-y-1.5 pb-2">
          {upNext.map((exLog, i) => (
            <div key={exLog.exercise.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-secondary px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[10px] font-bold text-slate-500">
                {currentExIdx + 2 + i}
              </span>
              <span className="truncate text-sm font-semibold text-slate-700">{exLog.exercise.name}</span>
              <span className="ml-auto text-xs text-slate-400">{exLog.sets.length} sets</span>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
