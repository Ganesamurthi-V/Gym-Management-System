import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import { getAdminSession } from '@/lib/auth'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'GymDesk Admin',
  description: 'Super Admin Panel — GymDesk',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isAuthed = await getAdminSession()

  return (
    <html lang="en">
      <body className="bg-[#0a0f1e] text-slate-100 antialiased">
        {isAuthed ? (
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-60 min-h-screen bg-[#0a0f1e]">
              <div className="p-6 md:p-8 max-w-7xl mx-auto animate-fade-in">
                {children}
              </div>
            </main>
          </div>
        ) : (
          children
        )}
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
