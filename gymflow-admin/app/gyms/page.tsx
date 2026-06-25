import { createAdminClient } from '@/lib/supabase-admin'
import { Building2, Users, Calendar, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default async function GymsPage() {
  const supabase = createAdminClient()

  const { data: gyms, error } = await supabase
    .from('gyms')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  // Get member counts per gym
  const gymIds = (gyms ?? []).map(g => g.id)
  const { data: memberCounts } = await supabase
    .from('members')
    .select('gym_id')
    .in('gym_id', gymIds)

  const countMap: Record<string, number> = {}
  for (const m of memberCounts ?? []) {
    countMap[m.gym_id] = (countMap[m.gym_id] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gyms</h1>
          <p className="text-slate-500 text-sm mt-0.5">All registered gym accounts</p>
        </div>
        <div className="admin-badge-info">{gyms?.length ?? 0} total</div>
      </div>

      {error && (
        <div className="admin-badge-error p-3 rounded-lg text-sm">{error.message}</div>
      )}

      <div className="admin-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1f2937]">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Gym Name</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Members</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f2937]">
            {(gyms ?? []).map(gym => (
              <tr key={gym.id} className="admin-table-row">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0 border border-indigo-500/20">
                      <Building2 className="w-4 h-4 text-indigo-400" />
                    </div>
                    <span className="font-medium text-white">{gym.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Users className="w-3.5 h-3.5" />
                    {countMap[gym.id] ?? 0}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(gym.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/gyms/${gym.id}`}
                    className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(gyms ?? []).length === 0 && !error && (
          <div className="py-16 text-center">
            <Building2 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500">No gyms registered yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
