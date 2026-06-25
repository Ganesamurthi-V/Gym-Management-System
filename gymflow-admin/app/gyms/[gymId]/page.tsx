import { createAdminClient } from '@/lib/supabase-admin'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users, CreditCard, Calendar, IndianRupee } from 'lucide-react'
import Link from 'next/link'

export default async function GymDetailPage({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params
  const supabase = createAdminClient()

  const [gymRes, membersRes, membershipsRes, attendanceRes] = await Promise.all([
    supabase.from('gyms').select('id, name, created_at').eq('id', gymId).single(),
    supabase.from('members').select('id, name, phone, area, created_at').eq('gym_id', gymId).order('created_at', { ascending: false }),
    supabase.from('memberships').select('id, plan, amount, start_date, end_date, created_at').eq('gym_id', gymId).order('created_at', { ascending: false }).limit(20),
    supabase.from('attendance').select('id, date, session').eq('gym_id', gymId).order('date', { ascending: false }).limit(5),
  ])

  if (gymRes.error || !gymRes.data) notFound()

  const gym = gymRes.data
  const members = membersRes.data ?? []
  const memberships = membershipsRes.data ?? []
  const totalRevenue = memberships.reduce((sum, m) => sum + (m.amount ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/gyms" className="admin-btn-ghost -ml-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{gym.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Registered {new Date(gym.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-slate-500">Total Members</span>
          </div>
          <p className="text-2xl font-bold text-white">{members.length}</p>
        </div>
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-slate-500">Memberships</span>
          </div>
          <p className="text-2xl font-bold text-white">{memberships.length}</p>
        </div>
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <IndianRupee className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-500">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-white">₹{totalRevenue.toLocaleString('en-IN')}</p>
        </div>
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-500">Recent Attendance</span>
          </div>
          <p className="text-2xl font-bold text-white">{(attendanceRes.data ?? []).length}</p>
        </div>
      </div>

      {/* Members Table */}
      <div className="admin-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1f2937] flex items-center gap-2">
          <Users className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold text-white">Members ({members.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f2937]">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Area</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="admin-table-row">
                  <td className="px-5 py-3 font-medium text-white">{m.name}</td>
                  <td className="px-5 py-3 text-slate-400">{m.phone}</td>
                  <td className="px-5 py-3 text-slate-500">{m.area ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{new Date(m.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 0 && (
            <div className="py-10 text-center text-slate-600 text-sm">No members registered</div>
          )}
        </div>
      </div>
    </div>
  )
}
