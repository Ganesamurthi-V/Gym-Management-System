'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { WeightChart } from '@/components/member/WeightChart'
import { fmtNum, longDate, mediumDate } from '@/lib/progress/chart'
import {
  BMI_WARNING_TEXT, NOT_MEDICAL_TEXT, TARGET_MAX_DAYS, addDays, adviceFor, buildPlan, planMessage, verdictTone,
} from '@/lib/progress/plan'
import { bmi, bmiCategory, buildReport, measurementsDue, weighInDue, type Tone } from '@/lib/progress/report'
import { cn } from '@/lib/utils'
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

const numberInput = 'input-field mt-1 min-h-[44px] w-full'

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
            'min-h-[44px] rounded-xl border px-3 text-sm font-semibold',
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

/** Target weight and date, with a live one-line plan check. Hidden for "Stay fit" (no pace to check). */
function TargetFields(props: {
  goal: BodyGoal | null; today: string; basis: PlanBasis
  weight: string; date: string; onWeight: (v: string) => void; onDate: (v: string) => void
}) {
  const { goal, today, basis, weight, date, onWeight, onDate } = props
  if (!goal || goal === 'stay_fit') return null
  const tw = Number(weight)
  const ready = weight.trim() !== '' && tw > 0 && date !== '' && basis.startWeightKg > 0 && basis.currentWeightKg > 0
    && date > today && date <= addDays(today, TARGET_MAX_DAYS)
  const plan = ready ? buildPlan({ goal, ...basis, targetWeightKg: tw, targetDate: date }, today) : null
  return (
    <div className="space-y-3">
      <Field label="Target weight (kg)">
        <input
          type="number" inputMode="decimal" step="0.1" min="20" max="300"
          value={weight} onChange={(e) => onWeight(e.target.value)} className={numberInput}
        />
      </Field>
      <Field label="Target date">
        <input
          type="date" value={date} min={addDays(today, 1)} max={addDays(today, TARGET_MAX_DAYS)}
          onChange={(e) => onDate(e.target.value)} className={numberInput}
        />
      </Field>
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
function targetBody(goal: BodyGoal, weight: string, date: string): { fields: Record<string, unknown> } | { error: string } {
  if (goal === 'stay_fit' || (weight.trim() === '' && date === '')) return { fields: {} }
  if (weight.trim() === '' || date === '') return { error: 'Enter both a target weight and a target date, or leave both empty.' }
  return { fields: { target_weight_kg: Number(weight), target_date: date } }
}

/** The first-time form: height, goal, weight and tape measurements, saved once as the baseline. */
function Baseline({ profile, today, onSaved }: { profile: BodyProfile | null; today: string; onSaved: () => void }) {
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : '')
  const [goal, setGoal] = useState<BodyGoal | null>(profile?.goal ?? null)
  const [weight, setWeight] = useState('')
  const [targetWeight, setTargetWeight] = useState('')
  const [targetDate, setTargetDate] = useState('')
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
    const target = targetBody(goal, targetWeight, targetDate)
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
    <form onSubmit={save} className="card mb-5 space-y-4 p-4" noValidate>
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
        weight={targetWeight} date={targetDate} onWeight={setTargetWeight} onDate={setTargetDate}
      />
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Tape measurements (optional)</h3>
        <TapeFields value={tape} onChange={(k, v) => setTape((t) => ({ ...t, [k]: v }))} />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary min-h-[44px] w-full">
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
    <section className="card mb-4 p-4">
      <h2 className="text-base font-bold text-slate-900">Your goal: {GOAL_LABEL[profile.goal]}</h2>
      {profile.goal !== 'stay_fit' && !hasTarget && (
        <button
          type="button" onClick={onSetTarget}
          className="mt-1 min-h-[44px] text-left text-sm font-semibold text-brand-600"
        >
          Set a target weight and date
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

function ReportCard({ logs, profile }: { logs: BodyLog[]; profile: BodyProfile }) {
  const report = buildReport(logs, profile)
  const rows = report.rows.filter((r) => r.latest != null)
  const bmiRow = report.rows.find((r) => r.key === 'bmi')
  const latestBmi = bmiRow?.latest ?? null
  const fmt = (n: number | null) => (n == null ? '-' : fmtNum(n))
  return (
    <section className="card mb-4 p-4">
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
  const [targetDate, setTargetDate] = useState(profile.targetDate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const target = targetBody(goal, targetWeight, targetDate)
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

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="mb-5 min-h-[44px] text-sm font-semibold text-brand-600"
      >
        Edit height, goal or target
      </button>
    )
  }
  return (
    <form onSubmit={save} className="card mb-5 space-y-4 p-4" noValidate>
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
        weight={targetWeight} date={targetDate} onWeight={setTargetWeight} onDate={setTargetDate}
      />
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary min-h-[44px] flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary min-h-[44px] flex-1">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

export function BodyClient({ logs, profile, today }: { logs: BodyLog[]; profile: BodyProfile | null; today: string }) {
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

  const refresh = () => router.refresh()

  if (!profile || logs.length === 0) {
    return <Baseline profile={profile} today={today} onSaved={refresh} />
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
      <GoalCard logs={logs} profile={profile} today={today} onSetTarget={() => setEditOpen(true)} />

      <ReportCard logs={logs} profile={profile} />

      <section className="card mb-4 p-4">
        <WeightChart logs={logs} />
      </section>

      <form onSubmit={save} className="card mb-2 space-y-4 p-4" noValidate>
        <div>
          <h2 className="text-base font-bold text-slate-900">Weekly weigh-in</h2>
          {weighDue && <p className="mt-0.5 text-sm font-semibold text-brand-600">Time for your weekly weigh-in</p>}
        </div>
        <div role="tablist" aria-label="What to update" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {([['weight', 'Weight'], ['details', 'More details']] as const).map(([key, label]) => (
            <button
              key={key} type="button" role="tab" aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'relative min-h-[44px] rounded-lg text-sm font-bold transition-colors',
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
                className="min-h-[44px] w-full rounded-xl border border-brand-500 bg-brand-50 px-3 text-left text-sm font-semibold text-brand-700"
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

        <button type="submit" disabled={saving} className="btn-primary min-h-[44px] w-full">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <EditProfile
        key={`${profile.heightCm}-${profile.goal}-${profile.targetWeightKg}-${profile.targetDate}`}
        profile={profile} today={today} open={editOpen} setOpen={setEditOpen} onDone={refresh}
        basis={{
          startWeightKg: firstWeighed?.weightKg ?? 0, startDate: firstWeighed?.loggedOn ?? today,
          currentWeightKg: latestWeight ?? 0,
        }}
      />

      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Entries</h2>
      <ul className="space-y-2">
        {logs.map((l) => {
          const extra = measurementText(l)
          return (
            <li key={l.id} className="card flex items-center gap-3 p-3">
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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
