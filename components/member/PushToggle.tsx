'use client'

import { Bell } from 'lucide-react'
import { usePushState } from '@/lib/push/usePushState'
import { cn } from '@/lib/utils'

const STATE_TEXT = {
  on: 'On',
  off: 'Off',
  denied: 'Blocked in your browser settings',
  'ios-needs-install': 'Add GymFlow to your Home Screen first',
} as const

/** Profile > Privacy switch. The position follows the re-read device state, so a refused permission snaps back. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const { state, busy, error, enable, disable } = usePushState(publicKey)
  if (state === null || state === 'unsupported') return null

  const on = state === 'on'
  const locked = state === 'denied' || state === 'ios-needs-install'

  return (
    <div className="mt-4 border-t border-surface-border pt-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Bell aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="push-toggle-label" className="text-sm font-semibold text-slate-800">Notifications on this phone</p>
          <p id="push-toggle-hint" className="mt-0.5 text-xs leading-relaxed text-slate-500">{STATE_TEXT[state]}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="push-toggle-label"
          aria-describedby="push-toggle-hint"
          aria-busy={busy}
          disabled={busy || locked}
          onClick={() => (on ? disable() : enable())}
          className="tap-target -my-2 -mr-2 flex shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
        >
          <span className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', on ? 'bg-brand-500' : 'bg-slate-300')}>
            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
          </span>
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
