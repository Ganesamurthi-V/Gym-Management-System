/**
 * Theme preference model for the main app.
 *
 * Two visual themes, three settings. `system` is a distinct stored value rather than the
 * absence of one, because "follow my OS" is a real choice a user makes and it has to survive
 * a reload. Collapsing it into "no preference stored" makes it impossible to tell a user who
 * asked for system from one who has never touched the toggle.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** What actually gets applied to the document. `system` always resolves to one of these. */
export type ResolvedTheme = 'light' | 'dark'

/**
 * Shared with the pre-paint bootstrap below. Anything reading or writing the preference must
 * use this constant so the script and the React layer cannot drift apart.
 */
export const THEME_STORAGE_KEY = 'gf-app-theme'

/**
 * Light, not `system`.
 *
 * Dark mode is new here and the app has 2,669 neutral colour utilities that have never been
 * seen against a dark surface. Defaulting to `system` would silently flip every existing
 * user whose OS is dark into an untested theme they did not ask for, and the first thing
 * they would see is their own gym's data in it. Light keeps today's appearance for everyone
 * and makes dark opt-in; a user who wants OS-following can select it.
 */
export const DEFAULT_THEME: ThemeChoice = 'light'

export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'] as const

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** The class Tailwind's `darkMode: 'class'` strategy looks for on <html>. */
export const DARK_CLASS = 'dark'

/**
 * Inline script that decides the theme before the first paint.
 *
 * This has to be a raw string injected into <head>, not a React effect. An effect runs after
 * hydration, which is after the browser has already painted the server-rendered markup — the
 * user would see a white flash on every navigation into a dark session. Reading storage
 * synchronously in <head> means the class is on <html> before any pixels exist.
 *
 * Written defensively on purpose:
 *   · localStorage access throws outright in Safari private mode, so the whole body is
 *     wrapped. A thrown bootstrap would leave the page unstyled-ish and, worse, break
 *     hydration; falling through to the default is always recoverable.
 *   · It sets `color-scheme` as well as the class, so native form controls and scrollbars
 *     match from the first frame rather than snapping once CSS applies.
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
