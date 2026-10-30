'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Pencil, Trash2, X, AlertTriangle, Check } from 'lucide-react'
import { api } from '@/lib/api/client'
import { cn, formatCurrency } from '@/lib/utils'
import {
  MAX_PLANS,
  duplicateKeys,
  normalizePlans,
  planGroupKey,
  type MembershipPlan,
  type PlanCategory,
  type PlanDuration,
} from '@/lib/plans/validate'

const GROUPS: { category: PlanCategory; label: string }[] = [
  { category: 'strength', label: 'Strength' },
  { category: 'cardio', label: 'Cardio' },
  { category: 'both', label: 'Strength + Cardio' },
]

function durationLabel(p: MembershipPlan): string {
  if (p.duration === 'monthly') return '1 month'
  if (p.duration === 'quarterly') return '3 months'
  if (p.duration === 'annual') return '12 months'
  return `${p.customDurationMonths ?? '?'} months (custom)`
}

interface Draft {
  planName: string
  category: PlanCategory
  duration: PlanDuration
  customMonths: string
  price: string
  joiningFee: string
  hasDiscount: boolean
  discountPercent: string
  hasFreezeOption: boolean
}

const EMPTY_DRAFT: Draft = {
  planName: '', category: 'both', duration: 'monthly', customMonths: '', price: '', joiningFee: '0',
  hasDiscount: false, discountPercent: '0', hasFreezeOption: false,
}

function toDraft(p: MembershipPlan): Draft {
  return {
    planName: p.planName, category: p.category, duration: p.duration,
    customMonths: p.duration === 'custom' ? String(p.customDurationMonths ?? '') : '',
    price: String(p.price), joiningFee: String(p.joiningFee),
    hasDiscount: p.hasDiscount, discountPercent: String(p.discountPercent), hasFreezeOption: p.hasFreezeOption,
  }
}

/** Returns the plan, or the first error text, using the same zod rules as the server. */
function draftToPlan(d: Draft): { plan: MembershipPlan } | { error: string } {
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
  const result = normalizePlans([{
    planName: d.planName,
    category: d.category,
    duration: d.duration,
    price: num(d.price),
    joiningFee: num(d.joiningFee),
    hasDiscount: d.hasDiscount,
    discountPercent: d.hasDiscount ? num(d.discountPercent) : 0,
    hasFreezeOption: d.hasFreezeOption,
    customDurationMonths: d.duration === 'custom' ? num(d.customMonths) : undefined,
  }])
  if (result.success) return { plan: result.data[0] }
  const issue = result.error.issues[0]
  const field = issue.path[1]
  const msgs: Record<string, string> = {
    price: 'Price must be a whole number from 0 to 10,00,000',
    joiningFee: 'Joining fee must be a whole number from 0 to 10,00,000',
    discountPercent: 'Discount must be a whole number from 0 to 100',
    customDurationMonths: 'Enter the length in months (1 to 24)',
  }
  return { error: (typeof field === 'string' && msgs[field]) || issue.message }
}

export function PlansClient({ plans: serverPlans, gymName, unreadable = 0 }: { plans: MembershipPlan[]; gymName: string; unreadable?: number }) {
  const router = useRouter()
  const [plans, setPlans] = useState(serverPlans)
  const [prevServer, setPrevServer] = useState(serverPlans)
  if (serverPlans !== prevServer) {
    setPrevServer(serverPlans)
    setPlans(serverPlans)
  }

  const [editing, setEditing] = useState<{ index: number | null; draft: Draft } | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')

  const dups = duplicateKeys(plans)

  async function persist(next: MembershipPlan[], message: string): Promise<boolean> {
    setSaving(true)
    setError('')
    setFormError('')
    setSuccess('')
    try {
      const res = await api.put<{ data: { plans: MembershipPlan[] } }>('/api/account/plans', { plans: next })
      setPlans(res.data.plans)
      setSuccess(message)
      router.refresh()
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'We could not save your plans. Please try again.'
      setError(msg)
      setFormError(msg)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function submitForm() {
    if (!editing) return
    const out = draftToPlan(editing.draft)
    if ('error' in out) { setFormError(out.error); return }
    if (editing.index === null && plans.length >= MAX_PLANS) { setFormError(`You can have at most ${MAX_PLANS} plans`); return }
    const next = editing.index === null
      ? [...plans, out.plan]
      : plans.map((p, i) => (i === editing.index ? out.plan : p))
    if (await persist(next, editing.index === null ? 'Plan added.' : 'Plan updated.')) setEditing(null)
  }

  async function confirmDelete() {
    if (deleting === null) return
    if (await persist(plans.filter((_, i) => i !== deleting), 'Plan deleted.')) setDeleting(null)
  }

  const openEditor = (index: number | null) => {
    setFormError(''); setError(''); setSuccess('')
    setEditing({ index, draft: index === null ? EMPTY_DRAFT : toDraft(plans[index]) })
  }

  return (
    <div className="space-y-4 md:space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/owner/members" className="inline-flex items-center gap-1 text-sm text-slate-500 min-h-[44px]">
            <ArrowLeft className="w-4 h-4" /> Members
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Plans</h1>
          <p className="text-sm text-slate-500 truncate">{gymName}</p>
        </div>
        <button
          type="button"
          onClick={() => openEditor(null)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-brand-500 text-white font-semibold disabled:opacity-60"
        >
          <Plus className="w-4 h-4" /> Add plan
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Changes apply to new sign-ups and renewals. Plans with custom length are not offered for online renewal in the member app.
      </p>

      {unreadable > 0 && (
        <div role="status" className="rounded-xl bg-amber-50 text-amber-700 px-3 py-2 text-sm">
          {unreadable} saved {unreadable === 1 ? 'plan' : 'plans'} could not be read and {unreadable === 1 ? 'is' : 'are'} not shown here.
          Saving any change removes {unreadable === 1 ? 'it' : 'them'}.
        </div>
      )}

      {success && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}
      {error && !editing && deleting === null && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}

      {plans.length === 0 ? (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 text-center space-y-3">
          <p className="text-slate-600">No plans yet. Add your first plan so you can sign up and renew members.</p>
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-brand-500 text-white font-semibold"
          >
            <Plus className="w-4 h-4" /> Add plan
          </button>
        </div>
      ) : (
        GROUPS.map(({ category, label }) => {
          const rows = plans.map((p, index) => ({ p, index })).filter(({ p }) => p.category === category)
          if (rows.length === 0) return null
          const hasDup = rows.some(({ p }) => dups.has(planGroupKey(p)))
          return (
            <section key={category} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">{label}</h2>
              {hasDup && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 text-amber-700 px-3 py-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Two plans share the same length and category. The add-member screen uses the first one.
                </div>
              )}
              <ul className="bg-surface-card border border-surface-border rounded-2xl divide-y divide-surface-border overflow-hidden">
                {rows.map(({ p, index }) => (
                  <li key={index} className="p-4 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{p.planName}</p>
                      <p className="text-sm text-slate-500">
                        {durationLabel(p)} · {formatCurrency(p.price)}
                        {p.joiningFee > 0 && <> · Joining fee {formatCurrency(p.joiningFee)}</>}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {p.hasDiscount && p.discountPercent > 0 && (
                          <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">{p.discountPercent}% off</span>
                        )}
                        {p.hasFreezeOption && (
                          <span className="text-xs rounded-full bg-brand-50 text-brand-700 px-2 py-0.5">Freeze allowed</span>
                        )}
                      </div>
                    </div>
                    <button type="button" aria-label={`Edit ${p.planName}`} disabled={saving} onClick={() => openEditor(index)}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 hover:bg-surface-secondary">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label={`Delete ${p.planName}`} disabled={saving} onClick={() => { setError(''); setSuccess(''); setDeleting(index) }}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}

      {editing && (
        <PlanModal
          title={editing.index === null ? 'Add plan' : 'Edit plan'}
          draft={editing.draft}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onClose={() => setEditing(null)}
          onSubmit={submitForm}
          saving={saving}
          error={formError}
        />
      )}

      {deleting !== null && plans[deleting] && (
        <Overlay onClose={() => !saving && setDeleting(null)}>
          <div className="p-5 space-y-3">
            <h3 className="text-lg font-bold text-slate-900">Delete {plans[deleting].planName}?</h3>
            <p className="text-sm text-slate-600">
              Members already on this plan keep their membership. Only new sign-ups and renewals stop seeing it.
            </p>
            {error && <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={saving} onClick={() => setDeleting(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-surface-border text-slate-700 font-semibold">Cancel</button>
              <button type="button" disabled={saving} onClick={confirmDelete}
                className="flex-1 min-h-[44px] rounded-xl bg-red-500 text-white font-semibold disabled:opacity-60">
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-ink-900/60 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface-card rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="w-full min-h-[44px] flex items-center justify-between text-sm text-slate-700">
      <span>{label}</span>
      <span className={cn('w-11 h-6 rounded-full p-0.5 transition-colors', checked ? 'bg-brand-500' : 'bg-slate-300')}>
        <span className={cn('block w-5 h-5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
      </span>
    </button>
  )
}

function PlanModal({ title, draft, onChange, onClose, onSubmit, saving, error }: {
  title: string; draft: Draft; onChange: (d: Draft) => void; onClose: () => void
  onSubmit: () => void; saving: boolean; error: string
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v })
  const input = 'w-full min-h-[44px] rounded-xl border border-surface-border bg-surface px-3 text-slate-900'
  const seg = (active: boolean) => cn(
    'flex-1 min-h-[44px] rounded-xl border text-sm font-medium px-2',
    active ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-border bg-surface text-slate-700',
  )
  return (
    <Overlay onClose={() => !saving && onClose()}>
      <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button type="button" aria-label="Close" disabled={saving} onClick={onClose} className="w-11 h-11 flex items-center justify-center text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block space-y-1 text-sm text-slate-700">
          Plan name
          <input className={input} value={draft.planName} maxLength={60} disabled={saving} onChange={(e) => set('planName', e.target.value)} />
        </label>

        <div className="space-y-1 text-sm text-slate-700">
          Category
          <div className="flex gap-2">
            {GROUPS.map((g) => (
              <button key={g.category} type="button" disabled={saving} className={seg(draft.category === g.category)} onClick={() => set('category', g.category)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 text-sm text-slate-700">
          Duration
          <div className="grid grid-cols-2 gap-2">
            {([['monthly', '1 month'], ['quarterly', '3 months'], ['annual', '12 months'], ['custom', 'Custom']] as const).map(([v, l]) => (
              <button key={v} type="button" disabled={saving} className={seg(draft.duration === v)} onClick={() => set('duration', v)}>{l}</button>
            ))}
          </div>
          {draft.duration === 'custom' && (
            <input className={cn(input, 'mt-2')} inputMode="numeric" placeholder="Months (1 to 24)" value={draft.customMonths}
              disabled={saving} onChange={(e) => set('customMonths', e.target.value)} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm text-slate-700">
            Price (Rs)
            <input className={input} inputMode="numeric" value={draft.price} disabled={saving} onChange={(e) => set('price', e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm text-slate-700">
            Joining fee (Rs)
            <input className={input} inputMode="numeric" value={draft.joiningFee} disabled={saving} onChange={(e) => set('joiningFee', e.target.value)} />
          </label>
        </div>

        <Toggle label="Offer a discount" checked={draft.hasDiscount} disabled={saving} onChange={(v) => set('hasDiscount', v)} />
        {draft.hasDiscount && (
          <label className="block space-y-1 text-sm text-slate-700">
            Discount percent
            <input className={input} inputMode="numeric" value={draft.discountPercent} disabled={saving} onChange={(e) => set('discountPercent', e.target.value)} />
          </label>
        )}
        <Toggle label="Allow freezing" checked={draft.hasFreezeOption} disabled={saving} onChange={(v) => set('hasFreezeOption', v)} />

        {error && <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-surface-border text-slate-700 font-semibold">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 min-h-[44px] rounded-xl bg-brand-500 text-white font-semibold disabled:opacity-60">
            {saving ? 'Saving...' : 'Save plan'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}
