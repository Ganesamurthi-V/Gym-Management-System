/**
 * Theme preference model for the member PWA.
 *
 * Mirrors the owner app's model (light / dark / system) so the two products behave the
 * same. `system` is a distinct stored value, not the absence of one, so "follow my OS"
 * survives a reload and is distinguishable from "never chose".
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** What actually gets applied to the document. `system` always resolves to one of these. */
export type ResolvedTheme = 'light' | 'dark'

/**
 * Storage key. Deliberately DIFFERENT from the owner app's `gf-app-theme`: the member PWA is
 * a separate origin/deployment, and a member's theme preference is their own — it must not
 * be conflated with an owner preference if the two ever share a browser profile in dev.
 */
export const THEME_STORAGE_KEY = 'gf-member-theme'

/**
 * `system` by default.
 *
 * Unlike the owner app — which defaulted to light to avoid flipping thousands of existing
 * users into an untested dark theme — the member PWA is getting dark mode as a fresh, fully
 * themed rollout. A consumer app on a phone is expected to follow the OS, so `system` is the
 * least surprising default here. Members can still pin light or dark from the profile screen.
 */
export const DEFAULT_THEME: ThemeChoice = 'system'

export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'] as const

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** The class Tailwind's `darkMode: 'class'` strategy looks for on <html>. */
export const DARK_CLASS = 'dark'

/**
 * Inline script that decides the theme before the first paint.
 *
 * Injected as a raw string into <head>, NOT a React effect: an effect runs after hydration
 * (after the first paint), so a dark-preferring member would see a white flash on every
 * load. Reading storage synchronously in <head> puts the class on <html> before any pixels
 * exist. Wrapped in try/catch because localStorage throws in private mode; falling through
 * to the default is always recoverable.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var choice = (stored === 'light' || stored === 'dark' || stored === 'system')
      ? stored
      : '${DEFAULT_THEME}';
    var dark = choice === 'dark' ||
      (choice === 'system' &&
       window.matchMedia &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.classList.toggle('${DARK_CLASS}', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    /* Storage unavailable — the default theme from CSS stands. */
  }
})();
`.trim()
