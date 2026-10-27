import Link from 'next/link'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { getRecentSessions } from '@/lib/member/progress-data'
import { fmtNum, formatDuration, istDateOf, longDate } from '@/lib/progress/chart'

export default async function WorkoutHistoryPage() {
  // Throws on a failed query on purpose: an error must not render as "no workouts".
  const sessions = await getRecentSessions()

  return (
    <div className="page-container py-6">
      <Link href="/m/progress" className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-600">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> My Progress
      </Link>
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900">Workout history</h1>

      {sessions.length === 0 ? (
        <p className="card p-4 text-sm text-slate-500">
          No workouts saved yet. Finish a guided workout and it appears here.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <details className="card group p-4">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-400">{longDate(istDateOf(s.startedAt))}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{s.programName} · {s.dayLabel}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDuration(s.durationSeconds)} · {s.completedSets}/{s.totalSets} sets · {fmtNum(s.volumeKg)} kg
                    </p>
                  </div>
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
                  {s.exercises.map((ex, i) => {
                    const done = ex.sets.filter((x) => x.done)
                    return (
                      <div key={i}>
                        <p className="text-sm font-semibold text-slate-700">{ex.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {done.length === 0 ? (
                            <span className="text-xs text-slate-400">No sets completed</span>
                          ) : (
                            done.map((x, j) => (
                              <span key={j} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {x.weightKg != null ? `${fmtNum(x.weightKg)} kg` : 'bodyweight'} x {x.reps ?? '-'}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
