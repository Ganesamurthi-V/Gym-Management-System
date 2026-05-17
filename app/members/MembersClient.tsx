'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Plus, MessageCircle, Upload, ChevronRight, Edit2, Hash } from 'lucide-react'
import { buildWhatsAppLink, formatDate, cn, isValidPhone } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { MemberWithStatus } from '@/types'
import { formatMemberId } from '@/types'

interface Props {
  members: MemberWithStatus[]
  gymId: string
}

type FilterType = 'all' | 'active' | 'expiring' | 'expired'

export function MembersClient({ members, gymId }: Props) {
  const [search, setSearch] = useState('')
  const [idSearch, setIdSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [fixing, setFixing] = useState(false)
  const supabase = createClient()

  // Detect duplicate member_numbers
  const numCount = members.reduce((acc, m) => {
    if (m.member_number != null) acc[m.member_number] = (acc[m.member_number] ?? 0) + 1
    return acc
  }, {} as Record<number, number>)
  const duplicateIds = new Set(Object.entries(numCount).filter(([, c]) => c > 1).map(([id]) => Number(id)))

  async function fixDuplicates() {
    setFixing(true)

    // Sort by member_number so first occurrence keeps its number
    const sorted = [...members].sort((a, b) => (a.member_number ?? 0) - (b.member_number ?? 0))

    // Track which numbers are finalized (first occurrence locks in its number)
    const finalized = new Set<number>()
    const updates: { id: string; newNum: number }[] = []

    for (const m of sorted) {
      const num = m.member_number ?? 0
      if (!finalized.has(num)) {
        // First occurrence — keep this number
        finalized.add(num)
      } else {
        // Duplicate — find next number not yet finalized
        let next = num + 1
        while (finalized.has(next)) next++
        finalized.add(next)
        updates.push({ id: m.id, newNum: next })
      }
    }

    // Apply all updates
    for (const { id, newNum } of updates) {
      await supabase.from('members').update({ member_number: newNum }).eq('id', id)
    }

    setFixing(false)
    window.location.reload()
  }

  const filtered = members
    .filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search)
      const matchesId = idSearch === '' || (m.member_number != null && formatMemberId(m.member_number).toLowerCase().includes(idSearch.toLowerCase()))
      const matchesFilter = filter === 'all' || m.status === filter
      return matchesSearch && matchesId && matchesFilter
    })
    .sort((a, b) => {
      if (idSearch !== '') return (a.member_number ?? 0) - (b.member_number ?? 0)
      return 0
    })

  const counts = {
    all:      members.length,
    active:   members.filter(m => m.status === 'active').length,
    expiring: members.filter(m => m.status === 'expiring').length,
    expired:  members.filter(m => m.status === 'expired').length,
  }

  const filterConfig: { key: FilterType; label: string; activeClass: string }[] = [
    { key: 'all',      label: 'All',      activeClass: 'bg-slate-900 text-white' },
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
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Members</h1>
        <div className="flex items-center gap-2">
          <Link href="/import" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </Link>
          <Link href="/members/bulk-edit" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
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
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="search" placeholder="Search by name or phone..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <div className="relative sm:w-40">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="search" placeholder="GF0001"
            value={idSearch} onChange={(e) => setIdSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
      </div>

      {/* Duplicate ID warning */}
      {duplicateIds.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-500 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">Duplicate Member IDs detected</p>
            <p className="text-xs text-red-600 mt-0.5">
              IDs {Array.from(duplicateIds).map(id => formatMemberId(id)).join(', ')} are assigned to multiple members.
            </p>
          </div>
          <button
            onClick={fixDuplicates}
            disabled={fixing}
            className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all disabled:opacity-60"
          >
            {fixing ? 'Fixing...' : 'Auto-Fix IDs'}
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {filterConfig.map(({ key, label, activeClass }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn('flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all',
              filter === key ? activeClass : 'bg-white border border-slate-200 text-slate-500')}
          >
            {label} <span className="opacity-60">({counts[key]})</span>
          </button>
        ))}
      </div>

      {/* Mobile: Cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-slate-400 text-sm">No members found</p>
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
                  <span className={cn(
                    'text-[10px] font-mono',
                    duplicateIds.has(member.member_number) ? 'text-red-500 font-bold' : 'text-slate-400'
                  )}>
                    {formatMemberId(member.member_number)}{duplicateIds.has(member.member_number) && ' ⚠'}
                  </span>
                  <p className="font-bold text-slate-900 text-sm truncate">{member.name}</p>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0', cls)}>{label}</span>
                </div>
                <p className="text-xs text-slate-400">{member.phone}</p>
                {member.latest_membership && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Expires {formatDate(member.latest_membership.end_date)}
                    {' · '}{member.days_remaining >= 0 ? `${member.days_remaining}d left` : `${Math.abs(member.days_remaining)}d ago`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {member.latest_membership && member.status !== 'active' && (
                  isValidPhone(member.phone) ? (
                    <a href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
                      target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center"
                      title="Send WhatsApp reminder"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  ) : (
                    <div className="w-8 h-8 bg-slate-200 text-slate-400 rounded-lg flex items-center justify-center cursor-not-allowed"
                      title="Invalid phone number — cannot send WhatsApp message">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                  )
                )}
                <Link href={`/members/${member.id}`} className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: Table */}
      <div className="hidden md:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">#</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Member</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Phone</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Plan</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Expires</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                  No members found.{' '}
                  <Link href="/members/new" className="text-brand-600 font-semibold hover:underline">Add first member</Link>
                </td>
              </tr>
            ) : filtered.map((member) => {
              const { label, cls } = statusConfig[member.status]
              return (
                <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      'font-mono text-xs',
                      duplicateIds.has(member.member_number) ? 'text-red-500 font-bold' : 'text-slate-400'
                    )}>
                      {formatMemberId(member.member_number)}
                      {duplicateIds.has(member.member_number) && <span className="ml-1">⚠</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${avatarColors[member.status]} rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                        {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-900">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{member.phone}</td>
                  <td className="px-5 py-3.5 text-slate-500 capitalize">{member.latest_membership?.plan ?? '—'}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {member.latest_membership ? (
                      <span>{formatDate(member.latest_membership.end_date)}
                        <span className="ml-1.5 text-xs text-slate-400">
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
                        isValidPhone(member.phone) ? (
                          <a href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors"
                            title="Send WhatsApp reminder"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />Remind
                          </a>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-slate-200 text-slate-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-not-allowed"
                            title="Invalid phone number — cannot send WhatsApp message">
                            <MessageCircle className="w-3.5 h-3.5" />Remind
                          </div>
                        )
                      )}
                      <Link href={`/members/${member.id}`} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
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
    </div>
  )
}
