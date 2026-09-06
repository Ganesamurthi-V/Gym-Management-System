import { useCallback, useEffect, useState } from 'react';

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

function hasStoredPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
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

  // Follow the OS only until the visitor makes an explicit choice — after that,
  // their choice wins and system changes are ignored.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (!hasStoredPreference()) setTheme(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
