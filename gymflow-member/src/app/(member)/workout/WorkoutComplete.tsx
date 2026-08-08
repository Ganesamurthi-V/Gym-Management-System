'use client'

import { useMemo } from 'react'
import { CheckCircle2, Clock, Dumbbell, Flame, Trophy, Zap } from 'lucide-react'

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
}

interface ExerciseLog {
  exercise: SessionExercise
  sets: SetLog[]
  startedAt: number | null
  finishedAt: number | null
}

interface Props {
  programName: string
  dayLabel: string
  log: ExerciseLog[]
  totalElapsedMs: number
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

export default function WorkoutComplete({ programName, dayLabel, log, totalElapsedMs, onDone }: Props) {
  const stats = useMemo(() => {
    const totalExercises = log.length
    const totalSets = log.reduce((s, ex) => s + ex.sets.length, 0)
    const completedSets = log.reduce((s, ex) => s + ex.sets.filter(st => st.completed).length, 0)

    // Total volume (rough: sum of reps × weight where available)
    let totalVolume = 0
    let totalReps = 0
    for (const ex of log) {
      for (const set of ex.sets) {
        if (!set.completed) continue
        const reps = parseInt(set.planned.reps ?? '0', 10) || 0
        const weight = parseFloat(set.planned.weight ?? '0') || 0
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

      {/* Hero */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-200">
          <Trophy className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Workout Complete!</h2>
        <p className="mt-1 text-sm text-slate-500">{programName} · {dayLabel}</p>
      </div>

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="card p-4 flex flex-col items-center text-center">
          <Clock className="h-5 w-5 text-brand-500 mb-1.5" />
          <p className="text-xl font-black text-slate-900">{formatDuration(totalElapsedMs)}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Duration</p>
        </div>
        <div className="card p-4 flex flex-col items-center text-center">
          <Dumbbell className="h-5 w-5 text-orange-500 mb-1.5" />
          <p className="text-xl font-black text-slate-900">{stats.totalExercises}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Exercises</p>
        </div>
        <div className="card p-4 flex flex-col items-center text-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mb-1.5" />
          <p className="text-xl font-black text-slate-900">{stats.completedSets}/{stats.totalSets}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Sets Done</p>
        </div>
        <div className="card p-4 flex flex-col items-center text-center">
          <Flame className="h-5 w-5 text-red-500 mb-1.5" />
          <p className="text-xl font-black text-slate-900">{stats.totalReps}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Total Reps</p>
        </div>
      </div>

      {/* Volume */}
      {stats.totalVolume > 0 && (
        <div className="card mb-5 p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50">
            <Zap className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-900">{stats.totalVolume.toLocaleString()} kg</p>
            <p className="text-xs font-semibold text-slate-400">Total Volume (reps × weight)</p>
          </div>
        </div>
      )}

      {/* Performance chart: time per exercise (horizontal bars) */}
      {stats.exerciseTimes.length > 0 && (
        <section className="card mb-5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
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
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Fastest / slowest callout */}
          {stats.exerciseTimes.length >= 2 && stats.fastest && stats.slowest && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-0.5">Fastest</p>
                <p className="text-xs font-bold text-emerald-800 truncate">{stats.fastest.name}</p>
                <p className="text-[10px] text-emerald-600">{formatMins(stats.fastest.durationMs)}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
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
        <section className="card mb-5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
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

      {/* Done button */}
      <button
        type="button"
        onClick={onDone}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-brand-500 py-4 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all active:scale-[0.97] hover:bg-brand-600"
      >
        <CheckCircle2 className="h-5 w-5" />
        Done
      </button>
    </div>
  )
}
