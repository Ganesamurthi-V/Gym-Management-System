/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        admin: {
          bg: '#0a0f1e',
          surface: '#111827',
          border: '#1f2937',
          muted: '#374151',
          accent: '#6366f1',
          'accent-hover': '#4f46e5',
        },
      },
    },
  },
  plugins: [],
}
