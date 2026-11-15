'use client'

import Link from 'next/link'
import { CheckCircle2, ExternalLink, FileText, Loader2, XCircle } from 'lucide-react'

import { StatusBadge, type StatusTone } from '@/components/dashboard/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PLAN_OPTIONS, type PlanType, type SubscriptionRequest } from './types'

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
}

export function RequestCard({
  req,
  plan,
  busy,
  onPlanChange,
  onApprove,
  onReject,
}: {
  req: SubscriptionRequest
  plan: PlanType
  busy: boolean
  onPlanChange: (p: PlanType) => void
  onApprove: () => void
  onReject: () => void
}) {
  const status = STATUS[req.status] ?? STATUS.pending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="min-w-0 truncate">
          <Link href={`/gyms/${req.gym_id}`} className="hover:underline">
            {req.gyms?.name ?? 'Unknown Gym'}
          </Link>
        </CardTitle>
        <CardDescription>
          Submitted{' '}
          {new Date(req.submitted_at).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </CardDescription>
        <CardAction>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {req.expected_amount_inr != null && (
          <p className="text-muted-foreground">
            Expected: <span className="text-foreground font-medium">Rs {req.expected_amount_inr.toLocaleString('en-IN')}</span>
          </p>
        )}
        {req.transaction_id && (
          <p className="text-muted-foreground break-all">
            Txn: <span className="text-foreground font-mono">{req.transaction_id}</span>
          </p>
        )}
        {req.notes && <p className="text-muted-foreground italic">&ldquo;{req.notes}&rdquo;</p>}
        {req.rejection_reason && <p className="text-destructive">Reason: {req.rejection_reason}</p>}
        {req.reviewed_at && (
          <p className="text-muted-foreground">Reviewed {new Date(req.reviewed_at).toLocaleDateString('en-IN')}</p>
        )}
        {req.signedUrl && (
          <a
            href={req.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1.5 font-medium hover:underline"
          >
            <FileText className="size-3.5" /> Proof <ExternalLink className="size-3" />
          </a>
        )}
      </CardContent>
      {req.status === 'pending' && (
        <CardFooter className="flex flex-wrap items-center gap-2">
          {req.plan_requested === 'whatsapp_addon' ? (
            <Badge variant="info">
              WhatsApp add-on{req.expected_amount_inr != null ? `, ₹${req.expected_amount_inr.toLocaleString('en-IN')}` : ''} / 30 days
            </Badge>
          ) : (
            <Select value={plan} onValueChange={v => onPlanChange(v as PlanType)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={onApprove} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Approve
          </Button>
          <Button variant="destructive" onClick={onReject}>
            <XCircle /> Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
