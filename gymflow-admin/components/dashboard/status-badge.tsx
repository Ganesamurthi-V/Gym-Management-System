import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type StatusTone = 'healthy' | 'success' | 'warning' | 'critical' | 'error' | 'info' | 'unknown' | 'neutral'

const DOT: Record<StatusTone, string> = {
  healthy: 'bg-emerald-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  error: 'bg-red-500',
  info: 'bg-sky-500',
  unknown: 'bg-muted-foreground',
  neutral: 'bg-muted-foreground',
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1.5 px-1.5">
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT[tone])} />
      {children}
    </Badge>
  )
}
