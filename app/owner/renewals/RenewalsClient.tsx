'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { addMonths, format, parseISO } from 'date-fns'
import { Eye, Check, X, Loader2 } from 'lucide-react'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { cn, formatCurrency, formatDate, todayIST } from '@/lib/utils'
import { formatMemberId } from '@/types'
import type { OwnerRenewalRequest, DueApproveResult } from '@/types/renewal'

interface Props {
  pending: OwnerRenewalRequest[]
  reviewed: OwnerRenewalRequest[]
}

type Dialog = { kind: 'approve' | 'reject'; req: OwnerRenewalRequest } | null

function fmtTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso))
}

// Same rule as the server: start + months, formatted yyyy-MM-dd.
function endDateFor(start: string, months: number): string {
  return format(addMonths(parseISO(start), months), 'yyyy-MM-dd')
}

export function RenewalsClient({ pending: pendingProp, reviewed: reviewedProp }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending')
  const [pending, setPending] = useState(pendingProp)
  const [reviewed, setReviewed] = useState(reviewedProp)
  const [prevPending, setPrevPending] = useState(pendingProp)
  const [prevReviewed, setPrevReviewed] = useState(reviewedProp)
  // Resync when router.refresh() delivers new server props.
  if (pendingProp !== prevPending) { setPrevPending(pendingProp); setPending(pendingProp) }
  if (reviewedProp !== prevReviewed) { setPrevReviewed(reviewedProp); setReviewed(reviewedProp) }

  const [dialog, setDialog] = useState<Dialog>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cardError, setCardError] = useState<{ id: string; text: string } | null>(null)
  const [proofImage, setProofImage] = useState<string | null>(null)

  async function viewProof(req: OwnerRenewalRequest) {
    if (busyId) return
    setBusyId(req.id)
    setCardError(null)
    // Open the tab synchronously so popup blockers allow it; point it at the PDF once known.
    let win: Window | null = null
    try {
      const res = await api.get<{ success: true; data: { url: string; isPdf: boolean } }>(`/api/renewal-requests/${req.id}/proof`)
      const { url, isPdf } = res.data
      if (isPdf) {
        win = window.open(url, '_blank', 'noopener,noreferrer')
        if (!win) window.location.href = url
      } else {
        setProofImage(url)
      }
    } catch (err) {
      setCardError({ id: req.id, text: err instanceof GymFlowAPIError ? err.message : 'Could not load the proof.' })
    } finally {
      setBusyId(null)
    }
  }

  function done(text: string) {
    setDialog(null)
    setMessage(text)
    router.refresh()
  }

  return (
    <div className="space-y-4 md:space-y-5 w-full max-w-4xl mx-auto">
      <div>
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">Renewals</h1>
        <p className="text-sm text-slate-500">Renewal and dues payment requests</p>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {([['pending', `Pending (${pending.length})`], ['reviewed', 'Reviewed']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
              tab === key ? 'bg-surface-card text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-2.5 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {tab === 'pending' ? (
        pending.length === 0 ? <Empty /> : (
          <div className="space-y-3">
            {pending.map(req => (
              <div key={req.id} className="card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm">{req.memberName}</p>
                      <span className="text-xs text-slate-400">{formatMemberId(req.memberNumber)}</span>
                    </div>
                    <p className="text-xs text-slate-400">{req.memberPhone}</p>
                    <PlanLine req={req} className="text-sm text-slate-700 mt-1.5" />
                  </div>
                  <p className="font-bold text-slate-900 flex-shrink-0">{formatCurrency(req.amount)}</p>
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <p>Submitted {fmtTimestamp(req.createdAt)}</p>
                  {req.transactionId && <p>Transaction ID: <span className="font-medium text-slate-700 break-all">{req.transactionId}</span></p>}
                  {req.notes && <p>Note: <span className="text-slate-700">{req.notes}</span></p>}
                </div>
                {cardError?.id === req.id && <p className="text-sm text-red-600">{cardError.text}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => viewProof(req)}
                    disabled={busyId !== null}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-surface-border bg-surface-card text-slate-700 hover:bg-surface-secondary disabled:opacity-60"
                  >
                    {busyId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} View proof
                  </button>
                  <button
                    onClick={() => { setCardError(null); setDialog({ kind: 'approve', req }) }}
                    disabled={busyId !== null}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => { setCardError(null); setDialog({ kind: 'reject', req }) }}
                    disabled={busyId !== null}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : reviewed.length === 0 ? <Empty /> : (
        <div className="space-y-3">
          {reviewed.map(req => (
            <div key={req.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900 text-sm">{req.memberName}</p>
                    <span className="text-xs text-slate-400">{formatMemberId(req.memberNumber)}</span>
                  </div>
                  <PlanLine req={req} className="text-sm text-slate-700 mt-1" />
                  <p className="text-xs text-slate-400 mt-0.5">
                    {req.status === 'approved' ? 'Approved' : 'Rejected'} {fmtDay(req.reviewedAt ?? req.createdAt)}
                  </p>
                  {req.status === 'rejected' && req.rejectReason && (
                    <p className="text-xs text-slate-500 mt-1">Reason: {req.rejectReason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <p className="font-bold text-slate-900">{formatCurrency(req.amount)}</p>
                  <span className={cn(
                    'inline-block text-xs font-semibold px-2 py-0.5 rounded-full',
                    req.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                  )}>
                    {req.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog?.kind === 'approve' && (
        <ApproveDialog req={dialog.req} onClose={() => setDialog(null)} onDone={msg => done(msg)} onStale={() => done('This request was already handled.')} />
      )}
      {dialog?.kind === 'reject' && (
        <RejectDialog req={dialog.req} onClose={() => setDialog(null)} onDone={() => done('Request rejected')} onStale={() => done('This request was already handled.')} />
      )}
      {proofImage && <ProofOverlay url={proofImage} onClose={() => setProofImage(null)} />}
    </div>
  )
}

function PlanLine({ req, className }: { req: OwnerRenewalRequest; className: string }) {
  if (req.kind === 'due') {
    return (
      <p className={className}>
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Dues payment</span>
      </p>
    )
  }
  return <p className={className}>{req.planName} {req.duration && <span className="text-slate-400">({req.duration})</span>}</p>
}

function Empty() {
  return (
    <div className="card p-12 text-center">
      <p className="text-slate-500 font-medium">No payment requests yet.</p>
      <p className="text-slate-400 text-sm mt-1">When a member renews or pays dues from the app, it appears here.</p>
    </div>
  )
}

function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/60 p-4" onClick={() => { if (!busy) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-surface-card border border-surface-border p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function useSubmit(onStale: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      if (err instanceof GymFlowAPIError && err.code === 'NOT_PENDING') { onStale(); return }
      setError(err instanceof GymFlowAPIError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }
  return { busy, error, run }
}

type ApproveProps = { req: OwnerRenewalRequest; onClose: () => void; onDone: (msg: string) => void; onStale: () => void }

function ApproveDialog(props: ApproveProps) {
  return props.req.kind === 'due' ? <DueApproveDialog {...props} /> : <RenewalApproveDialog {...props} />
}

function DueApproveDialog({ req, onClose, onDone, onStale }: ApproveProps) {
  const { busy, error, run } = useSubmit(onStale)

  return (
    <Modal title="Confirm dues payment" onClose={onClose} busy={busy}>
      <p className="text-sm text-slate-700">
        Mark {formatCurrency(req.amount)} of <span className="font-semibold">{req.memberName}</span>&apos;s dues as paid by UPI.
      </p>
      <p className="text-xs text-slate-500">Check your UPI app first: GymFlow cannot see the payment.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} disabled={busy} className="px-3 py-2 text-sm font-semibold text-slate-500 disabled:opacity-60">Cancel</button>
        <button
          disabled={busy}
          onClick={() => run(async () => {
            try {
              const res = await api.post<{ success: true; data: DueApproveResult }>(`/api/renewal-requests/${req.id}/approve`)
              const { collected, newPending } = res.data
              const lower = collected < req.amount ? ` (the member's balance was lower than the ${formatCurrency(req.amount)} requested)` : ''
              onDone(`Dues updated: ${formatCurrency(collected)} collected, ${formatCurrency(newPending)} still pending${lower}`)
            } catch (err) {
              if (err instanceof GymFlowAPIError && err.code === 'NOTHING_DUE') { onDone(err.message); return }
              throw err
            }
          })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirm payment
        </button>
      </div>
    </Modal>
  )
}

function RenewalApproveDialog({ req, onClose, onDone, onStale }: ApproveProps) {
  const today = todayIST()
  const [start, setStart] = useState(today)
  const { busy, error, run } = useSubmit(onStale)
  const end = start && req.months ? endDateFor(start, req.months) : null
  const stillRunning = req.currentEndDate !== null && req.currentEndDate >= today

  return (
    <Modal title="Approve renewal" onClose={onClose} busy={busy}>
      <div className="text-sm space-y-1">
        <p className="text-slate-700"><span className="font-semibold">{req.memberName}</span>: {req.planName}</p>
        <p className="text-slate-700">Amount: <span className="font-semibold">{formatCurrency(req.amount)}</span></p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500" htmlFor="renew-start">Start date</label>
        <input id="renew-start" type="date" value={start} onChange={e => setStart(e.target.value)} className="input-field w-full" />
        {end && (
          <p className="text-sm text-slate-700">
            {start === today ? `Starts today (${formatDate(start)})` : `Starts ${formatDate(start)}`}, ends {formatDate(end)}
          </p>
        )}
        {stillRunning && req.currentEndDate && (
          <p className="text-xs text-amber-700">Current plan runs until {formatDate(req.currentEndDate)}. Renewing starts the new plan on the date above.</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} disabled={busy} className="px-3 py-2 text-sm font-semibold text-slate-500 disabled:opacity-60">Cancel</button>
        <button
          disabled={busy || !start}
          onClick={() => run(async () => {
            await api.post(`/api/renewal-requests/${req.id}/approve`, { start_date: start })
            onDone('Membership renewed')
          })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Approve and renew
        </button>
      </div>
    </Modal>
  )
}

function RejectDialog({ req, onClose, onDone, onStale }: { req: OwnerRenewalRequest; onClose: () => void; onDone: () => void; onStale: () => void }) {
  const [reason, setReason] = useState('')
  const { busy, error, run } = useSubmit(onStale)
  const trimmed = reason.trim()
  const valid = trimmed.length >= 3 && trimmed.length <= 300

  return (
    <Modal title="Reject renewal" onClose={onClose} busy={busy}>
      <p className="text-sm text-slate-700">{req.memberName}: {req.planName}, {formatCurrency(req.amount)}</p>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500" htmlFor="reject-reason">Reason (shown to the member)</label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={300}
          rows={3}
          className="input-field w-full"
          placeholder="e.g. Payment not received in our account"
        />
        <p className="text-xs text-slate-400 text-right">{reason.length}/300</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} disabled={busy} className="px-3 py-2 text-sm font-semibold text-slate-500 disabled:opacity-60">Cancel</button>
        <button
          disabled={busy || !valid}
          onClick={() => run(async () => {
            await api.post(`/api/renewal-requests/${req.id}/reject`, { reason: trimmed })
            onDone()
          })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Reject request
        </button>
      </div>
    </Modal>
  )
}

function ProofOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/90 p-4" onClick={onClose}>
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Payment proof" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
    </div>,
    document.body,
  )
}
