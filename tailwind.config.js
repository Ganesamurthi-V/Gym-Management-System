/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        'xs': '360px',   // small phones (iPhone SE, Galaxy A)
        '3xl': '1920px', // large monitors / TV-sized displays
      },
      colors: {
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
        brand: {
          50:  '#EFF6FF',
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
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F8FAFC',
          card: '#F1F5F9',
          border: '#E2E8F0',
        },
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
