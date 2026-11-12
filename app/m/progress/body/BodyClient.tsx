'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { WeightChart } from '@/components/member/WeightChart'
import { dayNumber, fmtNum, longDate, mediumDate, shortDate } from '@/lib/progress/chart'
import {
  BMI_WARNING_TEXT, NOT_MEDICAL_TEXT, TARGET_MAX_DAYS, addDaysIso, adviceFor, buildPlan, buildStructuredPlan, planMessage,
  verdictTone,
} from '@/lib/progress/plan'
import { bmi, bmiCategory, buildReport, measurementsDue, weighInDue, type Tone } from '@/lib/progress/report'
import { cn } from '@/lib/utils'
import { CountUp, FadeIn, Sheet, Stagger, StaggerItem } from '@/components/ui/motion'
import { MemberTopBar } from '@/components/member/MemberTopBar'
import type { BodyGoal, BodyLog, BodyProfile } from '@/types/progress'

const GOALS: { value: BodyGoal; label: string }[] = [
  { value: 'lose_fat', label: 'Lose fat' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'gain_weight', label: 'Gain weight' },
  { value: 'stay_fit', label: 'Stay fit' },
]

const TAPE = [
  { key: 'waist_cm', label: 'Waist', help: 'At the navel, relaxed, after breathing out' },
  { key: 'hips_cm', label: 'Hips', help: 'Around the widest part of the hips' },
  { key: 'chest_cm', label: 'Chest', help: 'Around the fullest part, under the arms' },
  { key: 'arm_cm', label: 'Upper arm', help: 'Midway between shoulder and elbow, relaxed' },
  { key: 'thigh_cm', label: 'Thigh', help: 'Around the upper thigh, just below the hip crease' },
] as const

type TapeKey = (typeof TAPE)[number]['key']
type Tape = Record<TapeKey, string>
const EMPTY_TAPE: Tape = { waist_cm: '', hips_cm: '', chest_cm: '', arm_cm: '', thigh_cm: '' }

const TONE_CLASS: Record<Tone, string> = {
  good: 'text-emerald-600',
  bad: 'text-amber-600',
  neutral: 'text-slate-500',
}

function yearAgo(today: string): string {
  return `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`
}

function measurementText(l: BodyLog): string {
  const parts: string[] = []
  if (l.waistCm != null) parts.push(`Waist ${fmtNum(l.waistCm)}`)
  if (l.chestCm != null) parts.push(`Chest ${fmtNum(l.chestCm)}`)
  if (l.hipsCm != null) parts.push(`Hips ${fmtNum(l.hipsCm)}`)
  if (l.armCm != null) parts.push(`Arm ${fmtNum(l.armCm)}`)
  if (l.thighCm != null) parts.push(`Thigh ${fmtNum(l.thighCm)}`)
  return parts.length ? `${parts.join(' · ')} cm` : ''
}

/** Only the tape fields the member filled in, as numbers. */
function tapeBody(t: Tape): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(t)) if (v.trim() !== '') out[k] = Number(v)
  return out
}

function errText(err: unknown, fallback: string): string {
  return err instanceof GymFlowAPIError ? err.message : fallback
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
      {help && <span className="mt-0.5 block text-xs text-slate-400">{help}</span>}
    </label>
  )
}

const numberInput = 'input-field mt-1 min-h-[44px] w-full rounded-2xl bg-surface-secondary'

function TapeFields({ value, onChange }: { value: Tape; onChange: (key: TapeKey, v: string) => void }) {
  return (
    <div className="space-y-3">
      {TAPE.map(({ key, label, help }) => (
        <Field key={key} label={`${label} (cm)`} help={help}>
          <input
            type="number" inputMode="decimal" step="0.1" min="10" max="250"
            value={value[key]} onChange={(e) => onChange(key, e.target.value)}
            className={numberInput}
          />
        </Field>
      ))}
    </div>
  )
}

function GoalPicker({ value, onChange }: { value: BodyGoal | null; onChange: (g: BodyGoal) => void }) {
  return (
    <div role="radiogroup" aria-label="Goal" className="grid grid-cols-2 gap-2">
      {GOALS.map((g) => (
        <button
          key={g.value} type="button" role="radio" aria-checked={value === g.value}
          onClick={() => onChange(g.value)}
          className={cn(
            'min-h-[44px] rounded-full border px-3 text-sm font-semibold',
            value === g.value
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-surface-border bg-surface-card text-slate-600',
          )}
        >
          {g.label}
        </button>
      ))}
    </div>
  )
}

const VERDICT_CLASS = { warn: 'text-amber-600', good: 'text-emerald-600', neutral: 'text-slate-500' } as const

interface PlanBasis { heightCm: number; startWeightKg: number; startDate: string; currentWeightKg: number }

const TARGET_MIN_DAYS = 7
const DAY_CHIPS = [30, 60, 90, 180]

/** The typed day count as an integer within range, else null. */
function parseDays(days: string): number | null {
  const n = Number(days)
  return days.trim() !== '' && Number.isInteger(n) && n >= TARGET_MIN_DAYS && n <= TARGET_MAX_DAYS ? n : null
}

/** Target weight and days to reach it, with a live one-line plan check. Hidden for "Stay fit" (no pace to check). */
function TargetFields(props: {
  goal: BodyGoal | null; today: string; basis: PlanBasis; editing?: boolean; passed?: boolean
  weight: string; days: string; onWeight: (v: string) => void; onDays: (v: string) => void
}) {
  const { goal, today, basis, weight, days, onWeight, onDays, editing, passed } = props
  if (!goal || goal === 'stay_fit') return null
  const tw = Number(weight)
  const n = parseDays(days)
  const ready = weight.trim() !== '' && tw > 0 && n != null && basis.startWeightKg > 0 && basis.currentWeightKg > 0
  const plan = ready ? buildPlan({ goal, ...basis, targetWeightKg: tw, targetDate: addDaysIso(today, n) }, today) : null
  return (
    <div className="space-y-3">
      <Field label="Target weight (kg)">
        <input
          type="number" inputMode="decimal" step="0.1" min="20" max="300"
          value={weight} onChange={(e) => onWeight(e.target.value)} className={numberInput}
        />
      </Field>
      <Field
        label={editing ? 'Days left to reach your goal' : 'Days to reach your goal'}
        help={passed && days === '' ? 'Your target date has passed. Set new days.' : `${TARGET_MIN_DAYS} to ${TARGET_MAX_DAYS} days`}
      >
        <input
          type="number" inputMode="numeric" step="1" min={TARGET_MIN_DAYS} max={TARGET_MAX_DAYS}
          value={days} onChange={(e) => onDays(e.target.value)} className={numberInput}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {DAY_CHIPS.map((d) => (
          <button
            key={d} type="button" onClick={() => onDays(String(d))}
            className={cn(
              'min-h-[44px] rounded-full border px-4 text-sm font-semibold',
              days === String(d) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-surface-card text-slate-600',
            )}
          >
            {d} days
          </button>
        ))}
      </div>
      {plan && (
        <p className={cn('text-sm font-semibold', VERDICT_CLASS[verdictTone(plan.verdict)])}>
          {planMessage(plan, goal)}
          {plan.bmiWarning && <span className="mt-1 block text-amber-600">{BMI_WARNING_TEXT}</span>}
        </p>
      )}
    </div>
  )
}

/** Both target fields or neither; returns the request fields, or an error text. */
function targetBody(goal: BodyGoal, weight: string, days: string, today: string): { fields: Record<string, unknown> } | { error: string } {
  if (goal === 'stay_fit' || (weight.trim() === '' && days.trim() === '')) return { fields: {} }
  if (weight.trim() === '' || days.trim() === '') return { error: 'Enter both a target weight and the days to reach it, or leave both empty.' }
  const n = parseDays(days)
  if (n == null) return { error: `Days must be a whole number from ${TARGET_MIN_DAYS} to ${TARGET_MAX_DAYS}.` }
  return { fields: { target_weight_kg: Number(weight), target_date: addDaysIso(today, n) } }
}

/** The first-time form: height, goal, weight and tape measurements, saved once as the baseline. */
function Baseline({ profile, today, onSaved }: { profile: BodyProfile | null; today: string; onSaved: () => void }) {
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : '')
  const [goal, setGoal] = useState<BodyGoal | null>(profile?.goal ?? null)
  const [weight, setWeight] = useState('')
  const [targetWeight, setTargetWeight] = useState('')
  const [targetDays, setTargetDays] = useState('')
  const [tape, setTape] = useState<Tape>(EMPTY_TAPE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (height.trim() === '' || !goal || weight.trim() === '') {
      setError('Enter your height, choose a goal and enter your weight.')
      return
    }
    const target = targetBody(goal, targetWeight, targetDays, today)
    if ('error' in target) {
      setError(target.error)
      return
    }
    setSaving(true)
    try {
      // Profile first: if the log fails, a retry simply saves the same profile again.
      await api.post('/api/member/body-profile', { height_cm: Number(height), goal, ...target.fields })
      await api.post('/api/member/body-logs', { logged_on: today, weight_kg: Number(weight), ...tapeBody(tape) })
      onSaved()
    } catch (err) {
      setError(errText(err, 'Could not save. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="tile mb-5 space-y-4 p-4" noValidate>
      <div>
        <h2 className="text-base font-bold text-slate-900">Your starting point</h2>
        <p className="mt-0.5 text-sm text-slate-500">Measure in the morning, same way each time.</p>
      </div>
      <Field label="Height (cm)">
        <input
          type="number" inputMode="decimal" step="0.1" min="100" max="230"
          value={height} onChange={(e) => setHeight(e.target.value)} className={numberInput}
        />
      </Field>
      <div>
        <span className="text-xs font-semibold text-slate-500">Goal</span>
        <div className="mt-1"><GoalPicker value={goal} onChange={setGoal} /></div>
      </div>
      <Field label="Weight (kg)">
        <input
          type="number" inputMode="decimal" step="0.1" min="20" max="300"
          value={weight} onChange={(e) => setWeight(e.target.value)} className={numberInput}
        />
      </Field>
      <TargetFields
        goal={goal} today={today}
        basis={{ heightCm: Number(height), startWeightKg: Number(weight), startDate: today, currentWeightKg: Number(weight) }}
        weight={targetWeight} days={targetDays} onWeight={setTargetWeight} onDays={setTargetDays}
      />
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Tape measurements (optional)</h3>
        <TapeFields value={tape} onChange={(k, v) => setTape((t) => ({ ...t, [k]: v }))} />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary min-h-[44px] rounded-full w-full">
        {saving ? 'Saving…' : 'Save my starting point'}
      </button>
    </form>
  )
}

const GOAL_LABEL: Record<BodyGoal, string> = {
  lose_fat: 'Lose fat', build_muscle: 'Build muscle', gain_weight: 'Gain weight', stay_fit: 'Stay fit',
}

const TRACK_TEXT = { ahead: 'You are ahead of plan', on_track: 'You are on track', behind: 'You are a little behind' } as const

/** Goal, target, progress bar and advice. Sits above the report. */
function GoalCard({ logs, profile, today, onSetTarget }: {
  logs: BodyLog[]; profile: BodyProfile; today: string; onSetTarget: () => void
}) {
  const weighed = logs.filter((l) => l.weightKg != null)
  const first = weighed[weighed.length - 1]
  const current = weighed[0]?.weightKg ?? null
  const hasTarget = profile.targetWeightKg != null && profile.targetDate != null
  const plan = hasTarget && first && current != null
    ? buildPlan({
        goal: profile.goal, heightCm: profile.heightCm, startWeightKg: first.weightKg as number,
        startDate: first.loggedOn, currentWeightKg: current,
        targetWeightKg: profile.targetWeightKg as number, targetDate: profile.targetDate as string,
      }, today)
    : null
  const tips = adviceFor(profile.goal, current ?? first?.weightKg ?? 60)
  const showStatus = plan && (plan.verdict === 'safe' || plan.verdict === 'too_fast' || plan.verdict === 'very_slow')

  return (
    <section className="tile mb-4 p-4">
      <h2 className="text-base font-bold text-slate-900">Your goal: {GOAL_LABEL[profile.goal]}</h2>
      {profile.goal !== 'stay_fit' && !hasTarget && (
        <button
          type="button" onClick={onSetTarget}
          className="mt-1 min-h-[44px] text-left text-sm font-semibold text-brand-600"
        >
          Set a target weight and days
        </button>
      )}
      {hasTarget && current != null && (
        <p className="mt-1 text-sm text-slate-700">
          {fmtNum(current)} kg to {fmtNum(profile.targetWeightKg as number)} kg by {mediumDate(profile.targetDate as string)}
          {plan && plan.daysLeft > 0 && (
            <span className="text-slate-500"> · {plan.daysLeft} {plan.daysLeft === 1 ? 'day' : 'days'} left</span>
          )}
        </p>
      )}
      {plan && (
        <>
          <div
            role="progressbar" aria-label="Progress to target" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={plan.percentComplete}
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-secondary"
          >
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${plan.percentComplete}%` }} />
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{plan.percentComplete}% of the way</p>
          {showStatus && (
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {TRACK_TEXT[plan.trackStatus]}. Expected today: {fmtNum(plan.expectedWeightToday)} kg.
            </p>
          )}
          <p className={cn('mt-1 text-sm font-semibold', VERDICT_CLASS[verdictTone(plan.verdict)])}>
            {planMessage(plan, profile.goal)}
          </p>
          {plan.bmiWarning && <p className="mt-1 text-sm font-semibold text-amber-600">{BMI_WARNING_TEXT}</p>}
        </>
      )}
      {(hasTarget || profile.goal === 'stay_fit') && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-400">{NOT_MEDICAL_TEXT}</p>
    </section>
  )
}

/** Milestones, weekly template and eating lines. Native details, closed by default. */
function PlanCard({ logs, profile, today }: { logs: BodyLog[]; profile: BodyProfile; today: string }) {
  const weighed = logs.filter((l) => l.weightKg != null)
  const first = weighed[weighed.length - 1]
  const current = weighed[0]?.weightKg ?? null
  const stayFit = profile.goal === 'stay_fit'
  const hasTarget = profile.targetWeightKg != null && profile.targetDate != null
  if (!first || current == null || (!stayFit && !hasTarget)) return null
  const plan = buildStructuredPlan({
    goal: profile.goal, heightCm: profile.heightCm, startWeightKg: first.weightKg as number, startDate: first.loggedOn,
    currentWeightKg: current, targetWeightKg: profile.targetWeightKg ?? current, targetDate: profile.targetDate ?? today,
  }, today)
  const sign = (profile.targetWeightKg ?? current) >= current ? 1 : -1
  const heading = 'text-xs font-bold uppercase tracking-widest text-slate-400'
  return (
    <details className="tile mb-4 p-4">
      <summary className="min-h-[44px] cursor-pointer text-base font-bold text-slate-900">Your plan</summary>
      {plan.milestones.length > 0 && (
        <>
          <h3 className={cn(heading, 'mt-2')}>Milestones</h3>
          <ol className="mt-2 space-y-2 border-l border-surface-border pl-4">
            {plan.milestones.map((m) => {
              const reached = (current - m.expectedWeightKg) * sign >= 0
              return (
                <li key={m.date} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">Week {m.week} · {mediumDate(m.date)}</span>
                  <span className="flex items-center gap-1 font-bold text-slate-900">
                    {fmtNum(m.expectedWeightKg)} kg
                    {reached && <Check className="h-4 w-4 text-emerald-600" aria-label="Reached" />}
                  </span>
                </li>
              )
            })}
          </ol>
          {plan.checkpointsToday && (
            <p className="mt-2 text-sm text-slate-600">
              Next: {mediumDate(plan.checkpointsToday.milestone.date)}, {fmtNum(plan.checkpointsToday.milestone.expectedWeightKg)} kg.
              You are {fmtNum(Math.abs(plan.checkpointsToday.diffKg))} kg {plan.checkpointsToday.diffKg * sign >= 0 ? 'ahead of' : 'behind'} it.
            </p>
          )}
        </>
      )}
      <h3 className={cn(heading, 'mt-4')}>Every week</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {plan.weekly.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <h3 className={cn(heading, 'mt-4')}>Eating</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {plan.nutrition.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </details>
  )
}

const RAIL_METRICS = [
  { key: 'weight', label: 'Weight' },
  { key: 'bmi', label: 'BMI' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
] as const

/** Weight, BMI, waist and hips as a swipeable rail; ~140px cards so a third one peeks in and signals scroll. */
function MetricRail({ logs, profile }: { logs: BodyLog[]; profile: BodyProfile }) {
  const report = buildReport(logs, profile)
  return (
    <div className="rail mb-4">
      {RAIL_METRICS.map(({ key, label }) => {
        const row = report.rows.find((r) => r.key === key)
        const latest = row?.latest ?? null
        const unit = row?.unit ?? ''
        let note = 'Not logged yet'
        if (row && latest != null) {
          note = row.change == null || row.change === 0
            ? 'Latest'
            : `${row.change < 0 ? 'Down' : 'Up'} ${fmtNum(Math.abs(row.change))}${unit === '' ? '' : ` ${unit}`} since start`
        }
        return (
          <div key={key} className="tile w-[140px] p-4">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black leading-none tracking-tight text-slate-900">
              {latest != null
                ? <><CountUp value={latest} decimals={Number.isInteger(Math.round(latest * 10) / 10) ? 0 : 1} />{unit !== '' && <span className="ml-1 text-xs font-bold text-slate-500">{unit}</span>}</>
                : '-'}
            </p>
            <p className={cn('mt-2 text-xs font-semibold', TONE_CLASS[row?.tone ?? 'neutral'])}>{note}</p>
          </div>
        )
      })}
    </div>
  )
}

/** Latest weight as the page headline, with the change since the first weigh-in under it. */
function Headline({ logs }: { logs: BodyLog[] }) {
  // Newest first: latest weight is the first with a weight, the first entry the last.
  const weighed = logs.filter((l) => l.weightKg != null)
  if (weighed.length === 0) return <p className="text-lg font-bold text-slate-900">Log your first weight</p>
  const newest = weighed[0]
  const oldest = weighed[weighed.length - 1]
  let change: string | null = null
  if (weighed.length > 1) {
    const diff = Math.round(((newest.weightKg as number) - (oldest.weightKg as number)) * 10) / 10
    const dir = diff === 0 ? 'No change' : `${diff < 0 ? 'Down' : 'Up'} ${fmtNum(Math.abs(diff))} kg`
    change = `${dir} since ${shortDate(oldest.loggedOn)}`
  }
  return (
    <>
      <p className="text-5xl font-black leading-none tracking-tight text-slate-900">
        {fmtNum(newest.weightKg as number)}<span className="ml-1.5 text-xl font-bold text-slate-500">kg</span>
      </p>
      {change && <p className="mt-2 text-sm font-semibold text-slate-500">{change}</p>}
    </>
  )
}

function ReportCard({ logs, profile }: { logs: BodyLog[]; profile: BodyProfile }) {
  const report = buildReport(logs, profile)
  const rows = report.rows.filter((r) => r.latest != null)
  const bmiRow = report.rows.find((r) => r.key === 'bmi')
  const latestBmi = bmiRow?.latest ?? null
  const fmt = (n: number | null) => (n == null ? '-' : fmtNum(n))
  return (
    <section className="tile mb-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">Your report</h2>
        {latestBmi != null && (
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-bold text-slate-700">
            BMI {fmtNum(latestBmi)} · {bmiCategory(latestBmi)}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 gap-y-2 text-sm">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Metric</span>
        <span className="text-right text-xs font-bold uppercase tracking-widest text-slate-400">Start</span>
        <span className="text-right text-xs font-bold uppercase tracking-widest text-slate-400">Now</span>
        <span className="text-right text-xs font-bold uppercase tracking-widest text-slate-400">Change</span>
        {rows.map((r) => (
          <div key={r.key} className="contents">
            <span className="font-semibold text-slate-700">{r.label}{r.unit && <span className="text-slate-400"> {r.unit}</span>}</span>
            <span className="text-right text-slate-500">{fmt(r.start)}</span>
            <span className="text-right font-bold text-slate-900">{fmt(r.latest)}</span>
            <span className={cn('text-right font-bold', TONE_CLASS[r.tone])}>
              {r.change == null ? '-' : `${r.change > 0 ? '+' : ''}${fmtNum(r.change)}`}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">For tracking only, not medical advice.</p>
    </section>
  )
}

function EditProfile({ profile, basis, today, open, setOpen, onDone }: {
  profile: BodyProfile; basis: Omit<PlanBasis, 'heightCm'>; today: string
  open: boolean; setOpen: (v: boolean) => void; onDone: () => void
}) {
  const [height, setHeight] = useState(String(profile.heightCm))
  const [goal, setGoal] = useState<BodyGoal>(profile.goal)
  const [targetWeight, setTargetWeight] = useState(profile.targetWeightKg != null ? String(profile.targetWeightKg) : '')
  const left = profile.targetDate != null ? dayNumber(profile.targetDate) - dayNumber(today) : null
  const passed = left != null && left < 1
  const [targetDays, setTargetDays] = useState(left != null && left >= 1 ? String(left) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const target = targetBody(goal, targetWeight, targetDays, today)
    if ('error' in target) {
      setError(target.error)
      return
    }
    setSaving(true)
    try {
      await api.post('/api/member/body-profile', { height_cm: Number(height), goal, ...target.fields })
      setOpen(false)
      onDone()
    } catch (err) {
      setError(errText(err, 'Could not save. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Body profile" description="Height, goal and target weight">
      <form onSubmit={save} className="space-y-4 pt-2" noValidate>
        <Field label="Height (cm)">
          <input
            type="number" inputMode="decimal" step="0.1" min="100" max="230"
            value={height} onChange={(e) => setHeight(e.target.value)} className={numberInput}
          />
        </Field>
        <div>
          <span className="text-xs font-semibold text-slate-500">Goal</span>
          <div className="mt-1"><GoalPicker value={goal} onChange={setGoal} /></div>
        </div>
        <TargetFields
          goal={goal} today={today} basis={{ ...basis, heightCm: Number(height) }}
          editing passed={passed}
          weight={targetWeight} days={targetDays} onWeight={setTargetWeight} onDays={setTargetDays}
        />
        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary min-h-[44px] rounded-full flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary min-h-[44px] rounded-full flex-1">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Sheet>
  )
}

export function BodyClient({ logs, profile, today, memberName }: {
  logs: BodyLog[]; profile: BodyProfile | null; today: string; memberName: string
}) {
  const router = useRouter()
  const [weight, setWeight] = useState('')
  const [tape, setTape] = useState<Tape>(EMPTY_TAPE)
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'weight' | 'details'>('weight')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const refresh = () => router.refresh()

  if (!profile || logs.length === 0) {
    return (
      <>
        <MemberTopBar variant="root" title="Progress" memberName={memberName} />
        <div className="page-container py-4">
          <Baseline profile={profile} today={today} onSaved={refresh} />
        </div>
      </>
    )
  }

  const monthlyDue = measurementsDue(logs, today)
  const weighDue = weighInDue(logs, today)
  const latestWeight = logs.find((l) => l.weightKg != null)?.weightKg ?? null
  const firstWeighed = logs.filter((l) => l.weightKg != null).pop()
  const previewBmi = weight.trim() !== '' && Number(weight) > 0 ? bmi(Number(weight), profile.heightCm) : null

  const setTapeField = (k: TapeKey, v: string) => {
    setTape((t) => ({ ...t, [k]: v }))
    setSaved(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const body: Record<string, unknown> = { logged_on: date, ...tapeBody(tape) }
    if (weight.trim() !== '') body.weight_kg = Number(weight)
    if (Object.keys(body).length === 1) {
      setError('Enter your weight or a measurement.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/member/body-logs', body)
      setWeight('')
      setTape(EMPTY_TAPE)
      setSaved(true)
      setLogOpen(false)
      refresh()
    } catch (err) {
      setError(errText(err, 'Could not save. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(l: BodyLog) {
    if (!window.confirm(`Delete the entry for ${longDate(l.loggedOn)}?`)) return
    setError(null)
    setDeletingId(l.id)
    try {
      await api.delete(`/api/member/body-logs/${l.id}`)
      refresh()
    } catch (err) {
      setError(errText(err, 'Could not delete. Try again.'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <MemberTopBar
        variant="root" title="Progress" memberName={memberName}
        actions={
          <button
            type="button" onClick={() => setEditOpen(true)} aria-label="Edit body profile"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-slate-700"
          >
            <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />
          </button>
        }
      />

      {/* Bottom padding clears the floating Log button and the bottom nav. */}
      <div className="page-container pb-40 pt-4">
        <FadeIn>
          <section className="mb-4"><Headline logs={logs} /></section>
        </FadeIn>

        <FadeIn delay={40}>
          <section className="tile mb-4 p-4">
            <WeightChart logs={logs} />
          </section>
        </FadeIn>

        <MetricRail logs={logs} profile={profile} />

        <GoalCard logs={logs} profile={profile} today={today} onSetTarget={() => setEditOpen(true)} />

        <PlanCard logs={logs} profile={profile} today={today} />

        <ReportCard logs={logs} profile={profile} />

        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Entries</h2>
        <Stagger className="space-y-2">
          {logs.map((l) => {
            const extra = measurementText(l)
            return (
              <StaggerItem key={l.id} className="tile flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {l.weightKg != null ? `${fmtNum(l.weightKg)} kg` : 'Measurements'}
                    <span className="ml-2 text-xs font-semibold text-slate-400">{longDate(l.loggedOn)}</span>
                  </p>
                  {extra && <p className="mt-0.5 text-xs text-slate-500">{extra}</p>}
                </div>
                <button
                  type="button" onClick={() => remove(l)} disabled={deletingId === l.id}
                  aria-label={`Delete entry for ${longDate(l.loggedOn)}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </StaggerItem>
            )
          })}
        </Stagger>
      </div>

      <div className="pointer-events-none fixed inset-x-0 z-40" style={{ bottom: 'calc(var(--bottom-nav-height) + var(--pwa-safe-bottom) + 1.5rem)' }}>
        <div className="mx-auto flex max-w-lg justify-end px-4 xs:px-5 sm:px-6">
          <button
            type="button" onClick={() => { setSaved(false); setLogOpen(true) }}
            className="pointer-events-auto inline-flex min-h-[48px] items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-bold text-white shadow-lg"
          >
            <Plus aria-hidden="true" className="h-5 w-5" /> Log
          </button>
        </div>
      </div>

      <Sheet open={logOpen} onOpenChange={setLogOpen} title="Weekly weigh-in">
        <form onSubmit={save} className="space-y-4 pt-2" noValidate>
          {weighDue && <p className="text-sm font-semibold text-brand-600">Time for your weekly weigh-in</p>}
          <div role="tablist" aria-label="What to update" className="grid grid-cols-2 gap-1 rounded-full bg-surface-secondary p-1">
            {([['weight', 'Weight'], ['details', 'More details']] as const).map(([key, label]) => (
              <button
                key={key} type="button" role="tab" aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'relative min-h-[44px] rounded-full text-sm font-bold transition-colors',
                  tab === key ? 'bg-surface-card text-slate-900 shadow-sm' : 'text-slate-500',
                )}
              >
                {label}
                {key === 'details' && monthlyDue && tab !== 'details' && (
                  <span aria-label="Due this month" className="absolute right-3 top-2.5 h-2 w-2 rounded-full bg-brand-500" />
                )}
              </button>
            ))}
          </div>

          {tab === 'weight' ? (
            <>
              <Field label="Weight (kg)">
                <input
                  type="number" inputMode="decimal" step="0.1" min="20" max="300"
                  value={weight} onChange={(e) => { setWeight(e.target.value); setSaved(false) }}
                  placeholder={latestWeight != null ? `Last: ${fmtNum(latestWeight)}` : undefined}
                  className={cn(numberInput, 'text-lg font-bold')}
                />
                {previewBmi != null && (
                  <span className="mt-0.5 block text-xs text-slate-500">BMI {fmtNum(previewBmi)} · {bmiCategory(previewBmi)}</span>
                )}
              </Field>
              {monthlyDue && (
                <button
                  type="button" onClick={() => setTab('details')}
                  className="min-h-[44px] w-full rounded-2xl border border-brand-500 bg-brand-50 px-3 text-left text-sm font-semibold text-brand-700"
                >
                  Monthly check-in is due. Add your measurements
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {monthlyDue ? 'Monthly check-in: ' : ''}Same time of day, same way each time. Fill in only what you measured.
              </p>
              <TapeFields value={tape} onChange={setTapeField} />
            </div>
          )}

          <Field label="Date">
            <input
              type="date" value={date} min={yearAgo(today)} max={today}
              onChange={(e) => setDate(e.target.value || today)}
              className={numberInput}
            />
          </Field>

          {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
          {saved && <p role="status" className="text-sm font-semibold text-emerald-600">Saved</p>}

          <button type="submit" disabled={saving} className="btn-primary min-h-[44px] rounded-full w-full">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </Sheet>

      <EditProfile
        key={`${profile.heightCm}-${profile.goal}-${profile.targetWeightKg}-${profile.targetDate}`}
        profile={profile} today={today} open={editOpen} setOpen={setEditOpen} onDone={refresh}
        basis={{
          startWeightKg: firstWeighed?.weightKg ?? 0, startDate: firstWeighed?.loggedOn ?? today,
          currentWeightKg: latestWeight ?? 0,
        }}
      />
    </>
  )
}
