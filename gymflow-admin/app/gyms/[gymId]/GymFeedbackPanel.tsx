'use client'

import { useState, useEffect } from 'react'
import { Star, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

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
          className={cn('size-4', n <= rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40')}
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4" />
          Owner Feedback
        </CardTitle>
        {avg != null && (
          <CardAction className="flex items-center gap-1.5">
            <StarRow rating={Math.round(avg)} />
            <span className="text-sm font-medium">{avg.toFixed(1)}</span>
            <span className="text-muted-foreground text-xs">({rated.length})</span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : feedback.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No feedback submitted by this gym yet.</p>
        ) : (
          <div className="space-y-3">
            {feedback.map(f => (
              <div key={f.id} className="bg-muted/30 rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  {f.rating != null ? <StarRow rating={f.rating} /> : <span className="text-muted-foreground text-xs">No rating</span>}
                  <span className="text-muted-foreground text-xs">
                    {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {f.subject && <h3 className="mb-1 text-sm font-medium">{f.subject}</h3>}
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
