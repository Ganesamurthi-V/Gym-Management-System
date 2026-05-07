import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import AppShell from '@/components/layout/AppShell'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'GymFlow — Gym Management',
  description: 'Simple gym management for Indian gyms',
  icons: { icon: '/favicon.ico' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f97316',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} font-sans antialiased h-full bg-gray-50 text-gray-900`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
