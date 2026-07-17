'use client'

import { Clock, AlertTriangle, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface TrialBannerProps {
  /** 'trial' = free trial period, 'expiring' = paid sub near expiry, 'expired' = lapsed */
  mode: 'trial' | 'expiring' | 'expired'
  daysLeft: number
}

export default function TrialBanner({ mode, daysLeft }: TrialBannerProps) {
  const urgency =
    mode === 'expired'  ? 'red' :
    daysLeft <= 3       ? 'red' :
    daysLeft <= 7       ? 'yellow' : 'blue'

  let message: string
  if (mode === 'expired') {
    message = 'Your subscription has expired. Renew to continue using GymFlow.'
  } else if (mode === 'expiring') {
    message =
      daysLeft <= 1
        ? 'Your subscription expires today! Renew now to avoid losing access.'
        : `Your subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
  } else {
    // trial
    message =
      daysLeft <= 0  ? 'Your free trial has expired. Renew to continue using GymFlow.' :
      daysLeft === 1 ? 'Your trial expires today! Upgrade now to avoid losing access.' :
      `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial.`
  }

  const styles = {
    blue: {
      wrap: 'bg-brand-50 border-brand-200 text-brand-800',
      link: 'text-brand-700 underline font-bold hover:text-brand-900',
      Icon: Clock,
      iconClass: 'text-brand-500',
    },
    yellow: {
      wrap: 'bg-amber-50 border-amber-200 text-amber-800',
      link: 'text-amber-700 underline font-bold hover:text-amber-900',
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
    },
    red: {
      wrap: 'bg-red-50 border-red-200 text-red-800',
      link: 'text-red-700 underline font-bold hover:text-red-900',
      Icon: AlertCircle,
      iconClass: 'text-red-500',
    },
  }

  const s = styles[urgency]

  return (
    <div className={`flex items-center justify-between px-4 md:px-6 py-2 border-b text-sm font-medium ${s.wrap}`}>
      <div className="flex items-center gap-2 min-w-0">
        <s.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${s.iconClass}`} />
        <span className="truncate">
          {message}{' '}
          <Link href="/subscription" className={s.link}>
            Renew now →
          </Link>
        </span>
      </div>
    </div>
  )
}
