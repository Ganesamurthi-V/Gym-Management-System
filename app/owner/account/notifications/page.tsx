import { createClient } from '@/lib/supabase/server'
import SupportHeaderClient from '@/components/support/SupportHeaderClient'
import SupportTabsClient from '@/components/support/SupportTabsClient'
import { startPageTimer, timed } from '@/lib/perf'

// No `dynamic = 'force-dynamic'`: this page reads the auth cookie, which
// already makes it dynamic. The export was redundant.

export default async function NotificationsPage() {
  const done = startPageTimer('account/notifications')

  const { getAuthUser, getGym } = await import('@/lib/dal')
  const { user } = await getAuthUser()
  if (!user) return null

  // Served from the shared getGymCore query the root layout already ran — free.
  const { gym } = await getGym(user.id)
  if (!gym) {
    done()
    return <div className="p-8 text-center text-slate-500">No gym found</div>
  }

  const supabase = await createClient()

  // Previously these ran as 4-5 fully sequential awaits (unread probe → update →
  // messages → tickets), costing ~200ms each. The two list queries are
  // independent of the unread probe, so all three now run concurrently.
  const [unreadRes, adminRes, ticketRes] = await Promise.all([
    timed('unread probe', () =>
      supabase
        .from('admin_messages')
        .select('id')
        .eq('gym_id', gym.id)
        .is('read_at', null)
        .limit(1)
    ),
    timed('admin messages', () =>
      supabase
        .from('admin_messages')
        .select('*')
        .eq('gym_id', gym.id)
        .eq('is_cleared_by_owner', false)
        .order('created_at', { ascending: false })
    ),
    timed('support tickets', () =>
      supabase
        .from('support_tickets')
        .select('*')
        .eq('gym_id', gym.id)
        .eq('is_cleared_by_owner', false)
        .order('created_at', { ascending: false })
    ),
  ])

  const messages = adminRes.data ?? []
  const tickets = ticketRes.data ?? []

  // Mark everything read. This is a write that the rendered output does not
  // depend on (the list above intentionally shows messages regardless of read
  // state), so it is scheduled with after() and no longer blocks the response.
  if (unreadRes.data && unreadRes.data.length > 0) {
    const { after } = await import('next/server')
    after(async () => {
      try {
        await supabase
          .from('admin_messages')
          .update({ read_at: new Date().toISOString() })
          .eq('gym_id', gym.id)
          .is('read_at', null)

        const [{ deleteCache }, { cacheKeys }] = await Promise.all([
          import('@/lib/cache'),
          import('@/lib/cache-keys'),
        ])
        await deleteCache(cacheKeys.unreadCount(user.id))
      } catch {
        // Non-fatal — the badge will self-correct on the next 30s TTL expiry.
      }
    })
  }

  done()

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
