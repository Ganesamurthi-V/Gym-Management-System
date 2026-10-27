'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { RenewalPageData } from '@/types/renewal'
import UpiPayPanel, { focusRing as focus } from '../renew/UpiPayPanel'
import ProofUpload from '../renew/ProofUpload'
import { DUE_DRAFT_KEY, loadDraft, saveDraft } from '../renew/paymentDraft'

const APPROVED_VISIBLE_MS = 3 * 24 * 60 * 60 * 1000

export default function PayDueClient({ data }: { data: RenewalPageData }) {
  const router = useRouter()
  const { options, pendingDue, latestDue } = data
  const upi = options.upi
  const [amountText, setAmountText] = useState(String(pendingDue))
  // Resync when the server value changes (router.refresh after a payment is confirmed).
  const [prevDue, setPrevDue] = useState(pendingDue)
  if (prevDue !== pendingDue) {
    setPrevDue(pendingDue)
    setAmountText(String(pendingDue))
  }

  // Restore the amount if the page was reloaded while the member was in a UPI app, and keep it up to date.
  useEffect(() => {
    const d = loadDraft<{ amountText: string }>(DUE_DRAFT_KEY)
    if (d?.amountText && /^\d+$/.test(d.amountText) && Number(d.amountText) <= pendingDue) setAmountText(d.amountText)
    // Only on first load: later changes come from the member typing or from the server value above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (/^\d+$/.test(amountText)) saveDraft(DUE_DRAFT_KEY, { amountText })
  }, [amountText])

  const backLink = (
    <Link
      href="/m/membership"
      className={cn('mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white', focus)}
    >
      Back to membership
    </Link>
  )

  const recentlyApproved =
    latestDue?.status === 'approved' &&
    !!latestDue.reviewedAt &&
    Date.now() - new Date(latestDue.reviewedAt).getTime() < APPROVED_VISIBLE_MS

  if (pendingDue === 0) {
    return (
      <div className="space-y-4">
        {recentlyApproved && (
          <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-600" aria-live="polite">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0" />
            Your payment was confirmed.
          </p>
        )}
        <section className="card rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-900">You have no pending dues</p>
          <p className="mt-1 text-sm text-slate-500">Nothing to pay right now.</p>
          {backLink}
        </section>
      </div>
    )
  }

  if (latestDue?.status === 'pending') {
    return (
      <section className="card rounded-2xl p-5" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Clock aria-hidden="true" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-bold text-slate-900">
            Waiting for your gym to confirm your payment of {formatCurrency(latestDue.amount)}
          </h2>
        </div>
        <p className="mt-4 text-xs text-slate-500">You&apos;ll get a confirmation when it&apos;s approved.</p>
      </section>
    )
  }

  if (!upi) {
    return (
      <section className="card rounded-2xl p-5">
        <p className="text-sm font-bold text-slate-900">Please pay your dues at the front desk.</p>
        <p className="mt-1 text-sm text-slate-500">Pending dues: {formatCurrency(pendingDue)}</p>
      </section>
    )
  }

  const trimmed = amountText.trim()
  const amount = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
  const amountError =
    Number.isInteger(amount) && amount >= 1 && amount <= pendingDue
      ? null
      : `Enter a whole amount from ${formatCurrency(1)} to ${formatCurrency(pendingDue)}.`

  const submit = async (file: File, txn: string): Promise<string | null> => {
    if (amountError) return amountError
    try {
      const body = new FormData()
      body.append('kind', 'due')
      body.append('amount', String(amount))
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

  return (
    <div className="space-y-6">
      {latestDue?.status === 'rejected' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-600">
            <AlertCircle aria-hidden="true" className="h-4 w-4" />
            Your last payment was not approved
          </p>
          {latestDue.rejectReason && <p className="mt-1 text-sm text-slate-600">{latestDue.rejectReason}</p>}
          <p className="mt-1 text-xs text-slate-500">You can try again below.</p>
        </div>
      )}
      {recentlyApproved && (
        <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-600" role="status">
          <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0" />
          Your payment was confirmed.
        </p>
      )}

      <section aria-labelledby="amount-title">
        <p className="text-sm font-bold text-red-700">Pending dues: {formatCurrency(pendingDue)}</p>
        <h2 id="amount-title" className={cn(stepTitle, 'mt-4')}>1. Amount to pay</h2>
        <label htmlFor="due-amount" className="mt-3 mb-1 block text-sm font-semibold text-slate-700">
          Amount in rupees. Lower it to pay part of your dues.
        </label>
        <input
          id="due-amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          aria-invalid={!!amountError}
          aria-describedby={amountError ? 'due-amount-error' : undefined}
          className={cn('block min-h-[44px] w-full rounded-xl border border-surface-border bg-surface-card px-3 text-sm text-slate-900', focus)}
        />
        {amountError && (
          <p id="due-amount-error" className="mt-1 text-sm font-medium text-red-600">{amountError}</p>
        )}
      </section>

      {!amountError && (
        <section aria-labelledby="pay-title">
          <h2 id="pay-title" className={stepTitle}>2. Pay {formatCurrency(amount)}</h2>
          <UpiPayPanel upi={upi} amount={amount} note="Dues payment" />
        </section>
      )}

      <section aria-labelledby="proof-title">
        <h2 id="proof-title" className={stepTitle}>3. Upload proof</h2>
        <ProofUpload onSubmit={submit} disabled={!!amountError} />
      </section>
    </div>
  )
}
