// import { BottomNav } from '@/components/layout/BottomNav'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // ✅ Use getUser instead of getSession
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // ✅ Handle auth failure properly
  if (error || !user) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-lg mx-auto pb-24">
        {children}
      </main>
      {/* <BottomNav /> */}
    </div>
  )
}