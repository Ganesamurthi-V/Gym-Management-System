'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellOff, X } from 'lucide-react'
import { usePushState } from '@/lib/push/usePushState'
import { cn } from '@/lib/utils'

type Sheet = 'help' | 'confirm-off' | 'error' | null

function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * A web page cannot open the phone's notification settings, and once a member has blocked notifications the
 * browser will not show its permission prompt again. So the denied and iPhone-not-installed cases show the exact
 * steps for the member's phone instead, and re-check by themselves when the member comes back to the app.
 */
function helpSteps(state: 'denied' | 'ios-needs-install'): { title: string; steps: string[] } {
  if (state === 'ios-needs-install') {
    return {
      title: 'Add GymFlow to your Home Screen',
      steps: [
        'Open this page in Safari.',
        'Tap the Share button, then Add to Home Screen.',
        'Open GymFlow from your Home Screen, come to this page and tap Turn on.',
      ],
    }
  }
  if (isIos()) {
    return {
      title: 'Allow notifications in Settings',
      steps: [
        'Open the Settings app on your iPhone.',
        'Tap Notifications, then GymFlow.',
        'Turn on Allow Notifications.',
        'Come back to GymFlow.',
      ],
    }
  }
  if (isInstalled()) {
    return {
      title: 'Allow notifications in Settings',
      steps: [
        'Touch and hold the GymFlow icon on your home screen, then tap App info.',
        'Tap Notifications.',
        'Turn notifications on.',
        'Come back to GymFlow.',
      ],
    }
  }
  return {
    title: 'Allow notifications in your browser',
    steps: [
      'Tap the lock or settings icon next to the address bar.',
      'Tap Permissions (or Site settings), then Notifications.',
      'Choose Allow.',
      'Come back to this page.',
    ],
  }
}

/** Turn push on or off from the top of /m/notifications. */
export function PushHeaderButton({ publicKey }: { publicKey: string }) {
  const { state, busy, error, enable, disable, refresh } = usePushState(publicKey)
  const [sheet, setSheet] = useState<Sheet>(null)

  // Back from the phone's settings: pick up a permission the member just allowed.
  const recheck = useCallback(async () => {
    const next = await refresh()
    if (next === 'on') { setSheet(null); return }
    if (next === 'off' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const after = await enable()
      if (after === 'on') setSheet(null)
    }
  }, [refresh, enable])

  useEffect(() => {
    if (sheet !== 'help') return
    const onVisible = () => { if (document.visibilityState === 'visible') void recheck() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [sheet, recheck])

  if (state === null || state === 'unsupported') return null

  async function onPress() {
    if (state === 'on') { setSheet('confirm-off'); return }
    if (state === 'denied' || state === 'ios-needs-install') { setSheet('help'); return }
    const next = await enable() // shows the browser's own Allow / Block prompt
    if (next === 'denied') setSheet('help')
    else if (next !== 'on') setSheet('error')
  }

  const on = state === 'on'
  const help = state === 'denied' || state === 'ios-needs-install' ? helpSteps(state) : null

  return (
    <>
      <button
        type="button"
        onClick={onPress}
        disabled={busy}
        aria-label={on ? 'Notifications are on. Tap to turn off.' : 'Turn on notifications'}
        className="flex min-h-[44px] items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
      >
        <span
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold',
            on ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-500 text-white',
          )}
        >
          {on ? <Bell aria-hidden="true" className="h-3.5 w-3.5" /> : <BellOff aria-hidden="true" className="h-3.5 w-3.5" />}
          {busy ? 'Please wait' : on ? 'On' : 'Turn on'}
        </span>
      </button>

      {sheet && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-end bg-ink-900/50" onClick={() => setSheet(null)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full rounded-t-3xl bg-surface-card p-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                {sheet === 'confirm-off' ? 'Turn off notifications?' : sheet === 'error' ? 'Could not turn on' : help?.title ?? 'Notifications'}
              </h2>
              <button
                type="button"
                onClick={() => setSheet(null)}
                aria-label="Close"
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {sheet === 'confirm-off' && (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  You will stop getting gym notices and reminders on this phone. You can turn them on again any time.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setSheet(null)} className="min-h-[44px] rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
                    Keep on
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => { await disable(); setSheet(null) }}
                    className="min-h-[44px] rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Turn off
                  </button>
                </div>
              </>
            )}

            {sheet === 'error' && (
              <>
                <p role="alert" className="mt-2 text-sm text-slate-600">{error ?? 'Something went wrong. Please try again.'}</p>
                <button type="button" onClick={() => setSheet(null)} className="mt-5 min-h-[44px] w-full rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
                  Close
                </button>
              </>
            )}

            {sheet === 'help' && help && (
              <>
                <ol className="mt-3 space-y-2 text-sm text-slate-600">
                  {help.steps.map((step, i) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={() => void recheck()}
                  className="mt-5 min-h-[44px] w-full rounded-xl bg-brand-500 text-sm font-bold text-white"
                >
                  I have done this. Check again
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
