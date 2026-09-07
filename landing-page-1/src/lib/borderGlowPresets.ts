/**
 * Shared BorderGlow prop presets.
 *
 * Lives outside BorderGlow.tsx on purpose: a module that exports both a
 * component and a plain value opts out of React Fast Refresh, so editing the
 * component would force a full reload instead of a hot swap.
 */

/**
 * Preset for the filled-blue cards. Pair with the `.glow-card-accent` class,
 * which supplies the resting rim colour and the white text.
 *
 * The rim colours have to be overridden: BorderGlow's default mesh is brand
 * blue, which against a blue fill is invisible, so the hover would read as
 * nothing happening. White is the only value that registers on this surface,
 * and it is already the colour of the text sitting on it.
 *
 * glowColor is deliberately absent, leaving BorderGlow's default. That drives
 * the halo *outside* the card, which sits on the page background, so keeping it
 * brand blue means every card in the grid blooms the same colour whatever its
 * own fill is.
 */
export const ACCENT_GLOW = {
  backgroundColor: 'var(--card-primary)',
  borderRadius: 'var(--radius-card-lg)',
  colors: ['var(--accent-ink)', 'rgb(255 255 255 / 65%)', 'var(--accent-ink)'],
  // No inward bleed, same as the white cards: rim only, interior untouched.
  fillOpacity: 0,
};
