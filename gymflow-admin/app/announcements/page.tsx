'use client'

import { useState, useEffect } from 'react'
import { Megaphone, Loader2, Send, PowerOff, X } from 'lucide-react'
import { toast } from 'sonner'

import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Level = 'info' | 'warning' | 'critical'
type Announcement = {
  message: string
  level: Level
  link_url: string | null
  link_label: string | null
  message_after: string
  is_active: boolean
  version: number
  updated_at: string | null
}

const MESSAGE_MAX = 200
const LABEL_MAX = 30
const AFTER_MAX = 120

// Literal hex so the preview matches the owner app regardless of this app's dark theme.
const LEVEL_STYLE: Record<Level, { bg: string; border: string; text: string }> = {
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E3A8A' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  critical: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
}

export default function AnnouncementsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'publish' | 'off' | null>(null)
  const [message, setMessage] = useState('')
  const [level, setLevel] = useState<Level>('info')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [messageAfter, setMessageAfter] = useState('')
  const [live, setLive] = useState<Announcement | null>(null)

  function apply(a: Announcement) {
    setLive(a)
    setMessage(a.message)
    setLevel(a.level)
    setLinkUrl(a.link_url ?? '')
    setLinkLabel(a.link_label ?? '')
    setMessageAfter(a.message_after ?? '')
  }

  useEffect(() => {
    fetch('/api/announcements')
      .then(async res => {
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.announcement) throw new Error(data?.error || 'Failed to load')
        apply(data.announcement)
      })
      .catch(e => toast.error(e.message || 'Failed to load announcement'))
      .finally(() => setLoading(false))
  }, [])

  const linkTrim = linkUrl.trim()
  const linkError = linkTrim && !/^https:\/\/\S+$/i.test(linkTrim) ? 'Link must start with https://' : ''
  const nearLimit = message.length > MESSAGE_MAX - 20
  const overLimit = message.length > MESSAGE_MAX
  const canPublish = !!message.trim() && !overLimit && !linkError && !saving

  async function save(isActive: boolean) {
    setSaving(isActive ? 'publish' : 'off')
    try {
      const res = await fetch('/api/announcements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          level,
          link_url: linkTrim || null,
          link_label: linkLabel.trim() || null,
          message_after: messageAfter,
          is_active: isActive,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.announcement) throw new Error(data?.error || 'Failed to save')
      apply(data.announcement)
      toast.success(isActive ? 'Announcement published to all gym owners' : 'Announcement turned off')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save announcement')
    } finally {
      setSaving(null)
    }
  }

  const style = LEVEL_STYLE[level]

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Announcements"
        description="One site-wide strip shown at the top of every gym owner's app"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-4" />
              {loading ? 'Loading...' : live?.is_active ? 'Currently live' : 'Currently off'}
            </CardTitle>
            <CardDescription>
              {live && live.updated_at
                ? `Version ${live.version}, last updated ${new Date(live.updated_at).toLocaleString()}`
                : 'Never published'}
            </CardDescription>
            <CardAction>
              <StatusBadge tone={live?.is_active ? 'success' : 'neutral'}>
                {live?.is_active ? 'Active' : 'Off'}
              </StatusBadge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ann-message">Message</Label>
                <span
                  className={cn(
                    'text-xs font-medium',
                    overLimit ? 'text-destructive' : 'text-muted-foreground',
                    nearLimit && !overLimit && 'text-foreground',
                  )}
                >
                  {message.length}/{MESSAGE_MAX}
                </span>
              </div>
              <Textarea
                id="ann-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                disabled={loading}
                placeholder="e.g. We are investigating a technical issue. Follow the status page for updates."
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ann-level">Level</Label>
              <Select value={level} onValueChange={v => setLevel(v as Level)} disabled={loading}>
                <SelectTrigger id="ann-level" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">Critical cannot be closed by owners.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ann-link">Link URL (optional)</Label>
                <Input
                  id="ann-link"
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://status.thegymflow.in"
                  disabled={loading}
                />
                {linkError && <p className="text-destructive text-xs">{linkError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-label">Link label</Label>
                <Input
                  id="ann-label"
                  type="text"
                  value={linkLabel}
                  onChange={e => setLinkLabel(e.target.value.slice(0, LABEL_MAX))}
                  placeholder="Learn more"
                  disabled={loading || !linkTrim}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ann-after">Text after the link (optional)</Label>
                <span className="text-muted-foreground text-xs font-medium">{messageAfter.length}/{AFTER_MAX}</span>
              </div>
              <Input
                id="ann-after"
                type="text"
                value={messageAfter}
                onChange={e => setMessageAfter(e.target.value.slice(0, AFTER_MAX))}
                disabled={loading}
              />
              <p className="text-muted-foreground text-xs">Shown after the link, on the same line.</p>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => save(false)}
              disabled={!!saving || loading || !live?.is_active}
            >
              {saving === 'off' ? <Loader2 className="animate-spin" /> : <PowerOff />}
              Turn off
            </Button>
            <Button type="button" onClick={() => save(true)} disabled={!canPublish || loading}>
              {saving === 'publish' ? <Loader2 className="animate-spin" /> : <Send />}
              {saving === 'publish' ? 'Publishing...' : 'Publish'}
            </Button>
          </CardFooter>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>How owners will see it</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Always the light look. Faux page top: the strip is the first child, a decorative skeleton header sits beneath it.
                The strip mirrors the owner banner: centered content, X absolutely at the right edge so the text stays centered. */}
            <div className="rounded-xl overflow-hidden border" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
              <div
                className="relative flex items-center justify-center px-10 py-2 border-b text-sm font-medium text-center"
                style={{ background: style.bg, borderColor: style.border, color: style.text }}
              >
                <span className="min-w-0 break-words">
                  {message.trim() ? (
                    <>
                      {message}
                      {linkTrim && !linkError && (
                        <span className="underline ml-1">{linkLabel.trim() || 'Learn more'}</span>
                      )}
                      {messageAfter.trim() && <span className="ml-1">{messageAfter.trim()}</span>}
                    </>
                  ) : (
                    <span style={{ opacity: 0.6 }}>Your message appears here</span>
                  )}
                </span>
                {level !== 'critical' && <X className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2" aria-hidden />}
              </div>
              <div className="flex items-center gap-3 px-4 py-3" aria-hidden>
                <div className="h-6 w-6 rounded-full" style={{ background: '#E2E8F0' }} />
                <div className="h-3 w-28 rounded" style={{ background: '#E2E8F0' }} />
                <div className="h-3 w-16 rounded ml-auto" style={{ background: '#E2E8F0' }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
