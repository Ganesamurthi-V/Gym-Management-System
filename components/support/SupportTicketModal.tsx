'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send, Loader2, X, AlertCircle, LifeBuoy, MessageSquareHeart, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

type Tab = 'support' | 'feedback'

/*
  Contact & feedback in one place.

  Two tabs share a single modal and a single API (/api/support/ticket):
    - Support: the original ticket form (category + subject + details).
    - Feedback: a friendlier, lower-effort form — a 1-5 star rating, an optional
      "what's this about" chip, and an optional comment. It posts with
      type='feedback' and a rating, which the API stores on the same
      support_tickets row so the team sees tickets and feedback together.

  Feedback deliberately asks for as little as possible: a rating alone is a valid
  submission, so leaving a quick reaction never feels like filing a ticket.
*/

/** Optional "what is this feedback about" chips. The chosen one becomes the subject. */
const FEEDBACK_TOPICS = [
  { value: 'Love it', label: 'Love it', emoji: '😍' },
  { value: 'Suggestion', label: 'Suggestion', emoji: '💡' },
  { value: 'Missing feature', label: 'Missing feature', emoji: '🧩' },
  { value: 'Something confusing', label: 'Confusing', emoji: '🤔' },
] as const

const RATING_HINTS: Record<number, string> = {
  1: 'Not good — sorry to hear that',
  2: 'Could be better',
  3: "It's okay",
  4: 'Pretty good!',
  5: 'Love it — thank you!',
}

export default function SupportTicketModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('support')

  // Support form
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState('query')

  // Feedback form
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [topic, setTopic] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')

  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Portal target only exists on the client. Gate on mount so SSR renders nothing
  // and createPortal never runs against an undefined document.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Lock body scroll while the modal is open so the page behind it can't scroll.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen || !mounted) return null

  function resetAndClose() {
    setSubject('')
    setMessage('')
    setType('query')
    setRating(0)
    setHoverRating(0)
    setTopic('')
    setFeedbackComment('')
    setTab('support')
    onClose()
  }

  async function submitSupport(e: React.FormEvent) {
    e.preventDefault()
    if (!subject || !message) return

    setLoading(true)
    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, type }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to submit ticket')

      toast.success('Support ticket submitted. We will get back to you soon!')
      resetAndClose()
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit ticket')
    } finally {
      setLoading(false)
    }
  }

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1) {
      toast.error('Please pick a star rating first')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'feedback',
          rating,
          // The chip becomes the subject so the team can scan feedback at a glance.
          subject: topic || undefined,
          message: feedbackComment.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to send feedback')

      toast.success('Thanks for the feedback! It really helps us improve.')
      resetAndClose()
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to send feedback')
    } finally {
      setLoading(false)
    }
  }

  const activeStars = hoverRating || rating

  /*
    Rendered through a body portal, not inline where it is mounted.

    The header trigger lives inside a sticky, backdrop-blurred header. A sticky
    ancestor (and backdrop-filter) establishes a containing block, so a
    `position: fixed` overlay nested under it resolves against the HEADER rather
    than the viewport — which is why the modal opened pinned to the top of the
    header and overflowed off-screen. Portalling to document.body makes `fixed`
    resolve against the viewport, so the modal is perfectly centred no matter
    which trigger (header button or support page) opened it.
  */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={resetAndClose}
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 flex max-h-[90vh] flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Contact support and feedback"
      >
        {/* ── Header (fixed) ── */}
        <div className="flex flex-shrink-0 items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center">
              {tab === 'support' ? <LifeBuoy className="w-5 h-5" /> : <MessageSquareHeart className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {tab === 'support' ? 'Contact Support' : 'Share Feedback'}
              </h3>
              <p className="text-sm text-slate-500">
                {tab === 'support'
                  ? 'Send us a query, report a bug, or ask for help.'
                  : "Tell us how we're doing — it takes a few seconds."}
              </p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Tabs (fixed) ── */}
        <div className="flex-shrink-0 px-5 pt-4">
          <div
            role="tablist"
            aria-label="Contact or feedback"
            className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {(
              [
                { id: 'support' as const, label: 'Contact support', Icon: LifeBuoy },
                { id: 'feedback' as const, label: 'Give feedback', Icon: MessageSquareHeart },
              ]
            ).map(({ id, label, Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-surface text-brand-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Scrollable body ──
            The forms live here so a modal taller than the viewport scrolls
            internally instead of the whole card overflowing (which pushed the
            header and tabs off the top of the screen at short window heights). */}
        <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── Support tab ── */}
        {tab === 'support' && (
          <form onSubmit={submitSupport} className="p-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                What can we help you with?
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              >
                <option value="query">General Query</option>
                <option value="issue">Technical Issue</option>
                <option value="bug">Report a Bug</option>
                <option value="high_priority">High Priority / Urgent Help</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief summary of your issue..."
                required
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Message Details
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Please provide as much detail as possible..."
                required
                rows={5}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all resize-none"
              />
            </div>

            {type === 'high_priority' && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  <strong>High Priority:</strong> Please only use this for critical issues like system downtime or severe data errors.
                </p>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetAndClose}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !subject || !message}
                className="px-5 py-2.5 bg-brand-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loading ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
          </form>
        )}

        {/* ── Feedback tab ── */}
        {tab === 'feedback' && (
          <form onSubmit={submitFeedback} className="p-5 space-y-5">
            {/* Star rating */}
            <div className="text-center">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                How is your experience with GymFlow?
              </label>
              <div
                className="flex items-center justify-center gap-1.5"
                role="radiogroup"
                aria-label="Rating out of 5"
                onMouseLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map(star => {
                  const filled = star <= activeStars
                  return (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={rating === star}
                      aria-label={`${star} star${star > 1 ? 's' : ''}`}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      className="p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-lg"
                    >
                      <Star
                        className={`w-9 h-9 transition-colors ${
                          filled ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'
                        }`}
                      />
                    </button>
                  )
                })}
              </div>
              {/* Reserve the hint line so the layout doesn't jump between ratings. */}
              <p className="mt-2 h-5 text-sm font-medium text-slate-600">
                {activeStars ? RATING_HINTS[activeStars] : 'Tap a star to rate'}
              </p>
            </div>

            {/* Topic chips */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                What&apos;s this about? <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_TOPICS.map(t => {
                  const active = topic === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={active}
                      // Toggle off if the same chip is tapped again.
                      onClick={() => setTopic(active ? '' : t.value)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span aria-hidden>{t.emoji}</span>
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Optional comment */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Anything you&apos;d like to add? <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <textarea
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value)}
                placeholder="Tell us what you love, or what we could do better..."
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetAndClose}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || rating < 1}
                className="px-5 py-2.5 bg-brand-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareHeart className="w-4 h-4" />}
                {loading ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>,
    document.body
  )
}
