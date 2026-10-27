'use client'

import { Bell } from 'lucide-react'
import { usePushState } from '@/lib/push/usePushState'

export function pushHelpText(state: 'denied' | 'ios-needs-install'): string {
  return state === 'denied'
    ? 'Notifications are blocked for GymFlow. Allow them in your browser or phone settings, then come back.'
    : 'On iPhone, tap Share, then Add to Home Screen, and open GymFlow from there to turn on notifications.'
}

/** Banner at the top of /m/notifications. Hidden when push is on or unsupported. */
export function PushPrompt({ publicKey }: { publicKey: string }) {
  const { state, busy, error, enable } = usePushState(publicKey)
  if (state === null || state === 'on' || state === 'unsupported') return null

  return (
    <section className="card mb-5 flex items-start gap-3 p-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Bell aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-slate-900">Get notified about your gym</h2>
        {state === 'off' ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Gym notices, payment updates, workouts and progress reminders, even when the app is closed.
            </p>
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
            >
              Enable notifications
            </button>
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{pushHelpText(state)}</p>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </section>
  )
}
