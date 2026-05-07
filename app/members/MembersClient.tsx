'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Plus, MessageCircle, Upload, ChevronRight, Edit2 } from 'lucide-react'
import { buildWhatsAppLink, formatDate, cn } from '@/lib/utils'
import type { MemberWithStatus } from '@/types'

interface Props {
  members: MemberWithStatus[]
  gymId: string
}

type FilterType = 'all' | 'active' | 'expiring' | 'expired'

export function MembersClient({ members, gymId }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const filtered = members.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search)
    const matchesFilter = filter === 'all' || m.status === filter
    return matchesSearch && matchesFilter
  })

  const counts = {
    all:      members.length,
    active:   members.filter(m => m.status === 'active').length,
    expiring: members.filter(m => m.status === 'expiring').length,
    expired:  members.filter(m => m.status === 'expired').length,
  }

  const filterConfig: { key: FilterType; label: string; activeClass: string }[] = [
    { key: 'all',      label: 'All',      activeClass: 'bg-gray-900 text-white' },
    { key: 'active',   label: 'Active',   activeClass: 'bg-emerald-500 text-white' },
    { key: 'expiring', label: 'Expiring', activeClass: 'bg-amber-500 text-white' },
    { key: 'expired',  label: 'Expired',  activeClass: 'bg-red-500 text-white' },
  ]

  const statusConfig = {
    active:   { label: 'Active',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    expiring: { label: 'Expiring', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    expired:  { label: 'Expired',  cls: 'bg-red-50 text-red-600 border-red-200' },
  }

  const avatarColors = {
    active:   'bg-emerald-500',
    expiring: 'bg-amber-500',
    expired:  'bg-red-400',
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Members</h1>
        <div className="flex items-center gap-2">
          <Link href="/import" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </Link>
          <Link href="/members/bulk-edit" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
            <Edit2 className="w-4 h-4" />
            <span className="hidden sm:inline">Edit Members</span>
          </Link>
          <Link href="/members/new" className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:from-brand-600 hover:to-brand-700 transition-all">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Member</span>
            <span className="sm:hidden">Add</span>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="search" placeholder="Search by name or phone..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-9"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {filterConfig.map(({ key, label, activeClass }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn('flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all',
              filter === key ? activeClass : 'bg-white border border-gray-200 text-gray-500')}
          >
            {label} <span className="opacity-60">({counts[key]})</span>
          </button>
        ))}
      </div>

      {/* Mobile: Cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-gray-400 text-sm">No members found</p>
            <Link href="/members/new" className="text-brand-600 text-sm font-semibold mt-1 inline-block">+ Add first member</Link>
          </div>
        ) : filtered.map((member) => {
          const { label, cls } = statusConfig[member.status]
          return (
            <div key={member.id} className="card p-3.5 flex items-center gap-3">
              <div className={`w-10 h-10 ${avatarColors[member.status]} rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono">#{member.member_number}</span>
                  <p className="font-bold text-gray-900 text-sm truncate">{member.name}</p>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0', cls)}>{label}</span>
                </div>
                <p className="text-xs text-gray-400">{member.phone}</p>
                {member.latest_membership && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Expires {formatDate(member.latest_membership.end_date)}
                    {' · '}{member.days_remaining >= 0 ? `${member.days_remaining}d left` : `${Math.abs(member.days_remaining)}d ago`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {member.latest_membership && member.status !== 'active' && (
                  <a href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
                    target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
                <Link href={`/members/${member.id}`} className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: Table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">#</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Member</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Phone</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Plan</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Expires</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                  No members found.{' '}
                  <Link href="/members/new" className="text-brand-600 font-semibold hover:underline">Add first member</Link>
                </td>
              </tr>
            ) : filtered.map((member) => {
              const { label, cls } = statusConfig[member.status]
              return (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">#{member.member_number}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${avatarColors[member.status]} rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                        {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-gray-900">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{member.phone}</td>
                  <td className="px-5 py-3.5 text-gray-500 capitalize">{member.latest_membership?.plan ?? '—'}</td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {member.latest_membership ? (
                      <span>{formatDate(member.latest_membership.end_date)}
                        <span className="ml-1.5 text-xs text-gray-400">
                          ({member.days_remaining >= 0 ? `${member.days_remaining}d left` : `${Math.abs(member.days_remaining)}d ago`})
                        </span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn('text-xs px-2.5 py-1 rounded-full font-semibold border', cls)}>{label}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      {member.latest_membership && member.status !== 'active' && (
                        <a href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />Remind
                        </a>
                      )}
                      <Link href={`/members/${member.id}`} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
