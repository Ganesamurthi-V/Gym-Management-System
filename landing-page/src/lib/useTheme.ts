import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

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

  // Mirror state onto <html>, and remember it for the rest of this visit so the next page
  // (another entry in the multi-page build, or a legal page) opens in the same theme. It goes
  // in sessionStorage, not localStorage: the bootstrap script in index.html still starts every
  // new visit light, and the choice dies with the tab.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      sessionStorage.setItem('gf-theme', theme);
    } catch {
      // Storage blocked (private mode, site data off): the theme just does not carry over.
    }
  }, [theme]);

  // Light is the default for every visitor whatever their OS does; the site does
  // not follow prefers-color-scheme, so there is nothing for a system change to drive.

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
