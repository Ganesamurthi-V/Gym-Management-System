import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface MetricCardItem {
  icon: LucideIcon
  label: string
  value: string
  badge?: { text: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' }
  footnote?: string
  /** 0-100, renders a shadcn Progress bar */
  progress?: number
  href?: string
}

function MetricCard({ item }: { item: MetricCardItem }) {
  const { icon: Icon, label, value, badge, footnote, progress, href } = item

  const card = (
    <Card className={cn(href && 'hover:border-foreground/20 h-full transition-colors')}>
      <CardHeader>
        <CardTitle>
          <div className="bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-lg border">
            <Icon className="size-4" />
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-3xl leading-none font-medium tracking-tight tabular-nums">{value}</div>
          {badge && <Badge variant={badge.variant}>{badge.text}</Badge>}
        </div>
        {progress !== undefined && (
          <Progress value={Math.min(100, Math.max(0, progress))} className="my-1" />
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
