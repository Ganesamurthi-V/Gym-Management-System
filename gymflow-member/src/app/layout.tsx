import type { Metadata, Viewport } from 'next'
import { Sora } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import { Toaster } from 'react-hot-toast'
import { SessionLifecycle } from '@/components/auth/SessionLifecycle'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme/theme'
import './globals.css'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
})

export const metadata: Metadata = {
  applicationName: 'GymFlow Member',
  title: {
    default: 'GymFlow Member',
    template: '%s — GymFlow Member',
  },
  description: 'Your gym membership, workouts, and progress — all in one place.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GymFlow',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Theme-aware browser chrome: brand blue on light, near-black on dark so the
  // status bar / address bar match the app surface instead of flashing blue.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563EB' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  // colorScheme is set at runtime by the pre-paint script + ThemeProvider on
  // <html>, so it must NOT be hard-locked to light here.
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the pre-paint script mutates <html>'s class and
    // colorScheme before React hydrates, so the server markup and first client
    // markup differ by design on this element only.
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Decide the theme before first paint to avoid a light flash for
            dark-preferring members. Must run in <head>, ahead of any pixels. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      {/* Background is owned by the globals.css `body` rule (background: var(--color-bg)),
          which flips to the dark page colour automatically — so no bg-* utility here.
          text-slate-900 is now themed (light ink on dark), replacing the old hardcoded
          bg-white/text-slate-900 pair. */}
      <body className={`${sora.variable} min-h-dvh font-sans text-slate-900 antialiased`}>
        <NextTopLoader
          color="#2563EB"
          height={3}
          showSpinner={false}
          shadow="0 0 10px #2563EB,0 0 5px #2563EB"
        />
        <ThemeProvider>
          <QueryProvider>
            <SessionLifecycle />
            {children}
          </QueryProvider>
        </ThemeProvider>
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      </body>
    </html>
  )
}
