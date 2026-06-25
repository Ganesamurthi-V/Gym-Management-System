import { createClient } from '@/lib/supabase/server'
import { Bell, Info, AlertTriangle, ShieldCheck, Bug } from 'lucide-react'

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contact & Support</h1>
        <p className="text-slate-500 text-sm mt-1">Updates and support messages from the GymDesk team</p>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-slate-100">
          {(messages ?? []).length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bell className="w-8 h-8 text-slate-300" />
              </div>
              <p>No messages yet</p>
            </div>
          ) : (
            messages?.map(msg => {
              const isUnread = !msg.read_at
              return (
                <div key={msg.id} className={`p-5 md:p-6 flex items-start gap-4 transition-colors ${isUnread ? 'bg-brand-50/30' : 'hover:bg-slate-50'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 ${
                    msg.type === 'error' ? 'bg-red-100 text-red-600' :
                    msg.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                    msg.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {msg.type === 'error' ? <Bug className="w-5 h-5" /> :
                     msg.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                     msg.type === 'success' ? <ShieldCheck className="w-5 h-5" /> :
                     <Info className="w-5 h-5" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`text-sm md:text-base text-slate-900 ${isUnread ? 'font-bold' : 'font-semibold'}`}>
                        {msg.subject}
                      </h3>
                      {isUnread && <span className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0" />}
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{msg.body}</p>
                    <div className="flex items-center gap-2 mt-3 text-xs text-slate-400 font-medium">
                      <span>{new Date(msg.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span>From: {msg.sent_by === 'super_admin' ? 'GymDesk Support' : msg.sent_by}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
