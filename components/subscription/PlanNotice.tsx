import Link from 'next/link'
import { AlertTriangle, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  tone: 'info' | 'warning'
  message: string
  /** Optional call to action, always a link to an owner route (no client state needed). */
  action?: { href: string; label: string }
}

// Same tinted look as TrialBanner (brand for info, amber for warning), but as a
// rounded in-page card so it can sit above page content instead of the shell edge.
// Server component: it only renders text and a link.
export default function PlanNotice({ tone, message, action }: Props) {
  const warn = tone === 'warning'
  const Icon = warn ? AlertTriangle : MessageCircle
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-4 py-3 border rounded-xl text-sm font-medium',
        warn ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-brand-50 border-brand-200 text-brand-800',
      )}
    >
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', warn ? 'text-amber-500' : 'text-brand-500')} />
        <span>{message}</span>
      </div>
      {action && (
        <Link
          href={action.href}
          className={cn(
            'flex-shrink-0 self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-bold',
            warn ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-brand-500 text-white hover:bg-brand-700',
          )}
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
