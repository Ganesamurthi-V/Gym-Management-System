import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

/** Shared with the pre-paint bootstrap script in index.html. Change both together. */
const STORAGE_KEY = 'gf-theme';

/**
 * The bootstrap script in index.html has already decided the theme and written
 * it to <html> before React mounted. Reading the class back rather than
 * recomputing from storage keeps the two in lockstep — recomputing risks a
 * disagreement (and a flash) if the storage read throws in one place and not the
 * other.
 */
function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Mirror state onto <html> and persist. Storage can throw in private mode, so
  // a failed write must not take the visual toggle down with it.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* preference is session-only this visit */
    }
  }, [theme]);

  // Dark is the default, so an un-toggled visitor stays dark whatever their OS
  // does — the site no longer follows prefers-color-scheme. The effect that
  // watched for OS changes has been removed: with dark as the default and the
  // toggle owning any deviation, there is nothing left for a system change to
  // drive. hasStoredPreference is likewise gone with its only caller.

  const toggle = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}

/* ── Read-only theme subscription ─────────────────────────────────────────── */

function subscribeToThemeClass(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

const isDarkSnapshot = () => document.documentElement.classList.contains('dark');

/**
 * Whether the page is currently dark, for components that need to *react* to the
 * theme without owning it.
 *
 * useTheme cannot be reused for this: it keeps the theme in component state, so
 * a second caller gets a second, independent copy. The toggle in the navbar
 * would update its own state and the <html> class, and this caller would never
 * re-render. Watching the class directly means whoever flips it — the toggle, or
 * the pre-paint script in index.html — is the single source of truth.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeToThemeClass, isDarkSnapshot);
}
