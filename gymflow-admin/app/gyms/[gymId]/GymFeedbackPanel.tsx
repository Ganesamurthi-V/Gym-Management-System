'use client'

import { useState, useEffect } from 'react'
import { Star, MessageCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  gymId: string
}

type Feedback = {
  id: string
  subject: string
  message: string
  rating: number | null
  created_at: string
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`w-4 h-4 ${n <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`}
        />
      ))}
    </span>
  )
}

export default function GymFeedbackPanel({ gymId }: Props) {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/support/tickets?gymId=${gymId}&type=feedback`)
        if (!res.ok) throw new Error('Failed to fetch')
        const json = await res.json()
        if (!cancelled) setFeedback(Array.isArray(json) ? json : [])
      } catch {
        if (!cancelled) toast.error('Failed to load feedback')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [gymId])

  // Only rows that actually carry a star rating count toward the average.
  const rated = feedback.filter(f => f.rating != null)
  const avg = rated.length
    ? rated.reduce((sum, f) => sum + (f.rating ?? 0), 0) / rated.length
    : null

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-semibold text-white">Owner Feedback</h2>
        </div>
        {avg != null && (
          <div className="flex items-center gap-1.5">
            <StarRow rating={Math.round(avg)} />
            <span className="text-sm font-bold text-amber-400">{avg.toFixed(1)}</span>
            <span className="text-xs text-slate-500">({rated.length})</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
      ) : feedback.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">No feedback submitted by this gym yet.</p>
      ) : (
        <div className="space-y-3">
          {feedback.map(f => (
            <div key={f.id} className="p-4 bg-[#0F172A] rounded-xl border border-[#1f2937]">
              <div className="flex items-center justify-between gap-3 mb-2">
                {f.rating != null ? <StarRow rating={f.rating} /> : <span className="text-xs text-slate-500">No rating</span>}
                <span className="text-xs text-slate-500">
                  {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {f.subject && <h3 className="text-sm font-semibold text-white mb-1">{f.subject}</h3>}
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{f.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
