'use client'

import { CheckCircle2, Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Ticket } from './types'

export function ResolveDialog({
  ticket,
  subject,
  message,
  drafting,
  resolving,
  needsHuman,
  onSubjectChange,
  onMessageChange,
  onAiDraft,
  onSubmit,
  onCancel,
}: {
  ticket: Ticket | null
  subject: string
  message: string
  drafting: boolean
  resolving: boolean
  needsHuman: boolean
  onSubjectChange: (v: string) => void
  onMessageChange: (v: string) => void
  onAiDraft: () => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}) {
  return (
    <Dialog open={!!ticket} onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Ticket</DialogTitle>
          <DialogDescription>Send a confirmation message to {ticket?.gyms?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onAiDraft} disabled={drafting || resolving}>
              {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {drafting ? 'Writing...' : 'AI draft'}
            </Button>
            {needsHuman && (
              <span className="text-muted-foreground text-xs">Needs a personal reply: review before sending</span>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reply-subject">Reply Subject</Label>
            <Input
              id="reply-subject"
              type="text"
              value={subject}
              onChange={e => onSubjectChange(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reply-message">Reply Message</Label>
            <Textarea
              id="reply-message"
              value={message}
              onChange={e => onMessageChange(e.target.value)}
              required
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={resolving || !subject || !message}>
              {resolving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {resolving ? 'Resolving...' : 'Resolve & Send'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
