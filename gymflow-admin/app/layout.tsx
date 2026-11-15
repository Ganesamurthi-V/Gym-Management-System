import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

export const metadata: Metadata = {
  title: 'GymFlow Admin',
  description: 'Super Admin Panel - GymFlow',
}

/*
  The shell decision lives in AppShell (a client component keyed on the pathname).
  Access control lives in proxy.ts; this layout only provides the document shell,
  the theme provider and the toaster.
*/
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
