'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle, XCircle, Clock, ExternalLink, ChevronDown,
  RefreshCw, FileText, Wifi, WifiOff, Bell,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRealtimeInvalidation } from '@/lib/hooks/useRealtimeInvalidation'

interface Request {
  id: string
  status: string
  submitted_at: string
  reviewed_at?: string | null
  transaction_id?: string | null
  notes?: string | null
  rejection_reason?: string | null
  uploaded_file_url?: string | null
  signedUrl?: string | null
  gyms?: { id: string; name: string; owner_id: string } | null
}

interface Props {
  requests: Request[]
}

const STATUS_BADGE = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700',   Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700',        Icon: XCircle },
}

const PLAN_OPTIONS = [
  { value: 'monthly',  label: 'Monthly (30 days)' },
  { value: 'yearly',   label: 'Yearly (365 days)' },
  { value: 'lifetime', label: 'Lifetime' },
]

export default function AdminSubscriptionList({ requests: initial }: Props) {
  const [requests, setRequests] = useState(initial)
  const [loading, setLoading]   = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [planMap, setPlanMap] = useState<Record<string, string>>({})
  const router = useRouter()
  const refreshFromServer = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    setRequests(initial)
  }, [initial])

  const { isConnected } = useRealtimeInvalidation({
    channelName: 'admin:subscriptions',
    onInvalidate: refreshFromServer,
  })

  async function approve(id: string) {
    const plan = planMap[id] ?? 'monthly'
    setLoading(id)
    const res = await fetch(`/api/admin/subscription-requests/${id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${prompt('Admin password')}`,
      },
      body: JSON.stringify({ action: 'approve', plan_type: plan }),
    })
    if (res.ok) {
      setRequests(prev =>
        prev.map(r => r.id === id ? { ...r, status: 'approved' } : r)
      )
    } else {
      alert('Failed to approve. Check password.')
    }
    setLoading(null)
  }

  async function reject(id: string) {
    setLoading(id)
    const password = prompt('Admin password')
    const res = await fetch(`/api/admin/subscription-requests/${id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ action: 'reject', rejection_reason: rejectReason }),
    })
    if (res.ok) {
      setRequests(prev =>
        prev.map(r => r.id === id ? { ...r, status: 'rejected', rejection_reason: rejectReason } : r)
      )
      setRejectId(null)
      setRejectReason('')
    } else {
      alert('Failed to reject. Check password.')
    }
    setLoading(null)
  }

  const pending  = requests.filter(r => r.status === 'pending')
  const reviewed = requests.filter(r => r.status !== 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Review and approve / reject gym payment proofs.</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {isConnected ? 'Live' : 'Connecting...'}
        </div>
      </div>

      {/* Pending */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 px-6 py-10 text-center text-gray-400 text-sm">
            No pending requests 🎉
          </div>
        )}
        {pending.map(req => (
          <RequestCard
            key={req.id}
            req={req}
            loading={loading}
            rejectId={rejectId}
            rejectReason={rejectReason}
            planMap={planMap}
            onPlanChange={(id, plan) => setPlanMap(p => ({ ...p, [id]: plan }))}
            onApprove={approve}
            onStartReject={id => { setRejectId(id); setRejectReason('') }}
            onCancelReject={() => setRejectId(null)}
            onRejectReasonChange={setRejectReason}
            onConfirmReject={reject}
          />
        ))}
      </section>

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
            Reviewed ({reviewed.length})
          </h2>
          {reviewed.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              loading={loading}
              rejectId={rejectId}
              rejectReason={rejectReason}
              planMap={planMap}
              onPlanChange={() => {}}
              onApprove={approve}
              onStartReject={id => { setRejectId(id); setRejectReason('') }}
              onCancelReject={() => setRejectId(null)}
              onRejectReasonChange={setRejectReason}
              onConfirmReject={reject}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function RequestCard({
  req, loading, rejectId, rejectReason, planMap,
  onPlanChange, onApprove, onStartReject, onCancelReject,
  onRejectReasonChange, onConfirmReject,
}: {
  req: Request
  loading: string | null
  rejectId: string | null
  rejectReason: string
  planMap: Record<string, string>
  onPlanChange: (id: string, plan: string) => void
  onApprove: (id: string) => void
  onStartReject: (id: string) => void
  onCancelReject: () => void
  onRejectReasonChange: (v: string) => void
  onConfirmReject: (id: string) => void
}) {
  const badge = STATUS_BADGE[req.status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.pending
  const isThisLoading = loading === req.id
  const isRejecting = rejectId === req.id

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-start gap-3">
        {/* Gym info */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">{req.gyms?.name ?? 'Unknown Gym'}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Submitted {new Date(req.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          {req.transaction_id && (
            <p className="text-xs text-gray-500 mt-1">Txn: <span className="font-mono font-semibold">{req.transaction_id}</span></p>
          )}
          {req.notes && (
            <p className="text-xs text-gray-500 mt-1 italic">"{req.notes}"</p>
          )}
          {req.rejection_reason && (
            <p className="text-xs text-red-600 mt-1">Reason: {req.rejection_reason}</p>
          )}
        </div>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${badge.cls}`}>
          <badge.Icon className="w-3.5 h-3.5" />
          {badge.label}
        </div>
      </div>

      {/* Actions */}
      {req.status === 'pending' && (
        <div className="px-5 pb-4 space-y-3">
          {/* View proof */}
          {req.signedUrl && (
            <a
              href={req.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-600 font-semibold hover:underline"
            >
              <FileText className="w-3.5 h-3.5" /> View Payment Proof
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {/* Plan selector + approve */}
          {!isRejecting && (
            <div className="flex items-center gap-2">
              <select
                value={planMap[req.id] ?? 'monthly'}
                onChange={e => onPlanChange(req.id, e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 flex-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {PLAN_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <button
                onClick={() => onApprove(req.id)}
                disabled={isThisLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {isThisLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Approve
              </button>
              <button
                onClick={() => onStartReject(req.id)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold rounded-lg border border-red-200 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>
          )}

          {/* Rejection form */}
          {isRejecting && (
            <div className="space-y-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-bold text-red-700">Rejection reason (optional)</p>
              <textarea
                value={rejectReason}
                onChange={e => onRejectReasonChange(e.target.value)}
                rows={2}
                className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                placeholder="e.g. Screenshot unclear, wrong amount..."
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onConfirmReject(req.id)}
                  disabled={isThisLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isThisLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Confirm Reject
                </button>
                <button
                  onClick={onCancelReject}
                  className="px-4 py-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviewed at */}
      {req.reviewed_at && (
        <div className="px-5 pb-3">
          <p className="text-xs text-gray-400">
            Reviewed {new Date(req.reviewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      )}
    </div>
  )
}
