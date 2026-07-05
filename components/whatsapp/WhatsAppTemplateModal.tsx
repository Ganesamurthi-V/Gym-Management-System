'use client'

/**
 * WhatsAppTemplateModal
 *
 * Sends official Meta-approved template messages via POST /api/whatsapp/send.
 * The access token stays server-side — never exposed to the browser.
 */

import { useState, useEffect } from 'react'
import { X, MessageCircle, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn, formatDate, formatCurrency } from '@/lib/utils'
import type { TemplateId, TemplateContext } from '@/lib/whatsapp/sender'

// ─── Template display metadata ────────────────────────────────────────────────

interface TemplateMeta {
  id: TemplateId
  label: string
  emoji: string
  description: string
  preview: (ctx: TemplateContext) => string
}

function planLabel(plan?: string): string {
  if (!plan) return 'Membership'
  const map: Record<string, string> = {
    monthly:   'Monthly',
    quarterly: 'Quarterly (3 Months)',
    annual:    'Annual (12 Months)',
  }
  return map[plan.toLowerCase()] ?? plan.charAt(0).toUpperCase() + plan.slice(1)
}

const TEMPLATES: TemplateMeta[] = [
  {
    id: 'gymflow_welcome_member',
    label: 'Welcome Member',
    emoji: '🎉',
    description: 'Send when a new member joins',
    preview: (ctx) =>
      `Welcome to ${ctx.gymName}!\n\nHi ${ctx.memberName}, your ${planLabel(ctx.plan)} membership starts on ${ctx.startDate ? formatDate(ctx.startDate) : '—'}. Welcome aboard! 💪`,
  },
  {
    id: 'membership_renewed',
    label: 'Membership Renewed',
    emoji: '✅',
    description: 'Send after a successful renewal',
    preview: (ctx) =>
      `Hi ${ctx.memberName}, your ${planLabel(ctx.plan)} membership at ${ctx.gymName} has been renewed.\nValid until: ${ctx.validUntil ? formatDate(ctx.validUntil) : '—'} 🏋️`,
  },
  {
    id: 'membership_expiry_reminder',
    label: 'Expiry Reminder',
    emoji: '⏰',
    description: 'Send 7, 3 or 1 day before expiry',
    preview: (ctx) =>
      `Hi ${ctx.memberName}, your ${planLabel(ctx.plan)} membership expires on ${ctx.expiryDate ? formatDate(ctx.expiryDate) : '—'} (${ctx.daysRemaining ?? 0} days left). Renew now! ⏰`,
  },
  {
    id: 'membership_expired',
    label: 'Membership Expired',
    emoji: '🔴',
    description: 'Send when membership has expired',
    preview: (ctx) =>
      `Hi ${ctx.memberName}, your ${planLabel(ctx.plan)} membership at ${ctx.gymName} expired on ${ctx.expiryDate ? formatDate(ctx.expiryDate) : '—'}. Renew to get back on track! 💪`,
  },
  {
    id: 'payment_due_reminder',
    label: 'Payment Due',
    emoji: '💰',
    description: 'Send when a member has a pending due',
    preview: (ctx) =>
      `Hi ${ctx.memberName}, you have a pending payment of ${formatCurrency(ctx.dueAmount ?? 0)} at our gym. Please clear your dues at the earliest. 🙏`,
  },
  {
    id: 'birthday_wishes',
    label: 'Birthday Wishes',
    emoji: '🎂',
    description: 'Marketing — send on member\'s birthday',
    preview: (ctx) =>
      `Happy Birthday, ${ctx.memberName}! 🎂\n\nWishing you health & strength from all of us at ${ctx.gymName}. Keep crushing it! 💪🎉`,
  },
]

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Props {
  open: boolean
  onClose: () => void
  context: TemplateContext
  defaultTemplate?: TemplateId
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsAppTemplateModal({ open, onClose, context, defaultTemplate = 'gymflow_welcome_member' }: Props) {
  const [selectedId, setSelectedId] = useState<TemplateId>(defaultTemplate)
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Reset state when modal opens / default changes
  useEffect(() => {
    if (open) {
      setSelectedId(defaultTemplate)
      setStatus('idle')
      setErrorMsg('')
    }
  }, [open, defaultTemplate])

  const selected = TEMPLATES.find(t => t.id === selectedId) ?? TEMPLATES[0]
  const previewText = selected.preview(context)

  async function handleSend() {
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/whatsapp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ templateId: selectedId, context }),
      })

      const data = await res.json() as { success: boolean; error?: string }

      if (!data.success) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Failed to send message')
        return
      }

      setStatus('success')
      setTimeout(onClose, 1500)
    } catch (err) {
      setStatus('error')
      setErrorMsg('Network error — please try again')
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={status === 'sending' ? undefined : onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white rounded-t-3xl shadow-2xl max-h-[90vh]">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Send WhatsApp</h2>
              <p className="text-xs text-slate-400">to {context.memberName} · {context.phone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={status === 'sending'}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-400 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success / Error banners */}
        {status === 'success' && (
          <div className="mx-5 mt-4 flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-emerald-700">Message sent successfully!</p>
          </div>
        )}
        {status === 'error' && (
          <div className="mx-5 mt-4 flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-700">{errorMsg}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Template list */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Choose Template</p>
            <div className="space-y-2">
              {TEMPLATES.map((t) => {
                const active = selectedId === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    disabled={status === 'sending'}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all disabled:opacity-40',
                      active
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span className="text-xl flex-shrink-0">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-bold', active ? 'text-emerald-700' : 'text-slate-800')}>
                        {t.label}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{t.description}</p>
                    </div>
                    {active && (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Message preview (approximate — actual content is from Meta template) */}
          <div className="px-5 pt-2 pb-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Preview</p>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <p className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                Approximate preview — actual message uses your approved Meta template
              </p>
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {previewText}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white">
          <button
            onClick={handleSend}
            disabled={status === 'sending' || status === 'success'}
            className={cn(
              'w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-sm transition-all',
              'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-200',
              'active:scale-[0.98] hover:shadow-emerald-300',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
            )}
          >
            {status === 'sending' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : status === 'success' ? (
              <><CheckCircle2 className="w-4 h-4" /> Sent!</>
            ) : (
              <><MessageCircle className="w-4 h-4" /> Send via WhatsApp <Send className="w-3.5 h-3.5" /></>
            )}
          </button>
        </div>

      </div>
    </>
  )
}
