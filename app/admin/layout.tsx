import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Security check: Only allow the platform owner to access this route.
  // Set ADMIN_EMAIL in your Vercel Environment Variables.
  const adminEmail = process.env.ADMIN_EMAIL

  if (!adminEmail || user.email !== adminEmail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500 mb-8 text-sm leading-relaxed">
            You do not have super-admin privileges to view the platform dashboard.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white shadow-md py-4 px-6 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-indigo-400" />
          <h1 className="text-xl font-bold tracking-tight">GymFlow Super Admin</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
