'use client'

import { useEffect, useRef, useState } from 'react'
import { Star, X, Send, Loader2, MessageSquareHeart } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api/client'
import { isTourActive } from '@/lib/tours/tour-state'
import { cn } from '@/lib/utils'

/**
 * The feedback pop-up for new gym owners.
 *
 * Whether it appears is decided on the server (GET /api/feedback-prompt, rule in
 * lib/feedback-prompt.ts): during the gym's first 30 days, once onboarding is finished, at most
 * every 3 days, and never again after the owner has sent feedback. This component only asks,
 * waits a little, and shows the card.
 *
 *   - The wait (a few seconds after the page opens) keeps it from landing on top of the page
 *     the owner just arrived at.
 *   - It is skipped while a guided tour is on screen, so the two never fight for attention.
 *   - "Not now" just closes it. It was already recorded as shown when it appeared, so the next
 *     ask is three days later.
 *   - Sending feedback posts to the same endpoint as the Support menu's Give feedback tab, so
 *     the team sees it in the same place and the server stops asking.
 */

const SHOW_DELAY_MS = 8_000

const RATING_HINTS: Record<number, string> = {
  1: 'Not good. Sorry to hear that',
  2: 'Could be better',
  3: "It's okay",
  4: 'Pretty good!',
  5: 'Love it. Thank you!',
}

export default function FeedbackPrompt() {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const asked = useRef(false)

  // Ask once per page load, after the delay.
  useEffect(() => {
    if (asked.current) return
    asked.current = true

    const timer = window.setTimeout(async () => {
      if (isTourActive()) return
      try {
        const res = await api.get<{ data: { show: boolean } }>('/api/feedback-prompt')
        if (!res.data?.show) return
        setOpen(true)
        // Recorded when it appears, so closing the tab without touching it still starts the wait.
        void api.post('/api/feedback-prompt', { action: 'shown' }).catch(() => {})
      } catch {
        // No pop-up is better than a broken page: stay quiet if the check fails.
      }
    }, SHOW_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [])

  if (!open) return null

  async function send() {
    if (rating < 1 || sending) return
    setSending(true)
    try {
      await api.post('/api/support/ticket', {
        type: 'feedback',
        rating,
        message: comment.trim(),
      })
      toast.success('Thank you! Your feedback really helps us improve.')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your feedback')
    } finally {
      setSending(false)
    }
  }

  const shown = hover || rating

  return (
    <div
      role="dialog"
      aria-label="Share your feedback"
      // Above the mobile bottom navigation, in the corner on larger screens.
      className="fixed inset-x-3 bottom-20 z-50 md:inset-x-auto md:bottom-6 md:right-6 md:w-[22rem]"
    >
      <div className="rounded-2xl border border-surface-border bg-surface-card p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <MessageSquareHeart className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">How is GymFlow working for you?</p>
            <p className="mt-0.5 text-xs text-slate-500">It takes ten seconds and tells us what to improve.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={rating === n}
              className="rounded-md p-1 transition-transform hover:scale-110"
            >
              <Star className={cn('h-8 w-8', n <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
            </button>
          ))}
        </div>
        <p className="mt-1 h-4 text-center text-xs font-medium text-slate-500">{shown ? RATING_HINTS[shown] : ''}</p>

        {rating > 0 && (
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Anything you'd like us to know? (optional)"
            className="mt-2 w-full resize-none rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => { void send() }}
            disabled={rating < 1 || sending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
