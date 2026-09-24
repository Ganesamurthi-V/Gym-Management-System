'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DARK_CLASS,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from '@/lib/theme/theme'

interface ThemeContextValue {
  /** What the user chose, including `system`. */
  choice: ThemeChoice
  /** What is actually on screen — `system` already resolved. */
  resolved: ResolvedTheme
  setChoice: (next: ThemeChoice) => void
  /** Flip between light and dark, resolving `system` to its opposite. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_QUERY = '(prefers-color-scheme: dark)'

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches === true
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return prefersDark() ? 'dark' : 'light'
  return choice
}

/**
 * Read the stored choice. Called lazily from useState so it runs on the client only — reading
 * it during a server render would return the default and then disagree with what the
 * bootstrap script already put on <html>, which is a hydration mismatch.
 */
function storedChoice(): ThemeChoice {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeChoice(raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Owns the theme preference for the main app.
 *
 * The provider does not decide the initial theme — the pre-paint script in app/layout.tsx
 * already did, before this component existed. This reads the same storage key so the two
 * agree, then takes over for changes the user makes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(storedChoice)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(storedChoice()))

  // Mirror the resolved theme onto <html>. colorScheme is set alongside the class so native
  // widgets — date pickers, select dropdowns, scrollbars — follow the app instead of staying
  // light-on-dark, which no amount of Tailwind can reach.
  useEffect(() => {
    const next = resolve(choice)
    setResolved(next)
    const root = document.documentElement
    root.classList.toggle(DARK_CLASS, next === 'dark')
    root.style.colorScheme = next === 'dark' ? 'dark' : 'light'
  }, [choice])

  // Persist separately from applying, so a storage failure in private mode still leaves the
  // visual change working for the rest of the session.
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, choice)
    } catch {
      /* Preference is session-only this visit. */
    }
  }, [choice])

  // Only subscribe to OS changes while the user has actually asked to follow the OS.
  // Listening unconditionally would repaint under someone who picked an explicit theme.
  useEffect(() => {
    if (choice !== 'system') return
    const mql = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      const next: ResolvedTheme = event.matches ? 'dark' : 'light'
      setResolved(next)
      document.documentElement.classList.toggle(DARK_CLASS, next === 'dark')
      document.documentElement.style.colorScheme = next
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [choice])

  /*
    Sync across tabs. An owner with the dashboard open twice should not have two different
    themes; `storage` fires in every other tab of the origin, so each one picks the change up.
  */
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return
      if (isThemeChoice(event.newValue)) setChoiceState(event.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setChoice = useCallback((next: ThemeChoice) => setChoiceState(next), [])

  const toggle = useCallback(() => {
    // Resolve first, so toggling out of `system` goes to the opposite of what is on screen
    // rather than to whatever alphabetically follows.
    setChoiceState((prev) => (resolve(prev) === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
