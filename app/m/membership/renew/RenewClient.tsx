'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { RenewalCategory, RenewalPageData } from '@/types/renewal'
import UpiPayPanel, { focusRing as focus } from './UpiPayPanel'
import ProofUpload from './ProofUpload'

const APPROVED_VISIBLE_MS = 3 * 24 * 60 * 60 * 1000

const durationLabel = (m: number) => (m === 1 ? '1 month' : `${m} months`)
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

const CATEGORIES: { key: RenewalCategory; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'both', label: 'Strength + Cardio' },
]

export default function RenewClient({ data }: { data: RenewalPageData }) {
  const router = useRouter()
  const { options, latest } = data

  const [categoryPick, setCategoryPick] = useState<RenewalCategory | null>(null)
  const [planKey, setPlanKey] = useState<string | null>(null)

  const categories = CATEGORIES.filter((c) => options.plans.some((p) => p.category === c.key))
  // One category only: pick it automatically and skip the category step.
  const category = categories.length === 1 ? categories[0].key : categoryPick
  const plans = options.plans.filter((p) => p.category === category)
  const plan = plans.find((p) => p.key === planKey) ?? null
  const upi = options.upi

  // --- terminal / blocked states ---
  if (latest?.status === 'pending') {
    return (
      <section className="card rounded-2xl p-5" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Clock aria-hidden="true" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-bold text-slate-900">Waiting for your gym to confirm</h2>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-slate-400">Plan</dt><dd className="font-semibold text-slate-800">{latest.planName}</dd></div>
          <div><dt className="text-xs text-slate-400">Amount</dt><dd className="font-semibold text-slate-800">{formatCurrency(latest.amount)}</dd></div>
          <div><dt className="text-xs text-slate-400">Submitted</dt><dd className="font-semibold text-slate-800">{fmtDate(latest.createdAt)}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">You&apos;ll get a WhatsApp confirmation when it&apos;s approved.</p>
      </section>
    )
  }

  if (
    latest?.status === 'approved' &&
    latest.reviewedAt &&
    Date.now() - new Date(latest.reviewedAt).getTime() < APPROVED_VISIBLE_MS
  ) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-bold text-emerald-600">
          <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
          Your membership was renewed.
        </p>
        <Link
          href="/m/membership"
          className={cn('mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white', focus)}
        >
          Back to membership
        </Link>
      </section>
    )
  }

  if (options.plans.length === 0 || !upi) {
    return (
      <section className="card rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-900">Online renewal isn&apos;t available</p>
        <p className="mt-1 text-sm text-slate-500">
          Your gym hasn&apos;t set up online renewal yet. Please renew at the front desk.
        </p>
      </section>
    )
  }

  const submit = async (file: File, txn: string): Promise<string | null> => {
    if (!plan) return 'Please choose a plan.'
    try {
      const body = new FormData()
      body.append('plan_key', plan.key)
      body.append('file', file)
      if (txn) body.append('transaction_id', txn)
      // No Content-Type: the browser sets the multipart boundary.
      const res = await fetch('/api/member/renewal', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body,
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.success) {
        router.refresh()
        return null
      }
      return json?.error?.message ?? 'Something went wrong. Please try again.'
    } catch {
      return 'Could not reach the server. Check your connection and try again.'
    }
  }

  const stepTitle = 'text-base font-bold text-slate-900'
  const showCategories = categories.length > 1
  const planStep = showCategories ? 2 : 1
  const cardLabel =
    'card flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500'

  return (
    <div className="space-y-6">
      {latest?.status === 'rejected' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-600">
            <AlertCircle aria-hidden="true" className="h-4 w-4" />
            Your last request was not approved
          </p>
          {latest.rejectReason && <p className="mt-1 text-sm text-slate-600">{latest.rejectReason}</p>}
          <p className="mt-1 text-xs text-slate-500">You can start again below.</p>
        </div>
      )}

      {showCategories && (
        <fieldset>
          <legend className={stepTitle}>1. Choose a category</legend>
          <div className="mt-3 space-y-2">
            {categories.map((c) => (
              <label key={c.key} className={cn(cardLabel, category === c.key && 'border-brand-500 ring-2 ring-brand-500')}>
                <input
                  type="radio"
                  name="category"
                  value={c.key}
                  checked={category === c.key}
                  onChange={() => { setCategoryPick(c.key); setPlanKey(null) }}
                  className="h-4 w-4 accent-brand-500"
                />
                <span className="text-base font-bold text-slate-900">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {category && (
        <fieldset>
          <legend className={stepTitle}>{planStep}. Choose a plan</legend>
          <div className="mt-3 space-y-2">
            {plans.map((p) => (
              <label key={p.key} className={cn(cardLabel, planKey === p.key && 'border-brand-500 ring-2 ring-brand-500')}>
                <input
                  type="radio"
                  name="plan"
                  value={p.key}
                  checked={planKey === p.key}
                  onChange={() => setPlanKey(p.key)}
                  className="h-4 w-4 accent-brand-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{p.name}</span>
                  <span className="block text-xs text-slate-500">{durationLabel(p.months)}</span>
                </span>
                <span className="text-sm font-bold text-slate-900">{formatCurrency(p.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {plan && (
        <section aria-labelledby="pay-title">
          <h2 id="pay-title" className={stepTitle}>{planStep + 1}. Pay {formatCurrency(plan.price)}</h2>
          <UpiPayPanel upi={upi} amount={plan.price} note={`Renewal ${plan.name}`} />
        </section>
      )}

      {plan && (
        <section aria-labelledby="proof-title">
          <h2 id="proof-title" className={stepTitle}>{planStep + 2}. Upload proof</h2>
          <ProofUpload onSubmit={submit} />
        </section>
      )}
    </div>
  )
}
