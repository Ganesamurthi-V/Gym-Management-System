/**
 * Themed Tailwind config for the member PWA.
 *
 * Mirrors the root owner app's approach: the achromatic scales (slate/gray/…) and the
 * semantic tint/text steps are wired to CSS variables so a single `.dark` class on <html>
 * flips the entire app without touching component files. The light values below are
 * byte-identical to Tailwind's own, so light mode is unchanged.
 *
 * `<alpha-value>` is a Tailwind placeholder — the variables therefore hold bare RGB
 * channels ("15 23 42"), not finished colours, so slash-opacity utilities like
 * `bg-slate-900/40` keep working.
 */
const themed = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

/** An achromatic scale wired to CSS variables so `.dark` can redefine it. */
const themedScale = (scale) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      themed(`${scale}-${step}`),
    ]),
  )

const palette = require('tailwindcss/colors')

/**
 * A semantic family, themed only where it needs to be:
 *   50/100/200 pale tints (cards, banners, icon tiles) → theme
 *   600–900    text/icons sitting on those tints        → theme (invert)
 *   300/400/500 saturated fills (bg-emerald-500 text-white) → literal, keep colour
 *   950        gradient floor                            → literal
 */
const themedSemantic = (family, literals) => ({
  50: themed(`${family}-50`),
  100: themed(`${family}-100`),
  200: themed(`${family}-200`),
  300: literals[300],
  400: literals[400],
  500: literals[500],
  600: themed(`${family}-600`),
  700: themed(`${family}-700`),
  800: themed(`${family}-800`),
  900: themed(`${family}-900`),
  ...(literals[950] ? { 950: literals[950] } : {}),
})

const SEMANTIC_FAMILIES = [
  // `cyan` is intentionally excluded — it is a brand-2 accent fill in this app and keeps
  // its literal ramp (declared explicitly below), like `brand`.
  'red', 'orange', 'amber', 'yellow', 'green', 'emerald', 'teal',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose',
]

const semanticScales = Object.fromEntries(
  SEMANTIC_FAMILIES.map((family) => [family, themedSemantic(family, palette[family])]),
)

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  // Class-based, matching the root app: a pre-paint script sets `.dark` on <html>
  // before first paint, and the in-app toggle flips it.
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        xs: '360px',
        '3xl': '1920px',
      },
      colors: {
        // Achromatic scales — themed. slate carries almost all of this app's greys.
        slate: themedScale('slate'),
        gray: themedScale('gray'),
        zinc: themedScale('zinc'),
        neutral: themedScale('neutral'),
        stone: themedScale('stone'),

        // Semantic families — themed tint + text steps, literal fills.
        ...semanticScales,

        rarity: {
          common: 'var(--color-rarity-common)',
          rare: 'var(--color-rarity-rare)',
          epic: 'var(--color-rarity-epic)',
          legendary: 'var(--color-rarity-legendary)',
          mythic: 'var(--color-rarity-mythic)',
        },

        /*
          brand and its cyan companion keep their literal ramps: they are the filled
          buttons, gradient stops and the one hue allowed to stay saturated in dark mode.
          `white`/`black` are intentionally NOT themed (labels on filled controls stay
          white). Surfaces that merely happened to be white use `surface` below.
        */
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E40AF',
          800: '#1E3A8A',
          900: '#172554',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },

        /**
         * Page and card surfaces — the themed replacement for `bg-white`.
         * Variable-backed so `.dark` flips them to the near-black ramp.
         */
        surface: {
          DEFAULT: themed('surface'),
          secondary: themed('surface-secondary'),
          card: themed('surface-card'),
          border: themed('surface-border'),
          sunken: themed('surface-sunken'),
        },
      },
      fontFamily: {
        sans: ['var(--font-sora)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
