import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'GymFlow Admin',
  description: 'Super Admin Panel — GymFlow',
}

/*
  The shell decision moved out of here and into AppShell (a client component keyed on
  the pathname). This layout previously chose the shell from the session cookie alone,
  which drew the sidebar over the /auth login page and left it out of sync across the
  client-side navigations that login and logout perform. Access control still lives in
  middleware.ts; this layout now only provides the document shell and the toaster.
*/
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0f1e] text-slate-100 antialiased">
        <AppShell>{children}</AppShell>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#111827',
              color: '#f1f5f9',
              border: '1px solid #1f2937',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  )
}
