'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme/ThemeProvider'
import type { ThemeChoice } from '@/lib/theme/theme'

const OPTIONS: Array<{ value: ThemeChoice; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/**
 * Appearance control for the profile screen — Light / Dark / System.
 *
 * A segmented control rather than a single toggle so `system` (follow the OS) is a
 * first-class choice, not a hidden state. Reads/writes through useTheme(), which persists
 * the choice and flips the `.dark` class on <html>; the whole app repaints via the themed
 * CSS variables.
 */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = choice === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setChoice(value)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
              active
                ? 'bg-surface text-brand-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
