'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Plus, MessageCircle, ChevronRight, Upload } from 'lucide-react'
import { buildWhatsAppLink, formatDate, cn } from '@/lib/utils'
import type { MemberWithStatus, MemberStatus } from '@/types'

interface Props {
  members: MemberWithStatus[]
  gymId: string
}

type FilterType = 'all' | 'active' | 'expiring' | 'expired'

export function MembersClient({ members, gymId }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const filtered = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.phone.includes(search)
    const matchesFilter = filter === 'all' || m.status === filter
    return matchesSearch && matchesFilter
  })

  const counts = {
    all: members.length,
    active: members.filter(m => m.status === 'active').length,
    expiring: members.filter(m => m.status === 'expiring').length,
    expired: members.filter(m => m.status === 'expired').length,
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-white px-4 pt-10 pb-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Members</h1>
          <div className="flex items-center gap-2">
            <Link href="/import" className="btn-ghost">
              <Upload className="w-4 h-4" />
            </Link>
            <Link
              href="/members/new"
              className="flex items-center gap-1.5 bg-brand-600 text-white px-3 py-2 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" />
              Add
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10 py-3"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'active', 'expiring', 'expired'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                filter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 text-xs opacity-75">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-4 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            <p className="text-base">No members found</p>
            <Link href="/members/new" className="text-brand-600 text-sm font-medium mt-2 inline-block">
              + Add first member
            </Link>
          </div>
        ) : (
          filtered.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))
        )}
      </div>
    </div>
  )
}

function MemberCard({ member }: { member: MemberWithStatus }) {
  const statusConfig = {
    active: { label: 'Active', className: 'status-active' },
    expiring: { label: 'Expiring', className: 'status-expiring' },
    expired: { label: 'Expired', className: 'status-expired' },
  }

  const { label, className } = statusConfig[member.status]

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-gray-900 truncate">{member.name}</p>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', className)}>
              {label}
            </span>
          </div>
          <p className="text-sm text-gray-500">{member.phone}</p>
          {member.latest_membership && (
            <p className="text-xs text-gray-400 mt-0.5">
              Expires {formatDate(member.latest_membership.end_date)}
              {member.days_remaining >= 0
                ? ` · ${member.days_remaining}d left`
                : ` · ${Math.abs(member.days_remaining)}d ago`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 ml-2">
          {member.latest_membership && member.status !== 'active' && (
            <a
              href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-9 h-9 bg-green-500 text-white rounded-xl active:scale-[0.98] transition-all"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
          <Link
            href={`/members/${member.id}`}
            className="flex items-center justify-center w-9 h-9 bg-gray-100 text-gray-600 rounded-xl active:scale-[0.98] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
