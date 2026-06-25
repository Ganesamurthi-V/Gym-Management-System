import { createClient } from '@/lib/supabase/server'
import SupportHeaderClient from '@/components/support/SupportHeaderClient'
import SupportTabsClient from '@/components/support/SupportTabsClient'
import { cacheWrapper, invalidatePattern } from '@/lib/cache'
import { RequestLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const logger = new RequestLogger('NotificationsPage')
  logger.start('Page Load')

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
    logger.end('Update Read Status')
      
    // Invalidate cache since we modified data
    await invalidatePattern(`gym:${gym.id}:admin_messages`)
  }

  const messages = await cacheWrapper(
    `gym:${gym.id}:admin_messages`,
    300, // 5 minutes cache
    async () => {
      const { data } = await supabase
        .from('admin_messages')
        .select('*')
        .eq('gym_id', gym.id)
        .eq('is_cleared_by_owner', false)
        .order('created_at', { ascending: false })
      return data || []
    },
    logger
  )

  const tickets = await cacheWrapper(
    `gym:${gym.id}:support_tickets`,
    300, // 5 minutes cache
    async () => {
      const { data } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('gym_id', gym.id)
        .eq('is_cleared_by_owner', false)
        .order('created_at', { ascending: false })
      return data || []
    },
    logger
  )

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
