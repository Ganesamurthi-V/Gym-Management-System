'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, CheckCircle2, Clock, Dumbbell, Flame, Zap } from 'lucide-react'
import { spring } from '@/lib/motion'
import { CountUp, ProgressRing, Stagger, StaggerItem } from '@/components/ui/motion'

// ─── Types (mirrored from WorkoutSession) ────────────────────────────────────

interface ExerciseSet {
  exerciseName?: string
  reps?: string
  weight?: string
  rest?: string
}

interface SessionExercise {
  id: string
  name: string
  target: string
  type: string
  notes: string
  sets: ExerciseSet[]
}

interface SetLog {
  planned: ExerciseSet
  completed: boolean
  completedAt: number | null
  actualWeight: string
}

interface ExerciseLog {
  exercise: SessionExercise
  sets: SetLog[]
  startedAt: number | null
  finishedAt: number | null
}

export type SaveState = 'saving' | 'saved' | 'error'

interface Props {
  programName: string
  dayLabel: string
  log: ExerciseLog[]
  totalElapsedMs: number
  saveState: SaveState
  onRetrySave: () => void
  onDone: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60)
    const rmins = mins % 60
    return `${hrs}h ${rmins}m`
  }
  return `${mins}m ${secs}s`
}

function formatMins(ms: number): string {
  return `${Math.round(ms / 60000)}m`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkoutComplete({ programName, dayLabel, log, totalElapsedMs, saveState, onRetrySave, onDone }: Props) {
  const reduce = useReducedMotion()
  const stats = useMemo(() => {
    const totalExercises = log.length
    const totalSets = log.reduce((s, ex) => s + ex.sets.length, 0)
    const completedSets = log.reduce((s, ex) => s + ex.sets.filter(st => st.completed).length, 0)

    // Total volume: reps × weight actually entered; planned weight only when none was entered
    let totalVolume = 0
    let totalReps = 0
    for (const ex of log) {
      for (const set of ex.sets) {
        if (!set.completed) continue
        const reps = parseInt(set.planned.reps ?? '0', 10) || 0
        const entered = parseFloat(set.actualWeight.replace(',', '.'))
        const weight = Number.isFinite(entered) ? entered : parseFloat(set.planned.weight ?? '0') || 0
        totalReps += reps
        totalVolume += reps * weight
      }
    }

    // Per-exercise time breakdown for the chart
    const exerciseTimes: { name: string; durationMs: number; target: string }[] = []
    for (const ex of log) {
      if (ex.startedAt && ex.finishedAt) {
        exerciseTimes.push({
          name: ex.exercise.name,
          durationMs: ex.finishedAt - ex.startedAt,
          target: ex.exercise.target,
        })
      }
    }

    // Fastest and slowest exercise
    const sorted = [...exerciseTimes].sort((a, b) => a.durationMs - b.durationMs)
    const fastest = sorted[0] ?? null
    const slowest = sorted[sorted.length - 1] ?? null

    return {
      totalExercises,
      totalSets,
      completedSets,
      totalReps,
      totalVolume,
      exerciseTimes,
      fastest,
      slowest,
    }
  }, [log])

  // Find the max duration for the bar chart scaling
  const maxDuration = Math.max(...stats.exerciseTimes.map(e => e.durationMs), 1)

  // Target muscle group breakdown
  const targetBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const ex of log) {
      const target = ex.exercise.target || 'Other'
      map.set(target, (map.get(target) ?? 0) + ex.sets.filter(s => s.completed).length)
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, sets]) => ({ name, sets }))
  }, [log])

  return (
    <div className="flex flex-col">

      {/* Hero: the one filled element. Ring fills to sets done, check pops in with a spring */}
      <div className="mb-5 flex flex-col items-center rounded-3xl bg-brand-500 px-5 py-7 text-center text-white shadow-lg shadow-brand-500/25">
        <ProgressRing
          value={stats.totalSets > 0 ? stats.completedSets / stats.totalSets : 0}
          size={96}
          strokeWidth={8}
          className="text-white"
          trackClassName="text-white/25"
          label={`${stats.completedSets} of ${stats.totalSets} sets done`}
        >
          <motion.span
            initial={{ scale: reduce ? 1 : 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16, delay: reduce ? 0 : 0.25 }}
            className="flex"
          >
            <Check className="h-10 w-10 text-white" strokeWidth={3} />
          </motion.span>
        </ProgressRing>
        <h2 className="mt-4 text-3xl font-bold tracking-tight">Workout Complete!</h2>
        <p className="mt-1 text-sm text-white/80">{programName} · {dayLabel}</p>
      </div>

      {/* Stats grid */}
      <Stagger className="mb-5 grid grid-cols-2 gap-3">
        <StaggerItem>
          <div className="tile flex flex-col items-center p-4 text-center">
            <Clock className="mb-1.5 h-5 w-5 text-brand-500" />
            <p className="text-2xl font-bold tracking-tight text-slate-900">{formatDuration(totalElapsedMs)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Duration</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="tile flex flex-col items-center p-4 text-center">
            <Dumbbell className="mb-1.5 h-5 w-5 text-orange-500" />
            <CountUp value={stats.totalExercises} className="text-2xl font-bold tracking-tight text-slate-900" />
            <p className="mt-0.5 text-xs text-slate-500">Exercises</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="tile flex flex-col items-center p-4 text-center">
            <CheckCircle2 className="mb-1.5 h-5 w-5 text-emerald-500" />
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              <CountUp value={stats.completedSets} />/{stats.totalSets}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Sets Done</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="tile flex flex-col items-center p-4 text-center">
            <Flame className="mb-1.5 h-5 w-5 text-red-500" />
            <CountUp value={stats.totalReps} className="text-2xl font-bold tracking-tight text-slate-900" />
            <p className="mt-0.5 text-xs text-slate-500">Total Reps</p>
          </div>
        </StaggerItem>
      </Stagger>

      {/* Volume */}
      {stats.totalVolume > 0 && (
        <div className="tile mb-5 flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50">
            <Zap className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900">
              <CountUp value={stats.totalVolume} suffix=" kg" />
            </p>
            <p className="text-xs text-slate-500">Total Volume (reps × weight)</p>
          </div>
        </div>
      )}

      {/* Performance chart: time per exercise (horizontal bars) */}
      {stats.exerciseTimes.length > 0 && (
        <section className="tile mb-5 p-4">
          <p className="mb-3 text-xs font-bold text-slate-500">
            Time Per Exercise
          </p>
          <div className="space-y-2.5">
            {stats.exerciseTimes.map((ex, i) => {
              const pct = Math.max(8, (ex.durationMs / maxDuration) * 100)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-700 truncate max-w-[60%]">{ex.name}</p>
                    <p className="text-xs font-bold text-slate-500">{formatMins(ex.durationMs)}</p>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    {/* Full-width bar scaled with a transform (no width animation) */}
                    <motion.div
                      className="h-full origin-left rounded-full bg-brand-500"
                      initial={{ scaleX: reduce ? pct / 100 : 0 }}
                      animate={{ scaleX: pct / 100 }}
                      transition={{ ...spring, delay: reduce ? 0 : 0.2 + i * 0.05 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Fastest / slowest callout */}
          {stats.exerciseTimes.length >= 2 && stats.fastest && stats.slowest && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-0.5">Fastest</p>
                <p className="text-xs font-bold text-emerald-800 truncate">{stats.fastest.name}</p>
                <p className="text-[10px] text-emerald-600">{formatMins(stats.fastest.durationMs)}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Most Time</p>
                <p className="text-xs font-bold text-amber-800 truncate">{stats.slowest.name}</p>
                <p className="text-[10px] text-amber-600">{formatMins(stats.slowest.durationMs)}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Muscle groups hit */}
      {targetBreakdown.length > 0 && (
        <section className="tile mb-5 p-4">
          <p className="mb-3 text-xs font-bold text-slate-500">
            Muscles Worked
          </p>
          <div className="flex flex-wrap gap-2">
            {targetBreakdown.map(({ name, sets }) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
              >
                {name}
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-black text-brand-700">
                  {sets}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Save status; never blocks the summary */}
      <p className="mb-3 text-center text-xs font-semibold text-slate-500" role="status">
        {saveState === 'saving' && 'Saving...'}
        {saveState === 'saved' && (
          <>Saved to your history. <Link href="/m/progress/workouts" className="text-brand-600 underline">View</Link></>
        )}
        {saveState === 'error' && (
          <>
            Could not save. Try again{' '}
            <button type="button" onClick={onRetrySave} className="min-h-11 px-3 font-bold text-brand-600 underline">
              Retry
            </button>
          </>
        )}
      </p>

      {/* Done button */}
      {/* Sticky, offset clears the floating bottom nav */}
      <div className="sticky bottom-[calc(var(--bottom-nav-height)+0.75rem+var(--pwa-safe-bottom)+0.75rem)] z-10">
        <button
          type="button"
          onClick={onDone}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-brand-500 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition-transform active:scale-[0.97] hover:bg-brand-600"
        >
          <CheckCircle2 className="h-5 w-5" />
          Done
        </button>
      </div>
    </div>
  )
}
