import { createClient } from '@/lib/supabase/server'
import SupportHeaderClient from '@/components/support/SupportHeaderClient'
import SupportTabsClient from '@/components/support/SupportTabsClient'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's gym
  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return <div className="p-8 text-center text-slate-500">No gym found</div>

  // Mark all as read when visiting this page
  await supabase
    .from('admin_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('gym_id', gym.id)
    .is('read_at', null)

  const { data: messages } = await supabase
    .from('admin_messages')
    .select('*')
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })

  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SupportHeaderClient />

      <SupportTabsClient 
        initialMessages={messages || []} 
        initialTickets={tickets || []} 
        gymId={gym.id} 
      />
    </div>
  )
}
