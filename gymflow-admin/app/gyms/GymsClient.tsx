'use client'

import { useState } from 'react'
import { Building2, Users, Calendar, ExternalLink, Search, CheckCircle, Ban, CreditCard, Clock, XCircle, Zap } from 'lucide-react'
import Link from 'next/link'

type Gym = {
  id: string
  name: string
  created_at: string
  is_active: boolean
  subscription_status: string
  plan_type: string | null
  memberCount: number
}

type StatusFilter = 'all' | 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled'

const SUB_BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  trial: { label: 'Trial', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', Icon: Clock },
  active: { label: 'Active', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: Zap },
  expired: { label: 'Expired', cls: 'bg-red-500/10 text-red-400 border-red-500/20', Icon: XCircle },
  suspended: { label: 'Suspended', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: Ban },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20', Icon: XCircle },
  unknown: { label: 'Unknown', cls: 'bg-slate-500/10 text-slate-500 border-slate-500/20', Icon: CreditCard },
}

export default function GymsClient({ gyms, error }: { gyms: Gym[]; error: string | null }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = gyms.filter(g => {
    if (search.trim() && !g.name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== 'all' && g.subscription_status !== statusFilter) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gyms</h1>
          <p className="text-slate-500 text-sm mt-0.5">All registered gym accounts</p>
        </div>
        <div className="admin-badge-info">{gyms.length} total</div>
      </div>

      {error && (
        <div className="admin-badge-error p-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Search + Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search gyms by name..."
            className="admin-input pl-9 w-full"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="admin-input w-44 text-xs"
        >
          <option value="all">All Statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="admin-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1f2937]">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Gym Name</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Members</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subscription</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f2937]">
            {filtered.map(gym => (
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
                    {gym.memberCount}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  {gym.is_active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                      <Ban className="w-3 h-3" /> Banned
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {(() => {
                    const badge = SUB_BADGE[gym.subscription_status] ?? SUB_BADGE.unknown
                    const BadgeIcon = badge.Icon
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border w-fit ${badge.cls}`}>
                          <BadgeIcon className="w-3 h-3" /> {badge.label}
                        </span>
                        {gym.plan_type && gym.plan_type !== 'trial' && (
                          <span className="text-[10px] text-slate-500 capitalize">{gym.plan_type}</span>
                        )}
                      </div>
                    )
                  })()}
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

        {filtered.length === 0 && !error && (
          <div className="py-16 text-center">
            <Building2 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500">
              {search ? `No gyms match "${search}"` : 'No gyms registered yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
