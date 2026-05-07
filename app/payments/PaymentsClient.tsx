'use client'

import { useState, useMemo } from 'react'
import { CreditCard, Banknote, Smartphone, Search, Download, AlertCircle, Check } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Membership } from '@/types'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, parseISO, isWithinInterval } from 'date-fns'
import ExcelJS from 'exceljs'

interface Payment extends Membership {
  member?: { id: string; name: string; phone: string; member_number: number }
}

interface PendingMember {
  id: string
  name: string
  phone: string
  member_number: number
  pending_amount: number
}

interface Props {
  payments: Payment[]
  pendingMembers: PendingMember[]
  gymId: string
  gymName: string
}

type Period = 'today' | 'week' | 'month' | 'all'
type ModeFilter = 'all' | 'cash' | 'upi' | 'card'

function getPeriodRange(period: Period): { start: Date; end: Date } | null {
  const now = new Date()
  if (period === 'today') return { start: startOfDay(now), end: endOfDay(now) }
  if (period === 'week')  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
  if (period === 'month') return { start: startOfMonth(now), end: endOfMonth(now) }
  return null
}

export function PaymentsClient({ payments, pendingMembers, gymId, gymName }: Props) {
  const [period, setPeriod]   = useState<Period>('month')
  const [modeFilter, setMode] = useState<ModeFilter>('all')
  const [search, setSearch]   = useState('')
  const [showPending, setShowPending] = useState(false)
  const [markingId, setMarkingId]     = useState<string | null>(null)
  const [localPending, setLocalPending] = useState<PendingMember[]>(pendingMembers)
  const supabase = createClient()

  // Sparkline: computed from ALL payments using created_at month bucketing
  const sparkline = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i) // oldest first
      const start = startOfMonth(d)
      const end   = endOfMonth(d)
      const total = payments
        .filter(p => {
          const created = parseISO(p.created_at)
          return isWithinInterval(created, { start, end })
        })
        .reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
      return { label: format(d, 'MMM yy'), total }
    })
  }, [payments])

  const filtered = useMemo(() => {
    const range = getPeriodRange(period)
    return payments.filter(p => {
      if (range) {
        const d = parseISO(p.created_at)
        if (!isWithinInterval(d, range)) return false
      }
      if (modeFilter !== 'all' && p.payment_mode !== modeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !p.member?.name.toLowerCase().includes(q) &&
          !p.member?.phone.includes(q) &&
          !String(p.member?.member_number).includes(q)
        ) return false
      }
      return true
    })
  }, [payments, period, modeFilter, search])

  const totalCollected = filtered.reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
  const cashTotal  = filtered.filter(p => p.payment_mode === 'cash').reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
  const upiTotal   = filtered.filter(p => p.payment_mode === 'upi').reduce((s, p)  => s + p.amount + (p.admission_fee ?? 0), 0)
  const cardTotal  = filtered.filter(p => p.payment_mode === 'card').reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
  const totalPending = localPending.reduce((s, m) => s + m.pending_amount, 0)
  const maxBar = Math.max(...sparkline.map(s => s.total), 1)

  const modeConfig = {
    cash: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <Banknote className="w-4 h-4 text-emerald-600" /> },
    upi:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    icon: <Smartphone className="w-4 h-4 text-blue-600" /> },
    card: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  icon: <CreditCard className="w-4 h-4 text-purple-600" /> },
  }

  async function markPaid(member: PendingMember) {
    setMarkingId(member.id)
    await supabase.from('members').update({ pending_amount: 0 }).eq('id', member.id)
    setLocalPending(prev => prev.filter(m => m.id !== member.id))
    setMarkingId(null)
  }

  async function exportExcel() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Payments')
    ws.columns = [
      { header: 'Member #',       key: 'num',   width: 10 },
      { header: 'Name',           key: 'name',  width: 22 },
      { header: 'Phone',          key: 'phone', width: 14 },
      { header: 'Plan',           key: 'plan',  width: 12 },
      { header: 'Start',          key: 'start', width: 14 },
      { header: 'End',            key: 'end',   width: 14 },
      { header: 'Mode',           key: 'mode',  width: 10 },
      { header: 'Membership Fee', key: 'fee',   width: 16 },
      { header: 'Admission Fee',  key: 'adm',   width: 16 },
      { header: 'Total',          key: 'total', width: 12 },
    ]
    ws.getRow(1).font = { bold: true }
    filtered.forEach(p => {
      ws.addRow({
        num:   p.member?.member_number ?? '',
        name:  p.member?.name ?? '',
        phone: p.member?.phone ?? '',
        plan:  p.plan,
        start: p.start_date,
        end:   p.end_date,
        mode:  p.payment_mode.toUpperCase(),
        fee:   p.amount,
        adm:   p.admission_fee ?? 0,
        total: p.amount + (p.admission_fee ?? 0),
      })
    })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Payments</h1>
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
          <Download className="w-4 h-4" />Export
        </button>
      </div>

      {/* Total collected banner */}
      <div className="card p-5 bg-gradient-to-br from-brand-500 to-brand-600">
        <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">Total Collected</p>
        <p className="text-3xl font-bold text-white">{formatCurrency(totalCollected)}</p>
        <div className="flex flex-wrap gap-4 mt-3">
          <span className="text-white/70 text-xs">Cash <span className="text-white font-bold">{formatCurrency(cashTotal)}</span></span>
          <span className="text-white/70 text-xs">UPI <span className="text-white font-bold">{formatCurrency(upiTotal)}</span></span>
          <span className="text-white/70 text-xs">Card <span className="text-white font-bold">{formatCurrency(cardTotal)}</span></span>
          <span className="text-white/70 text-xs">{filtered.length} transactions</span>
        </div>
      </div>

      {/* 6-month sparkline — built from ALL payments via created_at */}
      <div className="card p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">6-Month Revenue (all payments)</p>
        <div className="flex items-end gap-2 h-16">
          {sparkline.map((s, i) => (
            <div key={s.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${Math.max((s.total / maxBar) * 52, s.total > 0 ? 4 : 0)}px`,
                  background: i === sparkline.length - 1
                    ? 'linear-gradient(to top, #f97316, #fb923c)'
                    : '#e5e7eb',
                }}
              />
              <span className="text-[9px] text-gray-400 whitespace-nowrap">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending dues */}
      {localPending.length > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-bold text-amber-800">
                Pending Dues — {formatCurrency(totalPending)} from {localPending.length} members
              </p>
            </div>
            <button onClick={() => setShowPending(p => !p)}
              className="text-xs font-semibold text-amber-700 hover:underline">
              {showPending ? 'Hide' : 'Show'}
            </button>
          </div>
          {showPending && (
            <div className="space-y-2">
              {localPending.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-amber-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {m.name}
                      <span className="ml-2 text-xs text-gray-400 font-mono">#{m.member_number}</span>
                    </p>
                    <p className="text-xs text-gray-400">{m.phone}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-red-600">{formatCurrency(m.pending_amount)}</span>
                    <button onClick={() => markPaid(m)} disabled={markingId === m.id}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-all disabled:opacity-50">
                      <Check className="w-3 h-3" />{markingId === m.id ? '...' : 'Mark Paid'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'
              }`}>
              {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'cash', 'upi', 'card'] as ModeFilter[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                modeFilter === m ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'
              }`}>
              {m === 'all' ? 'All Modes' : m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="search" placeholder="Search by name, phone or ID..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-9" />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-gray-400 text-sm">No payments found</div>
        ) : filtered.map(payment => {
          const mode = payment.payment_mode as 'cash' | 'upi' | 'card'
          const { bg, text, border, icon } = modeConfig[mode]
          const total = payment.amount + (payment.admission_fee ?? 0)
          return (
            <div key={payment.id} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{payment.member?.name ?? 'Unknown'}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{payment.plan} · {formatDate(payment.start_date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">{formatCurrency(total)}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border mt-0.5 inline-block ${bg} ${text} ${border}`}>
                  {mode.toUpperCase()}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">#</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Member</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Plan</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Period</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Mode</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No payments found</td></tr>
            ) : filtered.map(payment => {
              const mode = payment.payment_mode as 'cash' | 'upi' | 'card'
              const { bg, text, border, icon } = modeConfig[mode]
              const admFee = payment.admission_fee ?? 0
              const total  = payment.amount + admFee
              return (
                <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-400">#{payment.member?.member_number}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-gray-900">{payment.member?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{payment.member?.phone}</p>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 capitalize">{payment.plan}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">{formatDate(payment.start_date)} – {formatDate(payment.end_date)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${bg} ${text} ${border}`}>
                      {icon}{mode.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(total)}</p>
                    {admFee > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatCurrency(payment.amount)} + {formatCurrency(admFee)} adm
                      </p>
                    )}
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
