import { createAdminClient } from '@/lib/supabase-admin'
import { getSentryIssues } from '@/lib/sentry-api'
import { Building2, Users, AlertTriangle, Bug, ShieldCheck, Activity } from 'lucide-react'
import Link from 'next/link'
import ResolveButton from '@/components/errors/ResolveButton'

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode, label: string, value: string | number, sub?: string, color: string
}) {
  return (
    <div className="admin-card p-5">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = createAdminClient()

  const results = await Promise.allSettled([
    supabase.from('gyms').select('*', { count: 'exact', head: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('attendance').select('*', { count: 'exact', head: true })
      .eq('date', new Date().toISOString().slice(0, 10)),
    getSentryIssues('level:error is:unresolved', 25),
    getSentryIssues('level:warning is:unresolved', 25),
    supabase.from('admin_messages').select('*, gym:gym_id(name)').order('created_at', { ascending: false }).limit(5),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null))

  const gymCount = (results[0] as any)?.count
  const memberCount = (results[1] as any)?.count
  const attendanceToday = (results[2] as any)?.count
  const sentryErrors = results[3]
  const sentryWarnings = results[4]
  const recentMessages = results[5]

  const errors = Array.isArray(sentryErrors) ? sentryErrors : []
  const warnings = Array.isArray(sentryWarnings) ? sentryWarnings : []
  const recentMsgs = (recentMessages as any)?.data ?? []
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full">
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse-dot" />
          System Online
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={<Building2 className="w-5 h-5 text-indigo-400" />} label="Total Gyms" value={gymCount ?? '—'} color="bg-indigo-500/15" />
        <StatCard icon={<Users className="w-5 h-5 text-sky-400" />} label="Total Members" value={memberCount ?? '—'} color="bg-sky-500/15" />
        <StatCard icon={<Activity className="w-5 h-5 text-emerald-400" />} label="Today's Attendance" value={(attendanceToday as any)?.count ?? '—'} color="bg-emerald-500/15" />
        <StatCard icon={<Bug className="w-5 h-5 text-red-400" />} label="Open Errors" value={errors.length} sub="Unresolved in Sentry" color="bg-red-500/15" />
        <StatCard icon={<AlertTriangle className="w-5 h-5 text-amber-400" />} label="Warnings" value={warnings.length} sub="Unresolved in Sentry" color="bg-amber-500/15" />
        <StatCard icon={<ShieldCheck className="w-5 h-5 text-purple-400" />} label="Messages Sent" value={recentMsgs.length} sub="Recent support msgs" color="bg-purple-500/15" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sentry Errors */}
        <div className="admin-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2937]">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Recent Errors</h2>
            </div>
            <Link href="/errors" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-[#1f2937]">
            {errors.slice(0, 5).length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-600 text-sm">
                <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                No open errors 🎉
              </div>
            ) : errors.slice(0, 5).map((e: any) => (
              <div key={e.id} className="px-5 py-3 hover:bg-white/[0.02] transition-colors flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-red-400 font-medium truncate">{e.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5 truncate">{e.culprit}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-slate-600">{new Date(e.lastSeen).toLocaleString('en-IN')}</span>
                    <span className="text-[10px] text-slate-600">{e.count} events</span>
                  </div>
                </div>
                <div className="flex-shrink-0 mt-1">
                  <ResolveButton issueId={e.id} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Support Messages */}
        <div className="admin-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2937]">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Recent Messages Sent</h2>
            </div>
            <Link href="/support" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Send message</Link>
          </div>
          <div className="divide-y divide-[#1f2937]">
            {recentMsgs.length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-600 text-sm">No messages sent yet</div>
            ) : recentMsgs.map((m: any) => (
              <div key={m.id} className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-white font-medium truncate">{m.subject}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                    m.type === 'error' ? 'bg-red-500/20 text-red-400' :
                    m.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                    m.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>{m.type}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{m.gym?.name ?? 'Unknown gym'}</p>
                <p className="text-[10px] text-slate-600 mt-1">{new Date(m.created_at).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
