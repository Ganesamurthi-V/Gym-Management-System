'use client'

import { useState, useEffect } from 'react'
import {
  CreditCard, Clock, CheckCircle2, XCircle, ExternalLink, FileText,
  Loader2, AlertTriangle, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface SubscriptionRequest {
  id: string
  status: string
  submitted_at: string
  reviewed_at: string | null
  transaction_id: string | null
  notes: string | null
  rejection_reason: string | null
  uploaded_file_url: string | null
  signedUrl: string | null
  gym_id: string
  gyms: { id: string; name: string; owner_id: string; subscription_status: string; plan_type: string } | null
}

type Filter = 'all' | 'pending' | 'approved' | 'rejected'
type PlanType = 'monthly' | 'yearly' | 'lifetime'

const STATUS_BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-red-500/10 text-red-400 border-red-500/20', Icon: XCircle },
}

export default function SubscriptionsPage() {
  const [requests, setRequests] = useState<SubscriptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('pending')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [planMap, setPlanMap] = useState<Record<string, PlanType>>({})

  async function fetchRequests() {
    setLoading(true)
    try {
      const res = await fetch('/api/subscriptions')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setRequests(data)
    } catch {
      toast.error('Failed to load subscription requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRequests() }, [])

  async function handleApprove(req: SubscriptionRequest) {
    const plan = planMap[req.id] ?? 'monthly'
    setActionLoading(req.id)
    try {
      const res = await fetch(`/api/admin/gyms/${req.gym_id}/subscription/payment/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: req.id, plan }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      toast.success(`Approved ${req.gyms?.name ?? 'gym'} — ${plan} plan`)
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(req: SubscriptionRequest) {
    if (!rejectReason.trim()) { toast.error('Rejection reason is required'); return }
    setActionLoading(req.id)
    try {
      const res = await fetch(`/api/admin/gyms/${req.gym_id}/subscription/payment/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: req.id, rejection_reason: rejectReason }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      toast.success(`Rejected ${req.gyms?.name ?? 'gym'}`)
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected', rejection_reason: rejectReason } : r))
      setRejectId(null)
      setRejectReason('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscription Requests</h1>
          <p className="text-slate-500 text-sm mt-0.5">Review and manage gym payment proofs</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold">
              {pendingCount} pending
            </span>
          )}
          <button onClick={fetchRequests} disabled={loading} className="admin-btn-ghost">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === f
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px]">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-card py-16 text-center">
          <CreditCard className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No {filter === 'all' ? '' : filter} requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE.pending
            const BadgeIcon = badge.Icon
            const isThisLoading = actionLoading === req.id
            const isRejecting = rejectId === req.id

            return (
              <div key={req.id} className="admin-card p-5">
                <div className="flex items-start gap-4">
                  {/* Gym info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Link href={`/gyms/${req.gym_id}`} className="font-semibold text-white hover:text-indigo-300 transition-colors truncate">
                        {req.gyms?.name ?? 'Unknown Gym'}
                      </Link>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.cls}`}>
                        <BadgeIcon className="w-3 h-3" /> {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Submitted {new Date(req.submitted_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {req.transaction_id && (
                      <p className="text-xs text-slate-400 mt-1">Txn: <span className="font-mono font-medium text-slate-300">{req.transaction_id}</span></p>
                    )}
                    {req.notes && (
                      <p className="text-xs text-slate-500 mt-1 italic">&ldquo;{req.notes}&rdquo;</p>
                    )}
                    {req.rejection_reason && (
                      <p className="text-xs text-red-400 mt-1">Reason: {req.rejection_reason}</p>
                    )}
                    {req.reviewed_at && (
                      <p className="text-xs text-slate-600 mt-1">Reviewed {new Date(req.reviewed_at).toLocaleDateString('en-IN')}</p>
                    )}
                  </div>

                  {/* Proof link */}
                  {req.signedUrl && (
                    <a href={req.signedUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium">
                      <FileText className="w-3.5 h-3.5" /> Proof <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Actions — only for pending */}
                {req.status === 'pending' && (
                  <div className="mt-4 pt-3 border-t border-[#1f2937]">
                    {!isRejecting ? (
                      <div className="flex items-center gap-3">
                        <select
                          value={planMap[req.id] ?? 'monthly'}
                          onChange={e => setPlanMap(p => ({ ...p, [req.id]: e.target.value as PlanType }))}
                          className="admin-input w-36 text-xs py-1.5"
                        >
                          <option value="monthly">Monthly (30d)</option>
                          <option value="yearly">Yearly (365d)</option>
                          <option value="lifetime">Lifetime</option>
                        </select>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={isThisLoading}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isThisLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Approve
                        </button>
                        <button
                          onClick={() => { setRejectId(req.id); setRejectReason('') }}
                          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <XCircle className="w-3 h-3" /> Reject
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder="Rejection reason (required)..."
                          className="admin-input w-full text-xs py-1.5"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReject(req)}
                            disabled={isThisLoading || !rejectReason.trim()}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isThisLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                            Confirm Reject
                          </button>
                          <button
                            onClick={() => setRejectId(null)}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
