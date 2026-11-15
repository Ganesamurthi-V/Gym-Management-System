import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export type MetricTone = 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'sky' | 'neutral'

// Full class strings so Tailwind can see them. Tones map to the semantic tokens in globals.css.
const TILE: Record<MetricTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  blue: 'border-primary/20 bg-primary/10 text-primary',
  emerald: 'border-success/20 bg-success/10 text-success',
  amber: 'border-warning/20 bg-warning/10 text-warning',
  red: 'border-destructive/20 bg-destructive/10 text-destructive',
  violet: 'border-violet/20 bg-violet/10 text-violet',
  sky: 'border-info/20 bg-info/10 text-info',
}

const VALUE: Record<MetricTone, string> = {
  neutral: '',
  blue: 'text-primary',
  emerald: 'text-success',
  amber: 'text-warning',
  red: 'text-destructive',
  violet: 'text-violet',
  sky: 'text-info',
}

const BAR: Record<MetricTone, string> = {
  neutral: '',
  blue: 'bg-primary',
  emerald: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
  violet: 'bg-violet',
  sky: 'bg-info',
}

export interface MetricCardItem {
  icon: LucideIcon
  label: string
  value: string
  badge?: { text: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' }
  footnote?: string
  /** 0-100, renders a shadcn Progress bar */
  progress?: number
  href?: string
  /** Tints the icon tile (and the progress bar). Default neutral. */
  tone?: MetricTone
  /** Colours the big number. Default neutral. */
  valueTone?: MetricTone
  /** Overrides the progress bar colour (defaults to `tone`). */
  progressTone?: MetricTone
}

function MetricCard({ item }: { item: MetricCardItem }) {
  const { icon: Icon, label, value, badge, footnote, progress, href, tone = 'neutral', valueTone = 'neutral', progressTone } = item

  const card = (
    <Card className={cn(href && 'hover:border-foreground/20 h-full transition-colors')}>
      <CardHeader>
        <CardTitle>
          <div className={cn('flex size-7 items-center justify-center rounded-lg border', TILE[tone])}>
            <Icon className="size-4" />
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn('text-3xl leading-none font-medium tracking-tight tabular-nums', VALUE[valueTone])}>{value}</div>
          {badge && <Badge variant={badge.variant}>{badge.text}</Badge>}
        </div>
        {progress !== undefined && (
          <Progress
            value={Math.min(100, Math.max(0, progress))}
            className="my-1"
            indicatorClassName={BAR[progressTone ?? tone]}
          />
        )}
        {footnote && <p className="text-muted-foreground text-sm">{footnote}</p>}
      </CardContent>
    </Card>
  )

  if (!href) return card
  return (
    <Link href={href} prefetch={false} className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3">
      {card}
    </Link>
  )
}

export function MetricCards({ items, className }: { items: MetricCardItem[]; className?: string }) {
  return (
    <div
      className={cn(
        '*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <MetricCard key={item.label} item={item} />
      ))}
    </div>
  )
}
