import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { getAuthUser } = await import('@/lib/dal')
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')
  return <>{children}</>
}
