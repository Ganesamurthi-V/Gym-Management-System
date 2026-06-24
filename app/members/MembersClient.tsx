'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { Search, Plus, MessageCircle, Upload, ChevronRight, Edit2, Hash, Users, Check, X, AlertCircle, Filter, Zap, CreditCard, Target, Calendar, Download } from 'lucide-react'
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
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [idSearch, setIdSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [showAdvFilterModal, setShowAdvFilterModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [exportStatus, setExportStatus] = useState<FilterType | 'all'>('all')
  const [advFilters, setAdvFilters] = useState({
    quick: null as string | null,
    status: [] as string[],
    plan: 'all',
    paymentStatus: 'all',
    gender: 'all',
    joined: 'all',
    ageRange: 'all',
  })
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
    toast.success('Duplicate IDs fixed successfully!')
    router.refresh()
  }

  const uniquePlans = Array.from(new Set(members.map(m => m.latest_membership?.plan).filter(Boolean))) as string[]

  const filtered = members
    .filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search)
      const matchesId = idSearch === '' || (m.member_number != null && formatMemberId(m.member_number).toLowerCase().includes(idSearch.toLowerCase()))
      const matchesFilter = filter === 'all' || m.status === filter
      
      let matchesAdv = true
      
      // Quick Filters
      if (advFilters.quick === 'active_expiring') {
        if (m.status !== 'active' && m.status !== 'expiring') matchesAdv = false
      } else if (advFilters.quick === 'unpaid') {
        if (!((m.pending_amount ?? 0) > 0)) matchesAdv = false
      } else if (advFilters.quick === 'new') {
        const dateStr = m.latest_membership?.start_date || m.created_at
        const joinedDate = new Date(dateStr)
        const now = new Date()
        const isNew = joinedDate.getMonth() === now.getMonth() && joinedDate.getFullYear() === now.getFullYear()
        if (!isNew) matchesAdv = false
      }
      
      // Status
      if (advFilters.status.length > 0) {
        if (!advFilters.status.includes(m.status)) matchesAdv = false
      }
      
      // Plan
      if (advFilters.plan !== 'all') {
        if (!m.latest_membership?.plan || m.latest_membership.plan !== advFilters.plan) matchesAdv = false
      }
      
      // Payment Status
      if (advFilters.paymentStatus === 'fully') {
        if ((m.pending_amount ?? 0) > 0) matchesAdv = false
      } else if (advFilters.paymentStatus === 'partial') {
        const total = m.latest_membership?.amount ?? 0
        const pending = m.pending_amount ?? 0
        if (!(pending > 0 && total > pending)) matchesAdv = false
      } else if (advFilters.paymentStatus === 'unpaid') {
        const total = m.latest_membership?.amount ?? 0
        const pending = m.pending_amount ?? 0
        if (!(pending > 0 && pending >= total)) matchesAdv = false
      }
      
      // Age Range
      if (advFilters.ageRange !== 'all') {
        const ageStr = String(m.age || '').replace(/[^0-9]/g, '')
        const age = ageStr ? Number(ageStr) : null
        if (!age) matchesAdv = false
        else if (advFilters.ageRange === 'under18' && age >= 18) matchesAdv = false
        else if (advFilters.ageRange === '18-30' && (age < 18 || age > 30)) matchesAdv = false
        else if (advFilters.ageRange === '31-50' && (age < 31 || age > 50)) matchesAdv = false
        else if (advFilters.ageRange === 'above50' && age <= 50) matchesAdv = false
      }
      
      // Gender
      if (advFilters.gender !== 'all') {
        const g = m.gender?.toLowerCase()
        const isMale = g === 'male' || g === 'm'
        const isFemale = g === 'female' || g === 'f'
        if (advFilters.gender === 'male' && !isMale) matchesAdv = false
        if (advFilters.gender === 'female' && !isFemale) matchesAdv = false
      }
      
      // Joined — parse as local date (YYYY-MM-DD) to avoid UTC midnight shifting the day
      if (advFilters.joined !== 'all') {
        const dateStr = m.join_date
        if (!dateStr) {
          matchesAdv = false
        } else {
          const [y, mo, d] = dateStr.split('-').map(Number)
          const joinedDate = new Date(y, mo - 1, d)
          const now = new Date()

          if (advFilters.joined === 'today') {
            if (
              joinedDate.getFullYear() !== now.getFullYear() ||
              joinedDate.getMonth() !== now.getMonth() ||
              joinedDate.getDate() !== now.getDate()
            ) matchesAdv = false
          } else if (advFilters.joined === 'this-month') {
            if (
              joinedDate.getMonth() !== now.getMonth() ||
              joinedDate.getFullYear() !== now.getFullYear()
            ) matchesAdv = false
          } else if (advFilters.joined === 'last-3-months') {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
            if (joinedDate < threeMonthsAgo || joinedDate > now) matchesAdv = false
          } else if (advFilters.joined === 'last-6-months') {
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
            if (joinedDate < sixMonthsAgo || joinedDate > now) matchesAdv = false
          }
        }
      }
      
      return matchesSearch && matchesId && matchesFilter && matchesAdv
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
    overdue:  members.filter(m => (m.pending_amount ?? 0) > 0).length,
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

  async function exportExcel() {
    let toExport = filtered

    if (exportStatus !== 'all') {
      toExport = toExport.filter(m => m.status === exportStatus)
    }

    if (exportFrom && exportTo) {
      const fromD = new Date(exportFrom)
      const toD = new Date(exportTo)
      toExport = toExport.filter(m => {
        if (!m.join_date) return false
        const [y, mo, d] = m.join_date.split('-').map(Number)
        const jd = new Date(y, mo - 1, d)
        return jd >= fromD && jd <= toD
      })
    }

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Members')

    ws.columns = [
      { header: 'Member ID',      key: 'num',      width: 15 },
      { header: 'Name',           key: 'name',     width: 25 },
      { header: 'Phone',          key: 'phone',    width: 15 },
      { header: 'Status',         key: 'status',   width: 15 },
      { header: 'Gender',         key: 'gender',   width: 10 },
      { header: 'Age',            key: 'age',      width: 8 },
      { header: 'Area',           key: 'area',     width: 20 },
      { header: 'Pending Dues',   key: 'dues',     width: 15 },
      { header: 'Latest Plan',    key: 'plan',     width: 15 },
      { header: 'Join Date',      key: 'joined',   width: 15 },
      { header: 'Plan Starts On', key: 'start',    width: 15 },
      { header: 'Plan Ends On',   key: 'end',      width: 15 },
      { header: 'Legacy ID',      key: 'legacy',   width: 15 },
    ]
    
    ws.getRow(1).font = { bold: true }
    
    toExport.forEach(m => {
      ws.addRow({
        num:    m.member_number ? formatMemberId(m.member_number) : '-',
        name:   m.name,
        phone:  m.phone,
        status: m.status.toUpperCase(),
        gender: m.gender ? m.gender.charAt(0).toUpperCase() + m.gender.slice(1) : '-',
        age:    m.age || '-',
        area:   m.area || '-',
        dues:   m.pending_amount || 0,
        plan:   m.latest_membership ? m.latest_membership.plan : '-',
        joined: formatDate(m.created_at),
        start:  m.latest_membership ? formatDate(m.latest_membership.start_date) : '-',
        end:    m.latest_membership ? formatDate(m.latest_membership.end_date) : '-',
        legacy: m.legacy_member_id || '-',
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `members-${formatDate(new Date().toISOString())}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Members</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdvFilterModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <Filter className="w-4 h-4" />
            <span>Advanced Filter</span>
            {Object.values(advFilters).filter(v => v !== 'all' && v !== null && (Array.isArray(v) ? v.length > 0 : true)).length > 0 && (
              <span className="w-4 h-4 bg-brand-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                !
              </span>
            )}
          </button>
          <button onClick={() => setShowExportModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Members */}
        <div className="card p-3.5 flex items-center gap-3 hover:shadow-md transition-all border border-[#3B82F6]" style={{ backgroundColor: '#EFF6FF' }}>
          <div className="w-9 h-9 bg-[#DBEAFE] rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div>
            <p className="text-xs text-[#475569] font-semibold">Total Members</p>
            <p className="text-lg font-bold text-[#1D4ED8]">{counts.all}</p>
          </div>
        </div>

        {/* Active Members */}
        <div className="card p-3.5 flex items-center gap-3 hover:shadow-md transition-all border border-[#22C55E]" style={{ backgroundColor: '#F0FDF4' }}>
          <div className="w-9 h-9 bg-[#DCFCE7] rounded-xl flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-[#16A34A]" />
          </div>
          <div>
            <p className="text-xs text-[#475569] font-semibold">Active</p>
            <p className="text-lg font-bold text-[#15803D]">{counts.active}</p>
          </div>
        </div>

        {/* Expired Members */}
        <div className="card p-3.5 flex items-center gap-3 hover:shadow-md transition-all border border-[#EF4444]" style={{ backgroundColor: '#FEF2F2' }}>
          <div className="w-9 h-9 bg-[#FEE2E2] rounded-xl flex items-center justify-center flex-shrink-0">
            <X className="w-4 h-4 text-[#DC2626]" />
          </div>
          <div>
            <p className="text-xs text-[#475569] font-semibold">Expired</p>
            <p className="text-lg font-bold text-[#B91C1C]">{counts.expired}</p>
          </div>
        </div>

        {/* Overdue Dues */}
        <div className="card p-3.5 flex items-center gap-3 hover:shadow-md transition-all border border-[#F97316]" style={{ backgroundColor: '#FFF7ED' }}>
          <div className="w-9 h-9 bg-[#FFEDD5] rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-[#EA580C]" />
          </div>
          <div>
            <p className="text-xs text-[#475569] font-semibold">Overdue Dues</p>
            <p className="text-lg font-bold text-[#C2410C]">{counts.overdue}</p>
          </div>
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
                      onClick={() => {
                        try {
                          const saved = localStorage.getItem(`gymflow_getting_started_${gymId}`)
                          const parsed = new Set(saved ? JSON.parse(saved) : [])
                          if (!parsed.has('send_reminder')) {
                            parsed.add('send_reminder')
                            localStorage.setItem(`gymflow_getting_started_${gymId}`, JSON.stringify([...parsed]))
                            window.dispatchEvent(new Event('storage'))
                          }
                        } catch {}
                      }}
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
                            onClick={() => {
                              try {
                                const saved = localStorage.getItem(`gymflow_getting_started_${gymId}`)
                                const parsed = new Set(saved ? JSON.parse(saved) : [])
                                if (!parsed.has('send_reminder')) {
                                  parsed.add('send_reminder')
                                  localStorage.setItem(`gymflow_getting_started_${gymId}`, JSON.stringify([...parsed]))
                                  window.dispatchEvent(new Event('storage'))
                                }
                              } catch {}
                            }}
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

      {/* Advanced Filter Modal */}
      {showAdvFilterModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdvFilterModal(false)} />
          
          {/* Modal Container */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-pop-in">
              {/* Header */}
              <div className="bg-gradient-to-r from-brand-600 to-brand-700 p-6 text-white relative">
                <button
                  onClick={() => setShowAdvFilterModal(false)}
                  className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <Filter className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Advanced Member Filters ✨</h2>
                    <p className="text-white/80 text-sm">Filter by status, plan, payment, gender, age & more</p>
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Quick Filters */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-slate-700">Quick Filters</h3>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">One-click</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => setAdvFilters({...advFilters, quick: advFilters.quick === 'active_expiring' ? null : 'active_expiring'})}
                      className={cn('flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all',
                        advFilters.quick === 'active_expiring' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100')}
                    >
                      <Check className="w-4 h-4" /> Active + Expiring Soon
                    </button>
                    <button
                      onClick={() => setAdvFilters({...advFilters, quick: advFilters.quick === 'unpaid' ? null : 'unpaid'})}
                      className={cn('flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all',
                        advFilters.quick === 'unpaid' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100')}
                    >
                      <CreditCard className="w-4 h-4" /> Unpaid + Overdue
                    </button>
                    <button
                      onClick={() => setAdvFilters({...advFilters, quick: advFilters.quick === 'new' ? null : 'new'})}
                      className={cn('flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all',
                        advFilters.quick === 'new' ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-700 hover:bg-pink-100')}
                    >
                      <Calendar className="w-4 h-4" /> New this Month
                    </button>
                  </div>
                </div>
                
                {/* Grid Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Status */}
                  <div>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1.5">
                      <Users className="w-4 h-4 text-slate-400" /> Member Status
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['active', 'expiring', 'expired'].map(s => (
                        <button
                          key={s}
                          onClick={() => {
                            const current = advFilters.status;
                            const next = current.includes(s) ? current.filter(x => x !== s) : [...current, s];
                            setAdvFilters({...advFilters, status: next});
                          }}
                          className={cn('text-xs font-semibold px-3 py-1.5 rounded-full transition-all',
                            advFilters.status.includes(s) ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                        >
                          {s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Plan */}
                  <div>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1.5">
                      <Target className="w-4 h-4 text-slate-400" /> Membership Plan
                    </label>
                    <select
                      value={advFilters.plan}
                      onChange={e => setAdvFilters({...advFilters, plan: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="all">All Plans</option>
                      {uniquePlans.map(plan => (
                        <option key={plan} value={plan}>{plan}</option>
                      ))}
                    </select>
                  </div>

                  {/* Payment Status */}
                  <div>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1.5">
                      <CreditCard className="w-4 h-4 text-slate-400" /> Payment Status
                    </label>
                    <select
                      value={advFilters.paymentStatus}
                      onChange={e => setAdvFilters({...advFilters, paymentStatus: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="all">All</option>
                      <option value="fully">Fully Paid</option>
                      <option value="partial">Partial Payment</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </div>
                  
                  {/* Gender */}
                  <div>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1.5">
                      <Users className="w-4 h-4 text-slate-400" /> Gender
                    </label>
                    <select
                      value={advFilters.gender}
                      onChange={e => setAdvFilters({...advFilters, gender: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="all">All</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>

                  {/* Age Range */}
                  <div>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1.5">
                      <Hash className="w-4 h-4 text-slate-400" /> Age Range
                    </label>
                    <select
                      value={advFilters.ageRange}
                      onChange={e => setAdvFilters({...advFilters, ageRange: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="all">All</option>
                      <option value="under18">Under 18</option>
                      <option value="18-30">18 - 30</option>
                      <option value="31-50">31 - 50</option>
                      <option value="above50">Above 50</option>
                    </select>
                  </div>
                  
                  {/* Joined */}
                  <div>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1.5">
                      <Calendar className="w-4 h-4 text-slate-400" /> Joined
                    </label>
                    <select
                      value={advFilters.joined}
                      onChange={e => setAdvFilters({...advFilters, joined: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="all">All</option>
                      <option value="today">Today</option>
                      <option value="this-month">This Month</option>
                      <option value="last-3-months">Last 3 Months</option>
                      <option value="last-6-months">Last 6 Months</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-100">
                <button
                  onClick={() => setAdvFilters({ quick: null, status: [], plan: 'all', paymentStatus: 'all', gender: 'all', joined: 'all', ageRange: 'all' })}
                  className="text-sm text-slate-500 hover:text-slate-700 font-semibold flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Clear All
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAdvFilterModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowAdvFilterModal(false)}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-all shadow-md shadow-brand-100"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-pop-in">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">Export Members</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-5 space-y-5">
              <p className="text-sm text-slate-500">Choose a custom joined date range or member status. Leave blank to export all {filtered.length} currently filtered members.</p>
              
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Member Status</label>
                <select 
                  value={exportStatus} 
                  onChange={e => setExportStatus(e.target.value as FilterType | 'all')}
                  className="input-field w-full bg-slate-50"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="expiring">Expiring Soon</option>
                  <option value="expired">Expired Only</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Joined From Date</label>
                  <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} className="input-field w-full bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Joined To Date</label>
                  <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} className="input-field w-full bg-slate-50" />
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => { setShowExportModal(false); exportExcel(); }} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors flex items-center gap-2"><Download className="w-4 h-4"/> Download Excel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}