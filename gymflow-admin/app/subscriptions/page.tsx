'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'

import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RequestCard } from './_components/request-card'
import { RejectDialog } from './_components/reject-dialog'
import { defaultPlan, type Filter, type PlanType, type SubscriptionRequest } from './_components/types'

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
    const plan = planMap[req.id] ?? defaultPlan(req)
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
  const rejecting = requests.find(r => r.id === rejectId) ?? null

  return (
    <div className="space-y-6">
      <PageToolbar title="Subscription Requests" description="Review and manage gym payment proofs">
        {pendingCount > 0 && <Badge variant="outline">{pendingCount} pending</Badge>}
        <Button variant="outline" size="icon" onClick={fetchRequests} disabled={loading} aria-label="Refresh">
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </PageToolbar>

      <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
        <TabsList className="max-w-full overflow-x-auto">
          {(['pending', 'approved', 'rejected', 'all'] as Filter[]).map(f => (
            <TabsTrigger key={f} value={f}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pendingCount > 0 && (
                <span className="text-muted-foreground text-xs">{pendingCount}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          No {filter === 'all' ? '' : filter} requests found
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              plan={planMap[req.id] ?? defaultPlan(req)}
              busy={actionLoading === req.id}
              onPlanChange={p => setPlanMap(m => ({ ...m, [req.id]: p }))}
              onApprove={() => handleApprove(req)}
              onReject={() => { setRejectId(req.id); setRejectReason('') }}
            />
          ))}
        </div>
      )}

      <RejectDialog
        req={rejecting}
        reason={rejectReason}
        busy={rejecting ? actionLoading === rejecting.id : false}
        onReasonChange={setRejectReason}
        onConfirm={() => rejecting && handleReject(rejecting)}
        onCancel={() => setRejectId(null)}
      />
    </div>
  )
}
