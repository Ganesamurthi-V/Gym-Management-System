'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Trash2 } from 'lucide-react'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { WeightChart } from '@/components/member/WeightChart'
import { fmtNum, longDate } from '@/lib/progress/chart'
import type { BodyLog } from '@/types/progress'

const MEASURES = [
  { key: 'waist_cm', label: 'Waist' },
  { key: 'chest_cm', label: 'Chest' },
  { key: 'hips_cm', label: 'Hips' },
  { key: 'arm_cm', label: 'Arm' },
  { key: 'thigh_cm', label: 'Thigh' },
] as const

type Draft = Record<'weight_kg' | (typeof MEASURES)[number]['key'], string>
const EMPTY: Draft = { weight_kg: '', waist_cm: '', chest_cm: '', hips_cm: '', arm_cm: '', thigh_cm: '' }

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

export function BodyClient({ logs, today }: { logs: BodyLog[]; today: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const set = (key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const body: Record<string, unknown> = { logged_on: date }
    for (const [k, v] of Object.entries(draft)) {
      if (v.trim() !== '') body[k] = Number(v)
    }
    if (Object.keys(body).length === 1) {
      setError('Enter your weight or a measurement.')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/member/body-logs', body)
      setDraft(EMPTY)
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof GymFlowAPIError ? err.message : 'Could not save. Try again.')
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
      router.refresh()
    } catch (err) {
      setError(err instanceof GymFlowAPIError ? err.message : 'Could not delete. Try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <section className="card mb-4 p-4">
        <WeightChart logs={logs} />
      </section>

      <form onSubmit={save} className="card mb-5 p-4" noValidate>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Weight (kg)</span>
          <input
            type="number" inputMode="decimal" step="0.1" min="20" max="300"
            value={draft.weight_kg} onChange={(e) => set('weight_kg', e.target.value)}
            placeholder="e.g. 72.4"
            className="input-field mt-1 min-h-[44px] w-full text-lg font-bold"
          />
        </label>

        <details className="group mt-3">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-600">
            More measurements
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid grid-cols-2 gap-3 pb-1">
            {MEASURES.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="text-xs font-semibold text-slate-500">{label} (cm)</span>
                <input
                  type="number" inputMode="decimal" step="0.1" min="10" max="250"
                  value={draft[key]} onChange={(e) => set(key, e.target.value)}
                  className="input-field mt-1 min-h-[44px] w-full"
                />
              </label>
            ))}
          </div>
        </details>

        <label className="mt-3 block">
          <span className="text-xs font-semibold text-slate-500">Date</span>
          <input
            type="date" value={date} min={yearAgo(today)} max={today}
            onChange={(e) => setDate(e.target.value || today)}
            className="input-field mt-1 min-h-[44px] w-full"
          />
        </label>

        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        {saved && <p role="status" className="mt-3 text-sm font-semibold text-emerald-600">Saved</p>}

        <button type="submit" disabled={saving} className="btn-primary mt-4 min-h-[44px] w-full">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Entries</h2>
      {logs.length === 0 ? (
        <p className="card p-4 text-sm text-slate-500">No entries yet.</p>
      ) : (
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
      )}
    </>
  )
}
