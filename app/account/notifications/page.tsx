import { createClient } from '@/lib/supabase/server'
import SupportHeaderClient from '@/components/support/SupportHeaderClient'
import SupportTabsClient from '@/components/support/SupportTabsClient'
import { RequestLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const logger = new RequestLogger('NotificationsPage')
  logger.start('Page Load')

  const { getAuthUser, getGym } = await import('@/lib/dal')
  const { user } = await getAuthUser()
  if (!user) return null

  // Get user's gym
  const { gym } = await getGym(user.id)

  if (!gym) return <div className="p-8 text-center text-slate-500">No gym found</div>

  const supabase = await createClient()

  logger.start('Check Unread')
  // Check if there are any unread messages before updating
  const { data: unreadMessages } = await supabase
    .from('admin_messages')
    .select('id')
    .eq('gym_id', gym.id)
    .is('read_at', null)
    .limit(1)
  logger.end('Check Unread')

  // Mark all as read when visiting this page
  if (unreadMessages && unreadMessages.length > 0) {
    logger.start('Update Read Status')
    await supabase
      .from('admin_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('gym_id', gym.id)
      .is('read_at', null)
      
    const { deleteCache } = await import('@/lib/cache')
    await deleteCache(`unread_count:${gym.id}`)
      
    logger.end('Update Read Status')
  }

  const { data: adminData } = await supabase
    .from('admin_messages')
    .select('*')
    .eq('gym_id', gym.id)
    .eq('is_cleared_by_owner', false)
    .order('created_at', { ascending: false })
    
  const messages = adminData || []

  const { data: ticketData } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('gym_id', gym.id)
    .eq('is_cleared_by_owner', false)
    .order('created_at', { ascending: false })
    
  const tickets = ticketData || []

  logger.end('Page Load')
  logger.summary()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SupportHeaderClient />

      <SupportTabsClient 
        initialMessages={messages} 
        initialTickets={tickets} 
        gymId={gym.id} 
      />
    </div>
  )
}
