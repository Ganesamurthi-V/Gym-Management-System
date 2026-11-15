import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type StatusTone = 'healthy' | 'success' | 'warning' | 'critical' | 'error' | 'info' | 'unknown' | 'neutral'

const DOT: Record<StatusTone, string> = {
  healthy: 'bg-success',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  error: 'bg-destructive',
  info: 'bg-info',
  unknown: 'bg-muted-foreground',
  neutral: 'bg-muted-foreground',
}

const BADGE: Record<StatusTone, string> = {
  healthy: 'border-success/20 bg-success/10 text-success',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  critical: 'border-destructive/20 bg-destructive/10 text-destructive',
  error: 'border-destructive/20 bg-destructive/10 text-destructive',
  info: 'border-info/20 bg-info/10 text-info',
  unknown: 'text-muted-foreground',
  neutral: 'text-muted-foreground',
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 px-1.5', BADGE[tone])}>
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT[tone])} />
      {children}
    </Badge>
  )
}
