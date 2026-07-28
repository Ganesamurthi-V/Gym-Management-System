import type { Metadata, Viewport } from 'next'
import { Sora } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import { Toaster } from 'react-hot-toast'
import { SessionLifecycle } from '@/components/auth/SessionLifecycle'
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
  themeColor: '#2563EB',
  colorScheme: 'light',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${sora.variable} min-h-dvh bg-white font-sans text-slate-900 antialiased`}>
        <NextTopLoader
          color="#2563EB"
          height={3}
          showSpinner={false}
          shadow="0 0 10px #2563EB,0 0 5px #2563EB"
        />
        <SessionLifecycle />
        {children}
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      </body>
    </html>
  )
}
