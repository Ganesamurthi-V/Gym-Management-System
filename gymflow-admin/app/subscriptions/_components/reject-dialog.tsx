'use client'

import { Loader2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { SubscriptionRequest } from './types'

export function RejectDialog({
  req,
  reason,
  busy,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  req: SubscriptionRequest | null
  reason: string
  busy: boolean
  onReasonChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={!!req} onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject payment</DialogTitle>
          <DialogDescription>{req?.gyms?.name ?? 'Unknown Gym'}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
          placeholder="Rejection reason (required)..."
          rows={3}
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <XCircle />}
            Confirm Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
