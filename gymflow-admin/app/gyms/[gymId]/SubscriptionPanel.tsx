'use client'

import { useState, useEffect } from 'react'
import {
  CreditCard, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2,
  CalendarDays, Zap, FileText, ExternalLink, Trash2, Ban, Unlock,
} from 'lucide-react'
import { toast } from 'sonner'
import { isPaidPlan } from '@/lib/plan'

import { StatusBadge, type StatusTone } from '@/components/dashboard/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from './_components/ConfirmDialog'

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
// Approve-only: the add-on never becomes plan_type, it just extends whatsapp_addon_until.
type ApprovePlanType = PlanType | 'whatsapp_addon'

const STATUS_BADGE: Record<string, { label: string; tone: StatusTone }> = {
  trial: { label: 'Trial', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  expired: { label: 'Expired', tone: 'error' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'warning' },
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

function PlanSelect({ value, onChange }: { value: PlanType; onChange: (v: PlanType) => void }) {
  return (
    <Select value={value} onValueChange={v => onChange(v as PlanType)}>
      <SelectTrigger size="sm" className="w-36" aria-label="Plan">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="monthly">Monthly</SelectItem>
        <SelectItem value="yearly">Yearly</SelectItem>
        <SelectItem value="lifetime">Lifetime</SelectItem>
      </SelectContent>
    </Select>
  )
}

export default function SubscriptionPanel({ gymId, gymName }: Props) {
  const [data, setData] = useState<SubDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Quick action state
  const [activatePlan, setActivatePlan] = useState<PlanType>('monthly')
  const [trialDays, setTrialDays] = useState('7')
  const [rejectReason, setRejectReason] = useState('')
  // null = follow the pending request's stored plan_requested; set once the admin picks a plan.
  const [approvePlanChoice, setApprovePlanChoice] = useState<ApprovePlanType | null>(null)
  // Typed gym name for the delete confirmation (was window.prompt).
  const [deleteTyped, setDeleteTyped] = useState('')

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
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (!data) return <div className="text-muted-foreground py-8 text-center text-sm">Unable to load subscription data.</div>

  const { gym, pendingRequest, timeline } = data
  const badge = STATUS_BADGE[gym.subscription_status] ?? STATUS_BADGE.expired
  // The server decides add-on vs plan from the stored request; this only mirrors it in the UI.
  const isAddonRequest = pendingRequest?.plan_requested === 'whatsapp_addon'
  const approvePlan: ApprovePlanType = isAddonRequest
    ? 'whatsapp_addon'
    : approvePlanChoice ?? (pendingRequest?.plan_requested === 'yearly' ? 'yearly' : 'monthly')

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" />
            Subscription Status
          </CardTitle>
          <CardAction>
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Field label="Plan">
              <span className="capitalize">{gym.plan_type || 'None'}</span>
              {gym.whatsapp_addon_until && (
                <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                  WhatsApp add-on {new Date(gym.whatsapp_addon_until) > new Date() ? 'until' : 'expired'} {new Date(gym.whatsapp_addon_until).toLocaleDateString('en-IN')}
                </span>
              )}
            </Field>
            <Field label="Started">
              {gym.subscription_started_at ? new Date(gym.subscription_started_at).toLocaleDateString('en-IN') : gym.trial_started_at ? new Date(gym.trial_started_at).toLocaleDateString('en-IN') : '—'}
            </Field>
            <Field label="Expires">
              {gym.subscription_ends_at ? new Date(gym.subscription_ends_at).toLocaleDateString('en-IN') : gym.trial_ends_at ? new Date(gym.trial_ends_at).toLocaleDateString('en-IN') : 'Never (Lifetime)'}
            </Field>
            <Field label="VIP">{gym.is_vip ? 'Yes' : 'No'}</Field>
          </dl>
        </CardContent>
      </Card>

      {/* Pending Payment Request */}
      {pendingRequest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              Pending Payment Proof
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Transaction ID">
                <span className="font-mono break-all">{pendingRequest.transaction_id || '—'}</span>
              </Field>
              <Field label="Submitted">{new Date(pendingRequest.submitted_at).toLocaleString('en-IN')}</Field>
              {pendingRequest.expected_amount_inr != null && (
                <Field label="Expected">Rs {Number(pendingRequest.expected_amount_inr).toLocaleString('en-IN')}</Field>
              )}
              {pendingRequest.notes && (
                <div className="col-span-2 space-y-1">
                  <dt className="text-muted-foreground text-xs">Notes</dt>
                  <dd className="text-sm">{pendingRequest.notes}</dd>
                </div>
              )}
            </dl>

            {pendingRequest.uploaded_file_url && (
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <a href={pendingRequest.uploaded_file_url} target="_blank" rel="noopener noreferrer">
                  <FileText /> View Payment Proof <ExternalLink />
                </a>
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {isAddonRequest ? (
                <Badge variant="secondary">
                  WhatsApp add-on{pendingRequest.expected_amount_inr != null ? `, ₹${Number(pendingRequest.expected_amount_inr).toLocaleString('en-IN')}` : ''} / 30 days
                </Badge>
              ) : (
                <PlanSelect value={approvePlan as PlanType} onChange={setApprovePlanChoice} />
              )}
              <Button
                size="sm"
                onClick={() => callAction('payment/approve', { request_id: pendingRequest.id, plan: approvePlan }, 'Payment approved!')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'payment/approve' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Approve
              </Button>

              <Input
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Rejection reason..."
                aria-label="Rejection reason"
                className="h-7 min-w-40 flex-1"
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (!rejectReason.trim()) { toast.error('Reason required'); return }
                  callAction('payment/reject', { request_id: pendingRequest.id, rejection_reason: rejectReason }, 'Payment rejected')
                }}
                disabled={!!actionLoading}
              >
                {actionLoading === 'payment/reject' ? <Loader2 className="animate-spin" /> : <XCircle />}
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Activate Plan */}
          <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
            <Label className="text-muted-foreground text-xs uppercase">Activate Plan</Label>
            <div className="flex items-center gap-2">
              <PlanSelect value={activatePlan} onChange={setActivatePlan} />
              <Button
                size="sm"
                onClick={() => callAction('activate', { plan: activatePlan }, `${activatePlan} plan activated!`)}
                disabled={!!actionLoading}
              >
                {actionLoading === 'activate' ? <Loader2 className="animate-spin" /> : 'Activate'}
              </Button>
            </div>
          </div>

          {/* Trial Management: hidden on paid plans, the trial route refuses them (would downgrade the gym) */}
          {!isPaidPlan(gym.plan_type) && (
            <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
              <Label htmlFor="trial-days" className="text-muted-foreground text-xs uppercase">Trial Management</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="trial-days"
                  type="number"
                  value={trialDays}
                  onChange={e => setTrialDays(e.target.value)}
                  className="h-7 w-16 text-center"
                  min="1"
                  max="90"
                />
                <span className="text-muted-foreground text-xs">days</span>
                <Button
                  size="sm"
                  onClick={() => callAction('trial', { action: 'extend', days: parseInt(trialDays) || 7 }, `Trial extended by ${trialDays} days`)}
                  disabled={!!actionLoading}
                >
                  Extend
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => callAction('trial', { action: 'reset' }, 'Trial reset to 14 days')}
                  disabled={!!actionLoading}
                >
                  Reset
                </Button>
              </div>
            </div>
          )}

          {/* Expire */}
          <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
            <Label className="text-muted-foreground text-xs uppercase">Expire Subscription</Label>
            <div>
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="destructive" disabled={!!actionLoading}>
                    <Clock /> Mark as Expired
                  </Button>
                }
                title="Expire subscription"
                description={`Expire subscription for "${gymName}"?`}
                confirmLabel="Expire"
                onConfirm={() => callAction('expire', {}, 'Subscription expired')}
              />
            </div>
          </div>

          {/* Danger Zone */}
          <div className="border-destructive/30 space-y-3 rounded-lg border p-4">
            <Label className="text-destructive text-xs uppercase">Danger Zone</Label>
            <div className="flex flex-wrap gap-2">
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="destructive" disabled={!!actionLoading}>
                    <Ban /> Ban
                  </Button>
                }
                title="Ban gym"
                description={`Ban "${gymName}"? They will be logged out immediately.`}
                confirmLabel="Ban"
                onConfirm={() => callAction('danger', { action: 'ban' }, 'Account banned')}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => callAction('danger', { action: 'unban' }, 'Account unbanned')}
                disabled={!!actionLoading}
              >
                <Unlock /> Unban
              </Button>
              <AlertDialog onOpenChange={() => setDeleteTyped('')}>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={!!actionLoading}>
                    <Trash2 /> Delete Gym
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete gym permanently</AlertDialogTitle>
                    <AlertDialogDescription>
                      {`PERMANENTLY DELETE "${gymName}" and ALL its data? This cannot be undone. FINAL WARNING: Type the gym name "${gymName}" to confirm deletion.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input
                    value={deleteTyped}
                    onChange={e => setDeleteTyped(e.target.value)}
                    placeholder={gymName}
                    aria-label="Type the gym name to confirm"
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => {
                        const typed = deleteTyped
                        if (typed.trim() !== gymName) { toast.error('Name does not match. Deletion cancelled.'); return }
                        callAction('danger', { action: 'delete_gym', confirm_gym_name: typed.trim() }, 'Gym deleted')
                      }}
                    >
                      Delete Gym
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Timeline */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4" />
              Audit Timeline
            </CardTitle>
            <CardDescription>Most recent 20 entries</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-64 space-y-3 overflow-y-auto">
              {timeline.slice(0, 20).map((entry: any, i: number) => (
                <li key={entry.id || i} className="flex items-start gap-3 text-xs">
                  <span className="bg-muted-foreground mt-1.5 size-1.5 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{entry.action}</p>
                    {entry.notes && <p className="text-muted-foreground mt-0.5 truncate">{entry.notes}</p>}
                    <p className="text-muted-foreground mt-0.5">
                      {new Date(entry.created_at).toLocaleString('en-IN')} &middot; {entry.performed_by}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
