'use client'

import { HeadphonesIcon, Loader2, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Gym } from './types'

export function ComposeForm({
  gyms,
  loading,
  sending,
  selectedGym,
  subject,
  body,
  type,
  onGymChange,
  onSubjectChange,
  onBodyChange,
  onTypeChange,
  onSubmit,
}: {
  gyms: Gym[]
  loading: boolean
  sending: boolean
  selectedGym: string
  subject: string
  body: string
  type: string
  onGymChange: (v: string) => void
  onSubjectChange: (v: string) => void
  onBodyChange: (v: string) => void
  onTypeChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit}>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeadphonesIcon className="size-4" /> New Message
          </CardTitle>
          <CardDescription>Broadcast updates, warnings, or support replies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="support-gym">Select Recipient Gym</Label>
            <Select value={selectedGym} onValueChange={onGymChange} disabled={loading} required>
              <SelectTrigger id="support-gym" className="w-full">
                <SelectValue placeholder="-- Select a gym --" />
              </SelectTrigger>
              <SelectContent>
                {gyms.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name} ({g.owner?.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="support-subject">Message Subject</Label>
              <Input
                id="support-subject"
                type="text"
                value={subject}
                onChange={e => onSubjectChange(e.target.value)}
                placeholder="e.g. Action Required: Subscription Renewal"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-type">Message Type</Label>
              <Select value={type} onValueChange={onTypeChange}>
                <SelectTrigger id="support-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Information</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Critical Error</SelectItem>
                  <SelectItem value="success">Success Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-body">Message Body</Label>
            <Textarea
              id="support-body"
              value={body}
              onChange={e => onBodyChange(e.target.value)}
              placeholder="Write your message here. The gym owner will see this on their dashboard notifications..."
              required
              rows={6}
              className="resize-none"
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={sending || !selectedGym || !subject || !body}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? 'Sending...' : 'Send Message'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
