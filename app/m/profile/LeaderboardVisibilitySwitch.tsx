'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { setLeaderboardVisibility } from './actions'

/**
 * "Show me on the gym leaderboard" switch.
 *
 * Optimistic: the switch moves on tap and rolls back with a toast if the save
 * fails, because on 4G the round trip is long enough that a switch which waits
 * looks broken and gets tapped twice.
 */
export function LeaderboardVisibilitySwitch({ initialVisible }: { initialVisible: boolean }) {
  const router = useRouter()
  const [visible, setVisible] = useState(initialVisible)
  const [saving, setSaving] = useState(false)
  // A ref as well as state: two taps in the same frame both see `saving` as false.
  const savingRef = useRef(false)

  // The server value can change under us (background refresh, another device).
  // Adopt it, except mid-save, where it would undo the optimistic state.
  useEffect(() => {
    if (!savingRef.current) setVisible(initialVisible)
  }, [initialVisible])

  async function toggle() {
    if (savingRef.current) return
    const previous = visible
    const next = !previous

    savingRef.current = true
    setSaving(true)
    setVisible(next)

    try {
      const result = await setLeaderboardVisibility(next)
      if (!result.success) throw new Error(result.error)

      setVisible(result.visible)
      toast.success(result.visible ? 'You are shown on the leaderboard' : 'You are hidden from the leaderboard')
      // The Router Cache keeps other tabs' payloads for up to 180 s; without
      // this the leaderboard would keep showing the old "hidden" state.
      router.refresh()
    } catch (err) {
      setVisible(previous)
      toast.error(err instanceof Error && err.message ? err.message : 'Could not save. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Trophy aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p id="leaderboard-visibility-label" className="text-sm font-semibold text-slate-800">
          Show me on the gym leaderboard
        </p>
        <p id="leaderboard-visibility-hint" className="mt-0.5 text-xs leading-relaxed text-slate-500">
          {visible
            ? 'Other members see your first name and initial with your rank.'
            : 'You are hidden from other members. You can still see your own rank.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={visible}
        aria-labelledby="leaderboard-visibility-label"
        aria-describedby="leaderboard-visibility-hint"
        aria-busy={saving}
        onClick={toggle}
        // 44px tap target around a 24px-high track.
        className="tap-target -my-2 -mr-2 flex shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            visible ? 'bg-brand-500' : 'bg-slate-300'
          }`}
        >
          {/* `bg-white` on purpose: the knob sits on a filled control and must not flip in dark mode. */}
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              visible ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </span>
      </button>
    </div>
  )
}
