'use client'

import { useState, useEffect } from 'react'
import { Megaphone, Loader2, Send, PowerOff, X } from 'lucide-react'
import toast from 'react-hot-toast'

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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Announcements</h1>
        <p className="text-slate-500 text-sm mt-0.5">One site-wide strip shown at the top of every gym owner&apos;s app</p>
      </div>

      <div className="admin-card p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#1f2937]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {loading ? 'Loading...' : live?.is_active ? 'Currently live' : 'Currently off'}
              </h2>
              <p className="text-xs text-slate-400">
                {live && live.updated_at
                  ? `Version ${live.version}, last updated ${new Date(live.updated_at).toLocaleString()}`
                  : 'Never published'}
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 text-xs font-bold rounded-md uppercase tracking-wider border ${
            live?.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}>
            {live?.is_active ? 'Active' : 'Off'}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Message</label>
            <span className={`text-xs font-semibold ${overLimit ? 'text-red-400' : nearLimit ? 'text-amber-400' : 'text-slate-500'}`}>
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            disabled={loading}
            placeholder="e.g. We are investigating a technical issue. Follow the status page for updates."
            className="admin-input resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Level</label>
          <select value={level} onChange={e => setLevel(e.target.value as Level)} className="admin-input" disabled={loading}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <p className="text-xs text-slate-500 mt-1.5">Critical cannot be closed by owners.</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link URL (optional)</label>
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://status.gymflow.sbs"
              className="admin-input"
              disabled={loading}
            />
            {linkError && <p className="text-xs text-red-400 mt-1.5">{linkError}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link label</label>
            <input
              type="text"
              value={linkLabel}
              onChange={e => setLinkLabel(e.target.value.slice(0, LABEL_MAX))}
              placeholder="Learn more"
              className="admin-input"
              disabled={loading || !linkTrim}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Text after the link (optional)</label>
            <span className="text-xs font-semibold text-slate-500">{messageAfter.length}/{AFTER_MAX}</span>
          </div>
          <input
            type="text"
            value={messageAfter}
            onChange={e => setMessageAfter(e.target.value.slice(0, AFTER_MAX))}
            className="admin-input"
            disabled={loading}
          />
          <p className="text-xs text-slate-500 mt-1.5">Shown after the link, on the same line.</p>
        </div>

        <div className="pt-4 border-t border-[#1f2937] flex justify-end gap-3">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={!!saving || loading || !live?.is_active}
            className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving === 'off' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />}
            Turn off
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={!canPublish || loading}
            className="admin-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {saving === 'publish' ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="admin-card p-6 space-y-3">
        <h2 className="text-base font-semibold text-white">How owners will see it</h2>
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
      </div>
    </div>
  )
}
