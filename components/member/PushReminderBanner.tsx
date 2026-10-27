'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { usePushState } from '@/lib/push/usePushState'
import { markDismissed, readReminderMeta, shouldShowPushReminder, type ReminderVariant } from '@/lib/push/reminder'
import { pushHelpText } from './PushPrompt'

/** Compact reminder on /m/home. Shown after 3 visits, at most once a week after "Not now". */
export function PushReminderBanner({ publicKey }: { publicKey: string }) {
  const { state, busy, enable } = usePushState(publicKey)
  const [hidden, setHidden] = useState(false)
  const [variant, setVariant] = useState<ReminderVariant | null>(null)

  useEffect(() => {
    if (state === null) return
    const { visits, lastDismissedAt } = readReminderMeta()
    setVariant(shouldShowPushReminder({ state, visits, lastDismissedAt, now: Date.now() }))
  }, [state])

  if (hidden || variant === null || state === 'on') return null

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-surface-border bg-surface-card px-4 py-3">
      <Bell aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-600">
          {variant === 'enable'
            ? 'Never miss a gym notice or payment update. Turn on notifications.'
            : pushHelpText(variant === 'denied-help' ? 'denied' : 'ios-needs-install')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {variant === 'enable' && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
            >
              Enable
            </button>
          )}
          <button
            type="button"
            onClick={() => { markDismissed(); setHidden(true) }}
            className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
