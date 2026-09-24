import type { Metadata, Viewport } from 'next'
import { Sora } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import { AppToaster } from '@/components/layout/AppToaster'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme/theme'
import './globals.css'

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' })

/**
 * Root layout for the unified app at app.gymflow.sbs.
 *
 * Deliberately shell-less. The owner chrome (sidebar / header / trial banner /
 * subscription paywall) now lives in `app/owner/layout.tsx`, and the member
 * chrome (bottom nav / data warmer / query cache) in `app/m/layout.tsx`, so
 * `/auth/*` and `/activate/*` render on a bare page as they always did.
 *
 * `manifest` is intentionally NOT set here — each subtree layout declares its
 * own so the installed PWA matches the experience the user installed from.
 */
export const metadata: Metadata = {
  /**
   * Required for Next.js to resolve relative URLs in generated metadata —
   * canonical links, Open Graph and Twitter card URLs, and the `sitemap` field
   * of `robots.txt`. Without it Next.js warns at build time and falls back to
   * localhost, which would emit wrong absolute URLs in production.
   *
   * Falls back to the production host so a preview build without the env var set
   * still produces valid absolute URLs rather than throwing.
   */
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.gymflow.sbs'),
  title: 'gymflow — Gym Management',
  description:
    'A powerful, intelligent management system for modern fitness centers in Tamil Nadu and Puducherry.',
  icons: {
    icon: '/logo_only.png',
    apple: '/logo_only.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /*
    Per-theme browser chrome. A single colour would leave the mobile address bar brand blue
    over a dark page; these let the OS tint it to match whichever theme is active.
  */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563EB' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
      suppressHydrationWarning is required, not incidental. The bootstrap script below mutates
      <html>'s class and style before React hydrates, so the client's attributes legitimately
      differ from the server-rendered ones. Without this, React warns on every load. It is
      scoped to this element only, so genuine mismatches deeper in the tree still surface.
    */
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/*
          Must run before the first paint, which is why it is an inline script in <head> and
          not an effect. An effect runs after hydration — after the browser has already painted
          the server markup — so a user in dark mode would see a white flash on every load.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      {/*
        bg-surface-secondary, not bg-surface: the page is the layer beneath cards, so in dark
        mode it must be the darkest surface rather than the card colour.
      */}
      <body className={`${sora.variable} font-sans antialiased bg-surface-secondary text-slate-900`}>
        <ThemeProvider>
          <NextTopLoader
            color="#2563EB"
            initialPosition={0.08}
            crawlSpeed={200}
            height={3}
            crawl={true}
            showSpinner={false}
            easing="ease"
            speed={200}
            shadow="0 0 10px #2563EB,0 0 5px #2563EB"
          />
          {children}
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
