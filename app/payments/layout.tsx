import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/dal'

export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthUser()
  if (!user) redirect('/auth/login')
  return <>{children}</>
}
