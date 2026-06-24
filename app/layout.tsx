import type { Metadata, Viewport } from 'next'
import { Sora } from 'next/font/google'
import AppShell from '@/components/layout/AppShell'
import './globals.css'
import { Toaster } from 'react-hot-toast'

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' })

export const metadata: Metadata = {
  title: 'gymflow — Gym Management',
  description: 'A powerful, intelligent management system for modern fitness centers in Tamil Nadu and Puducherry.',
  icons: { icon: '/favicon.ico' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563EB',
}

import { SmoothScrollProvider } from '@/components/providers/SmoothScrollProvider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} font-sans antialiased bg-white text-slate-900`}>
        <SmoothScrollProvider>
          <AppShell>{children}</AppShell>
        </SmoothScrollProvider>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      </body>
    </html>
  )
}
