'use client'

import { useState, useEffect } from 'react'
import {
  CreditCard, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2,
  CalendarDays, Shield, ShieldAlert, Zap, FileText, ExternalLink,
  RefreshCw, Trash2, Ban, Unlock, Star, MessageCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  gymId: string
  gymName: string
}

interface SubDetail {
  gym: any
  owner: any
  pendingRequest: any
  lastApprovedRequest: any
  timeline: any[]
  usageStats: any
}

type PlanType = 'monthly' | 'yearly' | 'lifetime'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  trial: { label: 'Trial', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  active: { label: 'Active', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  expired: { label: 'Expired', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  suspended: { label: 'Suspended', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
}

export default function SubscriptionPanel({ gymId, gymName }: Props) {
  const [data, setData] = useState<SubDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Quick action state
  const [activatePlan, setActivatePlan] = useState<PlanType>('monthly')
  const [trialDays, setTrialDays] = useState('7')
  const [rejectReason, setRejectReason] = useState('')
  const [approvePlan, setApprovePlan] = useState<PlanType>('monthly')

  async function fetchDetail() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/gyms/${gymId}/subscription/detail`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch {
      toast.error('Failed to load subscription data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDetail() }, [gymId])

  async function callAction(endpoint: string, body: object, successMsg: string) {
    setActionLoading(endpoint)
    try {
      const res = await fetch(`/api/admin/gyms/${gymId}/subscription/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success(successMsg)
      fetchDetail()
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  if (!data) return <div className="text-slate-500 text-sm text-center py-8">Unable to load subscription data.</div>

  const { gym, pendingRequest, lastApprovedRequest, timeline } = data
  const badge = STATUS_BADGE[gym.subscription_status] ?? STATUS_BADGE.expired

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="admin-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Subscription Status</h2>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Plan</p>
            <p className="font-bold text-white capitalize">{gym.plan_type || 'None'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Started</p>
            <p className="font-medium text-slate-300">
              {gym.subscription_started_at ? new Date(gym.subscription_started_at).toLocaleDateString('en-IN') : gym.trial_started_at ? new Date(gym.trial_started_at).toLocaleDateString('en-IN') : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Expires</p>
            <p className="font-medium text-slate-300">
              {gym.subscription_ends_at ? new Date(gym.subscription_ends_at).toLocaleDateString('en-IN') : gym.trial_ends_at ? new Date(gym.trial_ends_at).toLocaleDateString('en-IN') : 'Never (Lifetime)'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">VIP</p>
            <p className="font-medium text-slate-300">{gym.is_vip ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>

      {/* Pending Payment Request */}
      {pendingRequest && (
        <div className="admin-card p-5 border-amber-500/30">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-300">Pending Payment Proof</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-xs text-slate-500">Transaction ID</p>
              <p className="font-mono text-slate-300">{pendingRequest.transaction_id || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Submitted</p>
              <p className="text-slate-300">{new Date(pendingRequest.submitted_at).toLocaleString('en-IN')}</p>
            </div>
            {pendingRequest.notes && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500">Notes</p>
                <p className="text-slate-300 text-xs">{pendingRequest.notes}</p>
              </div>
            )}
          </div>

          {pendingRequest.uploaded_file_url && (
            <a href={pendingRequest.uploaded_file_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 mb-4">
              <FileText className="w-3.5 h-3.5" /> View Payment Proof <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#1f2937]">
            <select value={approvePlan} onChange={e => setApprovePlan(e.target.value as PlanType)}
              className="admin-input w-40 text-xs py-1.5">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="lifetime">Lifetime</option>
            </select>
            <button
              onClick={() => callAction('payment/approve', { request_id: pendingRequest.id, plan: approvePlan }, 'Payment approved!')}
              disabled={!!actionLoading}
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'payment/approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Approve
            </button>

            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Rejection reason..."
              className="admin-input flex-1 min-w-[150px] text-xs py-1.5" />
            <button
              onClick={() => {
                if (!rejectReason.trim()) { toast.error('Reason required'); return }
                callAction('payment/reject', { request_id: pendingRequest.id, rejection_reason: rejectReason }, 'Payment rejected')
              }}
              disabled={!!actionLoading}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'payment/reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="admin-card p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-400" /> Quick Actions
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Activate Plan */}
          <div className="bg-[#0F172A] rounded-xl p-4 border border-[#1f2937] space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Activate Plan</p>
            <div className="flex items-center gap-2">
              <select value={activatePlan} onChange={e => setActivatePlan(e.target.value as PlanType)}
                className="admin-input flex-1 text-xs py-1.5">
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </select>
              <button
                onClick={() => callAction('activate', { plan: activatePlan }, `${activatePlan} plan activated!`)}
                disabled={!!actionLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                {actionLoading === 'activate' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Activate'}
              </button>
            </div>
          </div>

          {/* Trial Management */}
          <div className="bg-[#0F172A] rounded-xl p-4 border border-[#1f2937] space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trial Management</p>
            <div className="flex items-center gap-2">
              <input type="number" value={trialDays} onChange={e => setTrialDays(e.target.value)}
                className="admin-input w-16 text-xs py-1.5 text-center" min="1" max="90" />
              <span className="text-xs text-slate-500">days</span>
              <button
                onClick={() => callAction('trial', { action: 'extend', days: parseInt(trialDays) || 7 }, `Trial extended by ${trialDays} days`)}
                disabled={!!actionLoading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                Extend
              </button>
              <button
                onClick={() => callAction('trial', { action: 'reset' }, 'Trial reset to 14 days')}
                disabled={!!actionLoading}
                className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Expire */}
          <div className="bg-[#0F172A] rounded-xl p-4 border border-[#1f2937] space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expire Subscription</p>
            <button
              onClick={() => {
                if (!confirm(`Expire subscription for "${gymName}"?`)) return
                callAction('expire', {}, 'Subscription expired')
              }}
              disabled={!!actionLoading}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Clock className="w-3 h-3" /> Mark as Expired
            </button>
          </div>

          {/* Danger Zone */}
          <div className="bg-[#0F172A] rounded-xl p-4 border border-red-900/30 space-y-3">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Danger Zone</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (!confirm(`Ban "${gymName}"? They will be logged out immediately.`)) return
                  callAction('danger', { action: 'ban' }, 'Account banned')
                }}
                disabled={!!actionLoading}
                className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Ban className="w-3 h-3" /> Ban
              </button>
              <button
                onClick={() => callAction('danger', { action: 'unban' }, 'Account unbanned')}
                disabled={!!actionLoading}
                className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Unlock className="w-3 h-3" /> Unban
              </button>
              <button
                onClick={() => {
                  if (!confirm(`PERMANENTLY DELETE "${gymName}" and ALL its data? This cannot be undone.`)) return
                  if (!confirm(`FINAL WARNING: Type the gym name to confirm deletion.`)) return
                  callAction('danger', { action: 'delete_gym' }, 'Gym deleted')
                }}
                disabled={!!actionLoading}
                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Delete Gym
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Timeline */}
      {timeline.length > 0 && (
        <div className="admin-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-indigo-400" /> Audit Timeline
          </h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {timeline.slice(0, 20).map((entry: any, i: number) => (
              <div key={entry.id || i} className="flex items-start gap-3 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 font-medium">{entry.action}</p>
                  {entry.notes && <p className="text-slate-500 mt-0.5 truncate">{entry.notes}</p>}
                  <p className="text-slate-600 mt-0.5">
                    {new Date(entry.created_at).toLocaleString('en-IN')} &middot; {entry.performed_by}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
