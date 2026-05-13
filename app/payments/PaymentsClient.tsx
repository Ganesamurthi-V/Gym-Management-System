'use client'

import { useState, useMemo } from 'react'
import { CreditCard, Banknote, Smartphone, Search, Download, AlertCircle, Check } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns'

interface Payment {
  id: string
  member_id: string
  gym_id: string
  plan: string
  start_date: string
  end_date: string
  amount: number
  admission_fee: number | null
  payment_mode: string
  created_at: string
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

type Period = 'today' | 'week' | 'month' | 'all' | 'custom'
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
  const [idSearch, setIdSearch] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [showPending, setShowPending] = useState(false)
  const [markingId, setMarkingId]     = useState<string | null>(null)
  const [localPending, setLocalPending] = useState<PendingMember[]>(pendingMembers)
  const supabase = createClient()

  const filtered = useMemo(() => {
    const range = period === 'custom' && customFrom && customTo
      ? { start: startOfDay(parseISO(customFrom)), end: endOfDay(parseISO(customTo)) }
      : getPeriodRange(period)
    return payments.filter(p => {
      if (range && !isWithinInterval(parseISO(p.start_date), range)) return false
      if (modeFilter !== 'all' && p.payment_mode !== modeFilter) return false
      if (idSearch && !String(p.member?.member_number).includes(idSearch.trim())) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !p.member?.name.toLowerCase().includes(q) &&
          !p.member?.phone.includes(q)
        ) return false
      }
      return true
    })
  }, [payments, period, modeFilter, search, idSearch, customFrom, customTo])

  const totalCollected = filtered.reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
  const cashTotal  = filtered.filter(p => p.payment_mode === 'cash').reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
  const upiTotal   = filtered.filter(p => p.payment_mode === 'upi').reduce((s, p)  => s + p.amount + (p.admission_fee ?? 0), 0)
  const cardTotal  = filtered.filter(p => p.payment_mode === 'card').reduce((s, p) => s + p.amount + (p.admission_fee ?? 0), 0)
  const totalPending = localPending.reduce((s, m) => s + m.pending_amount, 0)

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
    const ExcelJS = (await import('exceljs')).default
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Payments</h1>
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
          <Download className="w-4 h-4" />Export
        </button>
      </div>

      <div className="card p-5 bg-gradient-to-br from-brand-500 to-brand-600">
        <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">
          {period === 'today' ? "Today's Collection"
            : period === 'week' ? "This Week's Collection"
            : period === 'month' ? "This Month's Collection"
            : period === 'custom' && customFrom && customTo ? `${customFrom} → ${customTo}`
            : 'All Time Collection'}
        </p>
        <p className="text-3xl font-bold text-white">{formatCurrency(totalCollected)}</p>
        <div className="flex flex-wrap gap-4 mt-3">
          <span className="text-white/70 text-xs">Cash <span className="text-white font-bold">{formatCurrency(cashTotal)}</span></span>
          <span className="text-white/70 text-xs">UPI <span className="text-white font-bold">{formatCurrency(upiTotal)}</span></span>
          <span className="text-white/70 text-xs">Card <span className="text-white font-bold">{formatCurrency(cardTotal)}</span></span>
          <span className="text-white/70 text-xs">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

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
                    <p className="text-sm font-semibold text-slate-900">
                      {m.name}
                      <span className="ml-2 text-xs text-slate-400 font-mono">#{m.member_number}</span>
                    </p>
                    <p className="text-xs text-slate-400">{m.phone}</p>
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

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['today', 'week', 'month', 'all', 'custom'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'
              }`}>
              {p === 'all' ? 'All Time' : p === 'custom' ? 'Custom' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'cash', 'upi', 'card'] as ModeFilter[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                modeFilter === m ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'
              }`}>
              {m === 'all' ? 'All Modes' : m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="input-field w-40" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="input-field w-40" />
          </div>
          {customFrom && customTo && (
            <span className="text-xs text-slate-400 font-medium">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="search" placeholder="Search by name or phone..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" />
        </div>
        <div className="relative w-36">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">#</span>
          <input type="search" placeholder="Member ID"
            value={idSearch} onChange={e => setIdSearch(e.target.value)}
            className="input-field pl-7" />
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">No payments found</div>
        ) : filtered.map(payment => {
          const mode = payment.payment_mode as 'cash' | 'upi' | 'card'
          const { bg, text, border, icon } = modeConfig[mode]
          const total = payment.amount + (payment.admission_fee ?? 0)
          return (
            <div key={payment.id} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm">{payment.member?.name ?? 'Unknown'}</p>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">{payment.plan} · {formatDate(payment.start_date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-slate-900">{formatCurrency(total)}</p>
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
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">#</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Member</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Plan</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Period</th>
              <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Mode</th>
              <th className="text-right px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">No payments found</td></tr>
            ) : filtered.map(payment => {
              const mode = payment.payment_mode as 'cash' | 'upi' | 'card'
              const { bg, text, border, icon } = modeConfig[mode]
              const admFee = payment.admission_fee ?? 0
              const total  = payment.amount + admFee
              return (
                <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-400">#{payment.member?.member_number}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900">{payment.member?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{payment.member?.phone}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 capitalize">{payment.plan}</td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(payment.start_date)} – {formatDate(payment.end_date)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${bg} ${text} ${border}`}>
                      {icon}{mode.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="font-bold text-slate-900">{formatCurrency(total)}</p>
                    {admFee > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
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
