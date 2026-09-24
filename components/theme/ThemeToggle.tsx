'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme/ThemeProvider'
import type { ThemeChoice } from '@/lib/theme/theme'

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

/**
 * Three-way theme control: Light / Dark / System.
 *
 * A segmented group rather than a single cycling button. With three states a lone button
 * gives no indication of what the next press does or which mode is active, and `system` in
 * particular is invisible — it looks identical to whichever theme it resolved to.
 *
 * Rendered as a radiogroup because that is what it is: one choice from a small fixed set,
 * arrow-key navigable. A row of independent buttons would announce three unrelated controls
 * and give no "1 of 3" context.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { choice, setChoice } = useTheme()

  /*
    The server cannot know the stored preference, so the first client render must match the
    server's markup or React logs a hydration mismatch. Until mounted, no option is shown as
    selected; immediately after, the real choice appears. The control is still fully usable
    in that window because the handlers do not depend on `mounted`.
  */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-surface-secondary p-0.5 ${className ?? ''}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && choice === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={`${label} theme`}
            onClick={() => setChoice(value)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${
              active
                ? 'bg-surface text-slate-900 shadow-sm'
                : 'text-slate-500 hover:bg-surface hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Single-button variant for tight chrome — the member PWA header, where a three-way group
 * would crowd out the page title.
 *
 * It shows the icon of the theme it will switch TO, which is the convention users expect from
 * a one-press control: a moon means "go dark", not "you are dark".
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme()

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Render the light-mode icon until mounted so server and client markup agree.
  const goingDark = !mounted || resolved === 'light'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      title={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      className={`flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-surface-secondary hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${className ?? ''}`}
    >
      {goingDark ? <Moon className="h-4.5 w-4.5" aria-hidden="true" /> : <Sun className="h-4.5 w-4.5" aria-hidden="true" />}
    </button>
  )
}
