'use client'

import { CheckCircle2, Star, Trash2, X } from 'lucide-react'

import { StatusBadge, type StatusTone } from '@/components/dashboard/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Ticket } from './types'

export type TicketFilter = 'all' | 'tickets' | 'feedback'

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={cn('size-4', n <= rating ? 'fill-warning text-warning' : 'text-muted-foreground')}
        />
      ))}
      <span className="text-muted-foreground ml-1.5 text-xs font-medium">{rating}.0</span>
    </span>
  )
}

function typeTone(type: string): StatusTone {
  if (type === 'high_priority') return 'critical'
  if (type === 'feedback' || type === 'bug') return 'warning'
  return 'info'
}

export function TicketList({
  tickets,
  filter,
  loading,
  hasResolved,
  onFilterChange,
  onClearResolved,
  onClearOne,
  onResolve,
}: {
  tickets: Ticket[]
  filter: TicketFilter
  loading: boolean
  hasResolved: boolean
  onFilterChange: (f: TicketFilter) => void
  onClearResolved: () => void
  onClearOne: (id: string) => void
  onResolve: (t: Ticket) => void
}) {
  const filtered = tickets.filter(t =>
    filter === 'all' ? true : filter === 'feedback' ? t.type === 'feedback' : t.type !== 'feedback',
  )
  const feedbackCount = tickets.filter(t => t.type === 'feedback').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={v => onFilterChange(v as TicketFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="feedback">
              Feedback
              {feedbackCount > 0 && <span className="text-muted-foreground text-xs">{feedbackCount}</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {hasResolved && (
          <Button variant="ghost" size="sm" onClick={onClearResolved}>
            <Trash2 /> Clear Resolved Tickets
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {filter === 'feedback' ? 'No feedback received yet.' : 'No support tickets found.'}
        </p>
      ) : (
        filtered.map(ticket => {
          const resolved = ticket.status === 'resolved'
          return (
            <Card key={ticket.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={typeTone(ticket.type)}>{ticket.type.replace('_', ' ')}</StatusBadge>
                  <Badge variant={ticket.status === 'resolved' ? 'success' : ticket.status === 'open' ? 'warning' : 'outline'}>{ticket.status}</Badge>
                  {ticket.type === 'feedback' && ticket.rating != null && <StarRating rating={ticket.rating} />}
                </div>
                <CardTitle className={cn(resolved && 'line-through opacity-50')}>{ticket.subject}</CardTitle>
                <CardDescription>
                  From: {ticket.gyms?.name} · {new Date(ticket.created_at).toLocaleString()}
                </CardDescription>
                {ticket.status === 'open' && (
                  <CardAction>
                    <Button variant="outline" size="sm" onClick={() => onResolve(ticket)}>
                      <CheckCircle2 /> Resolve
                    </Button>
                  </CardAction>
                )}
                {resolved && (
                  <CardAction>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onClearOne(ticket.id)}
                      aria-label="Clear ticket"
                      title="Clear ticket"
                    >
                      <X />
                    </Button>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'bg-muted/50 rounded-lg border p-4 text-sm whitespace-pre-wrap break-words',
                    resolved && 'opacity-50',
                  )}
                >
                  {ticket.message}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
