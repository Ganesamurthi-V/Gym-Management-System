'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api/client'
import { Dumbbell, Play } from 'lucide-react'
import type { WorkoutProgram } from '@/types/member-db'
import type { Json } from '@/types/member-db'
import type { LastWeights } from '@/types/progress'
import { Stagger, StaggerItem } from '@/components/ui/motion'
import { cn } from '@/lib/utils'
import { normaliseExerciseName } from '@/types/progress'
import FocusOverlay from './FocusOverlay'
import WorkoutSession, { lastTimeText, newClientId } from './WorkoutSession'

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

export default function WorkoutDetail({ program, lastWeights }: Props) {
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

  const inSession = sessionStarted && exercises.length > 0
  const totalSets = exercises.reduce((n, ex) => n + Math.max(getExerciseSets(ex).length, 1), 0)

  return (
    <div>
      {/* Day strip: today preselected */}
      {activeDays.length > 0 && (
        <div className="rail mb-4" role="tablist" aria-label="Workout day">
          {activeDays.map(day => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={activeDay === day}
              onClick={() => { setActiveDay(day); setSelfLog('idle'); selfClientId.current = null }}
              className={cn(
                'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full text-xs font-bold transition-colors active:scale-95',
                activeDay === day ? 'bg-brand-500 text-white' : 'bg-surface-secondary text-slate-600',
                day === TODAY_KEY && activeDay !== day && 'ring-2 ring-brand-200',
              )}
            >
              {day}
              {day === TODAY_KEY && <span className="text-[9px] font-semibold opacity-80">Today</span>}
            </button>
          ))}
        </div>
      )}

      {/* Day summary, then the exercise list for the selected day */}
      {exercises.length === 0 ? (
        <div className="tile flex flex-col items-center py-10 text-center">
          <Dumbbell className="mb-2 h-8 w-8 text-slate-200" />
          <p className="text-sm font-bold text-slate-600">Rest Day</p>
          <p className="mt-1 text-xs text-slate-400">No exercises scheduled for {activeDay}.</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-slate-500">
            {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} · {totalSets} sets
          </p>

          {/* Keyed by day so the tiles re-enter when the day chip changes */}
          <Stagger key={activeDay} className="mb-5 space-y-3">
            {exercises.map((ex, idx) => {
              const sets = getExerciseSets(ex)
              const reps = [...new Set(sets.map(s => s.reps).filter(Boolean))].join(' / ')
              const last = lastTimeText(lastWeights[normaliseExerciseName(ex.name)])
              return (
                <StaggerItem key={ex.id}>
                  <div className="tile flex items-center gap-3 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-xs font-bold text-brand-600">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{ex.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {sets.length > 0 ? `${sets.length} x ${reps || '-'}` : ex.target}
                        {last && <span className="text-slate-400"> · Last {last}</span>}
                      </p>
                      {ex.notes && <p className="mt-1 text-[11px] italic text-slate-400">{ex.notes}</p>}
                    </div>
                  </div>
                </StaggerItem>
              )
            })}
          </Stagger>

          {/* Sticky so it stays reachable on long days; offset clears the floating bottom nav */}
          <div className="sticky bottom-[calc(var(--bottom-nav-height)+0.75rem+var(--pwa-safe-bottom)+0.75rem)] z-10">
            <button
              type="button"
              onClick={() => setSessionStarted(true)}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-brand-500 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition-transform active:scale-[0.97] hover:bg-brand-600"
            >
              <Play className="h-5 w-5" fill="currentColor" />
              Start workout
            </button>
          </div>

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
            <div className="tile mt-3 p-4">
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
                  className="min-h-[44px] rounded-full bg-slate-100 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selfLog === 'saving'}
                  onClick={() => void markDoneByMyself()}
                  className="min-h-[44px] rounded-full bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
                >
                  {selfLog === 'saving' ? 'Saving…' : 'Mark done'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Live session: full-screen focus mode over the whole shell */}
      {inSession && (
        <FocusOverlay>
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
        </FocusOverlay>
      )}
    </div>
  )
}
