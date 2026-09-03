import type { Metadata, Viewport } from 'next'
import { Sora } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import { AppToaster } from '@/components/layout/AppToaster'
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
  themeColor: '#2563EB',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${sora.variable} font-sans antialiased bg-white text-slate-900`}>
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
      </body>
    </html>
  )
}
