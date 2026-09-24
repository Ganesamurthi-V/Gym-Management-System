/**
 * Channel triplet for one themed colour, e.g. `rgb(var(--c-slate-500) / <alpha-value>)`.
 *
 * <alpha-value> is a Tailwind placeholder, and it is the reason the variables hold bare
 * channels ("15 23 42") rather than a finished colour. With a hex or rgb() value Tailwind
 * cannot inject an alpha, so every slash opacity in the codebase — `bg-slate-900/40`,
 * `text-white/70`, and the 24 `bg-white/n` surfaces — would silently render fully opaque.
 */
const themed = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

/**
 * An achromatic scale wired to CSS variables so `.dark` can redefine it.
 *
 * This is what makes a themed app possible without touching 102 component files. The audit
 * found 2,669 hardcoded neutral utilities (`text-slate-700`, `border-slate-200`, ...) and
 * only 4 `dark:` variants in the entire app. Hand-adding a dark variant to each would be
 * thousands of edits, and any file missed would render same-on-same — invisible text rather
 * than an obviously wrong colour. Pointing the scale at variables inverts all of them at
 * once, and the light values below are byte-identical to Tailwind's own, so light mode is
 * unchanged.
 */
const themedScale = (scale) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      themed(`${scale}-${step}`),
    ]),
  )

const palette = require('tailwindcss/colors')

/**
 * A semantic family (red, emerald, brand, ...) that is themed only where it needs to be.
 *
 * Splitting a family by step rather than theming it wholesale, because the steps do two
 * unrelated jobs:
 *
 *   50/100/200  pale tints and hairlines — stat cards, banners, the icon tiles behind a
 *               coloured glyph. These were the "white components" still glowing pastel on a
 *               black page, so they must theme.
 *   600–900     the text and icons sitting ON those tints. 600 alone accounts for 281 uses.
 *               These have to invert, and 600 is not optional: brand-600 has a luminance of
 *               0.107, which caps it at 3.13:1 against ANY near-black surface, so no choice
 *               of tint could have made a literal 600 readable.
 *   300/400/500 saturated fills — `bg-emerald-500 text-white` buttons, gradient stops,
 *               status dots. A filled button keeps its colour in dark mode, so these stay
 *               literal and are read straight from Tailwind's palette.
 *
 * 950 stays literal too; it is only used as a gradient floor.
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
  'red', 'orange', 'amber', 'yellow', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose',
]

const semanticScales = Object.fromEntries(
  SEMANTIC_FAMILIES.map((family) => [family, themedSemantic(family, palette[family])]),
)

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  /**
   * Class-based, not the `media` default.
   *
   * The app needs an explicit in-product toggle, and `media` would hand control to the OS
   * with no way to override it. It also means the theme is decided by a class on <html>,
   * which the pre-paint script in app/layout.tsx can set before first paint.
   */
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '360px',   // small phones (iPhone SE, Galaxy A)
        '3xl': '1920px', // large monitors / TV-sized displays
      },
      colors: {
        /*
          The achromatic scales, themed. `slate` carries almost all of this app's greys;
          the others are included because a handful of files reach for them and a scale
          left un-themed would stay light-on-light in dark mode.
        */
        slate: themedScale('slate'),
        gray: themedScale('gray'),
        zinc: themedScale('zinc'),
        neutral: themedScale('neutral'),
        stone: themedScale('stone'),

        /*
          The semantic families, themed at their tint and text steps only. Spread before the
          explicit entries below so `brand` can override with its own ramp.
        */
        ...semanticScales,

        /*
          `white` and `black` are deliberately NOT themed, and this is the single most
          important decision here.

          `text-white` appears 128 times across 51 files, nearly always as the label on a
          filled brand, emerald or red control — `bg-brand-500 text-white`. Those buttons
          keep their colour in dark mode, so their label must stay white. Theming `white`
          would turn all 128 into dark-on-saturated and wreck every primary action in the
          app. The same applies to `bg-white/10`-style scrims layered over dark artwork.

          Surfaces that merely happened to be white are handled by `surface` below, which
          is what the `bg-white` card/modal/input usages were converted to.
        */
        white: '#ffffff',
        black: '#000000',

        /**
         * Page and card surfaces. This is the themed replacement for `bg-white`.
         */
        surface: {
          DEFAULT: themed('surface'),
          secondary: themed('surface-secondary'),
          card: themed('surface-card'),
          border: themed('surface-border'),
          sunken: themed('surface-sunken'),
        },

        /**
         * Surfaces that are dark in BOTH themes, so they must not invert.
         *
         * The audit found 39 of these — the onboarding sidebar, QR code plates, tooltips,
         * the near-black primary buttons on /auth. Under a themed scale they would flip to
         * near-white in dark mode, which is backwards: a panel chosen for being dark should
         * stay dark. These keep literal values and opt out of theming entirely.
         */
        ink: {
          50: '#f8fafc',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },

        /**
         * High-emphasis fill and its label — selected chips, segmented-control actives, the
         * dark solid buttons.
         *
         * Separate from `ink` because the two have opposite requirements that only become
         * visible in dark mode. `ink` means "dark in both themes", which is right for a modal
         * scrim: an overlay must dim the page whatever the theme. It is wrong for a selected
         * pill. A pill is dark in light mode because dark is the *emphatic* end of the ramp,
         * not because darkness is the point — and ink-900 (#0f172a) against a #171717 card
         * has a contrast of about 1.02:1, so the pill's shape disappears entirely while its
         * white label floats unattached.
         *
         * Being variable-backed, this pair inverts: near-black fill with a white label in
         * light mode, near-white fill with a black label in dark mode. Components use
         * `bg-emphasis text-emphasis-fg` and need no dark: variant, which also means the fill
         * and its label can never be updated out of step with each other.
         */
        emphasis: {
          DEFAULT: themed('emphasis'),
          fg: themed('emphasis-fg'),
          hover: themed('emphasis-hover'),
        },

        /**
         * The hue-free counterpart to `ink`, for the monochrome surfaces.
         *
         * Exists because `ink` is slate-toned. The /auth pages and the welcome transition
         * were built so that "nothing on the page carries a hue except the semantic states",
         * and they use Tailwind's `neutral`. Folding their dark backgrounds into slate-toned
         * ink would quietly introduce a blue cast into the one part of the app that
         * deliberately has none, so their values are carried over exactly.
         *
         * Same non-flipping contract as ink: literal, never themed.
         */
        carbon: {
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        // Achievement rarity tiers — driven by CSS custom properties declared
        // in app/design-tokens.css so the member gamification UI can theme them
        // without a Tailwind rebuild.
        rarity: {
          common: 'var(--color-rarity-common)',
          rare: 'var(--color-rarity-rare)',
          epic: 'var(--color-rarity-epic)',
          legendary: 'var(--color-rarity-legendary)',
          mythic: 'var(--color-rarity-mythic)',
        },
        /*
          brand keeps its own hand-picked ramp rather than Tailwind's blue, themed on the same
          split as the families above: literal 300/400/500 for filled buttons, themed tints
          and text.
        */
        brand: themedSemantic('brand', {
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#2563EB',
        }),
      },
      fontFamily: {
        sans: ['var(--font-sora)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        '8xl': '88rem',  // 1408px – comfortable reading width for xxl screens
        '9xl': '96rem',  // 1536px
      },
    },
  },
  plugins: [],
}
