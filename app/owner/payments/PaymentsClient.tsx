'use client'

import { useState, useMemo } from 'react'
import { CreditCard, Banknote, Smartphone, Search, Download, AlertCircle, Check } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns'
import { getAllTimePayments } from './actions'
import { useGymRealtime } from '@/lib/hooks/useGymRealtime'

interface Payment {
  id: string
  member_id: string
  gym_id?: string
  plan: string
  start_date: string
  end_date: string
  amount: number
  admission_fee: number | null
  due_amount: number | null
  payment_mode: string
  created_at: string
  member?: { id: string; name: string; phone: string; member_number: number }
}

interface DuePayment {
  id: string
  member_id: string
  gym_id?: string
  amount: number
  payment_mode: string
  created_at: string
  member?: { id: string; name: string; phone: string; member_number: number }
}

interface ProductSale {
  id: string
  product_name: string
  variant_name: string
  quantity: number
  unit_price: number
  total_price: number
  payment_mode: string
  sold_at: string
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
  productSales?: ProductSale[]
  duePayments?: DuePayment[]
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

function buildTransactions(mList: Payment[], sList: ProductSale[], dList: DuePayment[]) {
  const m = mList.map(p => ({
    id: p.id,
    type: 'membership' as const,
    timestamp: p.created_at, // Revenue is recognized when collected (created_at), not start_date
    amount: p.amount + (p.admission_fee ?? 0) - (p.due_amount ?? 0),
    base_amount: p.amount,
    admission_fee: p.admission_fee ?? 0,
    due_amount: p.due_amount ?? 0,
    mode: p.payment_mode,
    title: p.member?.name ?? 'Unknown',
    subtitle: p.member?.phone ?? '',
    col3: p.plan,
    col4: `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`,
    feeBreakdown: p.admission_fee && p.admission_fee > 0 ? `${formatCurrency(p.amount)} + ${formatCurrency(p.admission_fee)} adm${p.due_amount ? ` - ${formatCurrency(p.due_amount)} due` : ''}` : undefined,
    member_number: p.member?.member_number
  }))

  const s = sList.map(ps => ({
    id: ps.id,
    type: 'inventory' as const,
    timestamp: ps.sold_at,
    amount: Number(ps.total_price),
    base_amount: Number(ps.total_price),
    admission_fee: 0,
    mode: ps.payment_mode,
    title: 'Inventory Sale',
    subtitle: 'Walk-in / Direct',
    col3: ps.product_name,
    col4: `${ps.variant_name} (x${ps.quantity})`,
    feeBreakdown: undefined,
    member_number: undefined
  }))

  const d = dList.map(dp => ({
    id: dp.id,
    type: 'due' as const,
    timestamp: dp.created_at,
    amount: Number(dp.amount),
    base_amount: Number(dp.amount),
    admission_fee: 0,
    due_amount: 0,
    mode: dp.payment_mode,
    title: dp.member?.name ?? 'Unknown',
    subtitle: dp.member?.phone ?? '',
    col3: 'Due Collection',
    col4: '-',
    feeBreakdown: undefined,
    member_number: dp.member?.member_number
  }))

  return [...m, ...s, ...d].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function PaymentsClient({ payments, productSales = [], duePayments = [], pendingMembers, gymId, gymName }: Props) {
  const [period, setPeriod]   = useState<Period>('month')
  const [modeFilter, setMode] = useState<ModeFilter>('all')

  // Auto-refresh when memberships, inventory sales, or due payments change.
  useGymRealtime(gymId, ['memberships', 'inventory_sales', 'due_payments'])
  const [search, setSearch]   = useState('')
  const [idSearch, setIdSearch] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [showPending, setShowPending] = useState(false)
  const [markingId, setMarkingId]     = useState<string | null>(null)
  const [localPending, setLocalPending] = useState<PendingMember[]>(pendingMembers)
  const [activeTab, setActiveTab]     = useState<'membership' | 'inventory' | 'due'>('membership')
  const [fullPayments, setFullPayments] = useState<Payment[] | null>(null)
  const [fullSales, setFullSales] = useState<ProductSale[] | null>(null)
  const [fullDuePayments, setFullDuePayments] = useState<DuePayment[] | null>(null)
  const [isLoadingAllTime, setIsLoadingAllTime] = useState(false)
  
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportOptions, setExportOptions] = useState({ 
    memberships: true, 
    inventory: true, 
    dues: true,
    period: 'month' as Period,
    customFrom: '',
    customTo: '',
    mode: 'all' as ModeFilter
  })
  
  const activePayments = fullPayments ?? payments
  const activeSales = fullSales ?? productSales
  const activeDuePayments = fullDuePayments ?? duePayments

  const allTransactions = useMemo(() => {
    return buildTransactions(activePayments, activeSales, activeDuePayments)
  }, [activePayments, activeSales, activeDuePayments])

  const filtered = useMemo(() => {
    const range = period === 'custom' && customFrom && customTo
      ? { start: startOfDay(parseISO(customFrom)), end: endOfDay(parseISO(customTo)) }
      : getPeriodRange(period)
    return allTransactions.filter(p => {
      if (range && !isWithinInterval(parseISO(p.timestamp), range)) return false
      if (modeFilter !== 'all' && p.mode !== modeFilter) return false
      
      if (idSearch) {
        if (p.type !== 'membership' || !String(p.member_number).includes(idSearch.trim())) return false
      }
      
      if (search) {
        const q = search.toLowerCase()
        if (
          !p.title.toLowerCase().includes(q) &&
          !p.subtitle.toLowerCase().includes(q) &&
          !p.col3.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [allTransactions, period, modeFilter, search, idSearch, customFrom, customTo])

  // Memoize derived computations to avoid re-iterating on every render
  const { totalCollected, cashTotal, upiTotal, cardTotal, membershipTransactions, inventoryTransactions, dueTransactions } = useMemo(() => {
    let total = 0, cash = 0, upi = 0, card = 0
    const membership: typeof filtered = []
    const inventory: typeof filtered = []
    const due: typeof filtered = []

    for (const p of filtered) {
      total += p.amount
      if (p.mode === 'cash') cash += p.amount
      else if (p.mode === 'upi') upi += p.amount
      else if (p.mode === 'card') card += p.amount

      if (p.type === 'membership') membership.push(p)
      else if (p.type === 'inventory') inventory.push(p)
      else if (p.type === 'due') due.push(p)
    }

    return {
      totalCollected: total,
      cashTotal: cash,
      upiTotal: upi,
      cardTotal: card,
      membershipTransactions: membership,
      inventoryTransactions: inventory,
      dueTransactions: due,
    }
  }, [filtered])

  const totalPending = useMemo(() => localPending.reduce((s, m) => s + m.pending_amount, 0), [localPending])
  const displayTransactions = activeTab === 'membership' ? membershipTransactions : activeTab === 'inventory' ? inventoryTransactions : dueTransactions

  const modeConfig = {
    cash: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <Banknote className="w-4 h-4 text-emerald-600" /> },
    upi:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    icon: <Smartphone className="w-4 h-4 text-blue-600" /> },
    card: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  icon: <CreditCard className="w-4 h-4 text-purple-600" /> },
  }

  async function markPaid(member: PendingMember) {
    setMarkingId(member.id)
    await fetch('/api/dues/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: member.id }),
    })
    setLocalPending(prev => prev.filter(m => m.id !== member.id))
    setMarkingId(null)
  }

  async function handlePeriodChange(p: Period) {
    setPeriod(p)
    if (p === 'all' && !fullPayments) {
      setIsLoadingAllTime(true)
      try {
        const data = await getAllTimePayments(gymId)
        setFullPayments(data.payments as any)
        setFullSales(data.productSales as any)
        setFullDuePayments(data.duePayments as any)
      } finally {
        setIsLoadingAllTime(false)
      }
    }
  }

  async function exportExcel() {
    let rawPayments = fullPayments ?? payments
    let rawSales = fullSales ?? productSales
    let rawDues = fullDuePayments ?? duePayments

    if (!fullPayments) {
      setIsLoadingAllTime(true)
      try {
        const data = await getAllTimePayments(gymId)
        setFullPayments(data.payments as any)
        setFullSales(data.productSales as any)
        setFullDuePayments(data.duePayments as any)
        
        rawPayments = data.payments as any
        rawSales = data.productSales as any
        rawDues = data.duePayments as any
      } finally {
        setIsLoadingAllTime(false)
      }
    }

    const allT = buildTransactions(rawPayments, rawSales, rawDues)

    const range = exportOptions.period === 'custom' && exportOptions.customFrom && exportOptions.customTo
      ? { start: startOfDay(parseISO(exportOptions.customFrom)), end: endOfDay(parseISO(exportOptions.customTo)) }
      : getPeriodRange(exportOptions.period)

    const filteredExport = allT.filter(p => {
      if (range && !isWithinInterval(parseISO(p.timestamp), range)) return false
      if (exportOptions.mode !== 'all' && p.mode !== exportOptions.mode) return false
      return true
    })

    const currentM = exportOptions.memberships ? filteredExport.filter(t => t.type === 'membership') : []
    const currentI = exportOptions.inventory ? filteredExport.filter(t => t.type === 'inventory') : []
    const currentD = exportOptions.dues ? filteredExport.filter(t => t.type === 'due') : []

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    
    let worksheetAdded = false

    if (currentM.length > 0) {
      worksheetAdded = true
      const wsMembers = wb.addWorksheet('Membership Payments')
      wsMembers.columns = [
        { header: 'Member #',       key: 'num',   width: 10 },
        { header: 'Name',           key: 'name',  width: 22 },
        { header: 'Phone',          key: 'phone', width: 14 },
        { header: 'Plan',           key: 'plan',  width: 12 },
        { header: 'Mode',           key: 'mode',  width: 10 },
        { header: 'Membership Fee', key: 'fee',   width: 16 },
        { header: 'Admission Fee',  key: 'adm',   width: 16 },
        { header: 'Total',          key: 'total', width: 12 },
      ]
      wsMembers.getRow(1).font = { bold: true }
      currentM.forEach(p => {
        wsMembers.addRow({
          num:   p.member_number ?? '-',
          name:  p.title,
          phone: p.subtitle,
          plan:  p.col3,
          mode:  p.mode.toUpperCase(),
          fee:   p.base_amount,
          adm:   p.admission_fee,
          total: p.amount,
        })
      })
    }

    if (currentI.length > 0) {
      worksheetAdded = true
      const wsInv = wb.addWorksheet('Inventory Payments')
      wsInv.columns = [
        { header: 'Date',     key: 'date',  width: 20 },
        { header: 'Product',  key: 'prod',  width: 22 },
        { header: 'Variant',  key: 'var',   width: 20 },
        { header: 'Mode',     key: 'mode',  width: 10 },
        { header: 'Total',    key: 'total', width: 12 },
      ]
      wsInv.getRow(1).font = { bold: true }
      currentI.forEach(p => {
        wsInv.addRow({
          date:  formatDate(p.timestamp),
          prod:  p.col3,
          var:   p.col4,
          mode:  p.mode.toUpperCase(),
          total: p.amount,
        })
      })
    }

    if (currentD.length > 0) {
      worksheetAdded = true
      const wsDues = wb.addWorksheet('Due Payments')
      wsDues.columns = [
        { header: 'Member #',       key: 'num',   width: 10 },
        { header: 'Name',           key: 'name',  width: 22 },
        { header: 'Phone',          key: 'phone', width: 14 },
        { header: 'Mode',           key: 'mode',  width: 10 },
        { header: 'Amount',         key: 'total', width: 12 },
        { header: 'Date Collected', key: 'date',  width: 20 },
      ]
      wsDues.getRow(1).font = { bold: true }
      currentD.forEach(p => {
        wsDues.addRow({
          num:   p.member_number ?? '-',
          name:  p.title,
          phone: p.subtitle,
          mode:  p.mode.toUpperCase(),
          total: p.amount,
          date:  formatDate(p.timestamp)
        })
      })
    }

    if (!worksheetAdded) {
      wb.addWorksheet('Payments')
    }

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
    <div className="space-y-4 md:space-y-5 w-full">
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">Payments</h1>
        <button onClick={() => {
          setExportOptions({ memberships: true, inventory: true, dues: true, period, customFrom, customTo, mode: modeFilter })
          setShowExportModal(true)
        }} disabled={isLoadingAllTime}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50 self-start xs:self-auto">
          <Download className="w-4 h-4" />{isLoadingAllTime ? 'Loading...' : 'Export'}
        </button>
      </div>

      <div className="card p-4 xs:p-5 bg-gradient-to-br from-brand-500 to-brand-600">
        <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">
          {period === 'today' ? "Today's Collection"
            : period === 'week' ? "This Week's Collection"
            : period === 'month' ? "This Month's Collection"
            : period === 'custom' && customFrom && customTo ? `${customFrom} → ${customTo}`
            : 'All Time Collection'}
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 xs:gap-4">
          <div>
            <p className="text-2xl xs:text-3xl font-bold text-white">{formatCurrency(totalCollected)}</p>
            <div className="flex flex-wrap gap-3 xs:gap-4 mt-3">
              <span className="text-white/70 text-xs">Cash <span className="text-white font-bold">{formatCurrency(cashTotal)}</span></span>
              <span className="text-white/70 text-xs">UPI <span className="text-white font-bold">{formatCurrency(upiTotal)}</span></span>
              <span className="text-white/70 text-xs">Card <span className="text-white font-bold">{formatCurrency(cardTotal)}</span></span>
              <span className="text-white/70 text-xs">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="flex sm:flex-col gap-3 sm:gap-1 text-xs xs:text-sm bg-black/10 px-3 xs:px-4 py-2 xs:py-2.5 rounded-lg border border-white/10">
            <p className="text-white/90">Memberships: <span className="font-bold text-white">{formatCurrency(membershipTransactions.reduce((s, p) => s + p.amount, 0))}</span></p>
            <p className="text-white/90">Inventory: <span className="font-bold text-white">{formatCurrency(inventoryTransactions.reduce((s, p) => s + p.amount, 0))}</span></p>
            <p className="text-white/90">Dues Collected: <span className="font-bold text-white">{formatCurrency(dueTransactions.reduce((s, p) => s + p.amount, 0))}</span></p>
          </div>
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
            <button key={p} onClick={() => handlePeriodChange(p)} disabled={isLoadingAllTime}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
                period === p ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'
              }`}>
              {p === 'all' && isLoadingAllTime && period !== 'all' ? 'Loading...' : p === 'all' ? 'All Time' : p === 'custom' ? 'Custom' : p.charAt(0).toUpperCase() + p.slice(1)}
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
            <span className="text-xs text-slate-400 font-medium">{displayTransactions.length} result{displayTransactions.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      <div className="flex border-b border-slate-200 mt-2">
        <button onClick={() => setActiveTab('membership')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'membership' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}>
          Memberships ({membershipTransactions.length})
        </button>
        <button onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'inventory' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}>
          Inventory ({inventoryTransactions.length})
        </button>
        <button onClick={() => setActiveTab('due')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'due' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}>
          Dues ({dueTransactions.length})
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="search" placeholder={activeTab === 'membership' ? "Search by name or phone..." : activeTab === 'due' ? "Search dues..." : "Search product..."}
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" />
        </div>
        {(activeTab === 'membership' || activeTab === 'due') && (
          <div className="relative sm:w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">#</span>
            <input type="search" placeholder="Member ID"
              value={idSearch} onChange={e => setIdSearch(e.target.value)}
              className="input-field pl-7" />
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {displayTransactions.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">No transactions found</div>
        ) : displayTransactions.map(payment => {
          const mode = payment.mode as 'cash' | 'upi' | 'card'
          const { bg, text, border, icon } = modeConfig[mode]
          return (
            <div key={payment.id} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm">{payment.title}</p>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">{payment.col3} · {formatDate(payment.timestamp)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-slate-900">{formatCurrency(payment.amount)}</p>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {activeTab === 'membership' || activeTab === 'due' ? (
                <>
                  <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide hidden lg:table-cell">#</th>
                  <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Member</th>
                  <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide hidden xl:table-cell">
                    {activeTab === 'membership' ? 'Plan' : 'Type'}
                  </th>
                  <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide hidden lg:table-cell">
                    {activeTab === 'membership' ? 'Period' : 'Date'}
                  </th>
                </>
              ) : (
                <>
                  <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Product</th>
                  <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Variant</th>
                </>
              )}
              <th className="text-left px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Mode</th>
              <th className="text-right px-4 xl:px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {displayTransactions.length === 0 ? (
              <tr><td colSpan={activeTab === 'membership' ? 6 : 5} className="px-5 py-12 text-center text-slate-400">No transactions found</td></tr>
            ) : displayTransactions.map(payment => {
              const mode = payment.mode as 'cash' | 'upi' | 'card'
              const { bg, text, border, icon } = modeConfig[mode]
              return (
                <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                  {activeTab === 'membership' || activeTab === 'due' ? (
                    <>
                      <td className="px-4 xl:px-5 py-3.5 font-mono text-xs text-slate-400 hidden lg:table-cell">
                        {payment.member_number ? `#${payment.member_number}` : '-'}
                      </td>
                      <td className="px-4 xl:px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{payment.title}</p>
                        <p className="text-xs text-slate-400">{payment.subtitle}</p>
                      </td>
                      <td className="px-4 xl:px-5 py-3.5 text-slate-500 capitalize hidden xl:table-cell">
                        {payment.col3}
                      </td>
                      <td className="px-4 xl:px-5 py-3.5 text-slate-500 text-xs hidden lg:table-cell">
                        {activeTab === 'due' ? formatDate(payment.timestamp) : payment.col4}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 xl:px-5 py-3.5 text-slate-500 text-xs">
                        {formatDate(payment.timestamp)}
                      </td>
                      <td className="px-4 xl:px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{payment.col3}</p>
                      </td>
                      <td className="px-4 xl:px-5 py-3.5 text-slate-500 hidden lg:table-cell">
                        {payment.col4}
                      </td>
                    </>
                  )}
                  <td className="px-4 xl:px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${bg} ${text} ${border}`}>
                      {icon}{mode.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 xl:px-5 py-3.5 text-right">
                    <p className="font-bold text-slate-900">{formatCurrency(payment.amount)}</p>
                    {payment.feeBreakdown && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {payment.feeBreakdown}
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

      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Customize Export</h2>
              <p className="text-sm text-slate-500 mt-1">Select which transaction types to include in your Excel file.</p>
            </div>
            <div className="p-5 space-y-4 bg-slate-50 max-h-[60vh] overflow-y-auto no-scrollbar">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Data Types</label>
                <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-brand-500 transition-colors">
                  <input type="checkbox" checked={exportOptions.memberships} onChange={(e) => setExportOptions(prev => ({ ...prev, memberships: e.target.checked }))} className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-600" />
                  <span className="text-sm font-semibold text-slate-700">Memberships</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-brand-500 transition-colors">
                  <input type="checkbox" checked={exportOptions.inventory} onChange={(e) => setExportOptions(prev => ({ ...prev, inventory: e.target.checked }))} className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-600" />
                  <span className="text-sm font-semibold text-slate-700">Inventory Sales</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-brand-500 transition-colors">
                  <input type="checkbox" checked={exportOptions.dues} onChange={(e) => setExportOptions(prev => ({ ...prev, dues: e.target.checked }))} className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-600" />
                  <span className="text-sm font-semibold text-slate-700">Due Collections</span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Date Range</label>
                <select value={exportOptions.period} onChange={(e) => setExportOptions(prev => ({ ...prev, period: e.target.value as Period }))} className="input-field w-full">
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="all">All Time</option>
                  <option value="custom">Custom Date Range</option>
                </select>
                {exportOptions.period === 'custom' && (
                  <div className="flex gap-2 mt-2">
                    <input type="date" value={exportOptions.customFrom} onChange={e => setExportOptions(prev => ({ ...prev, customFrom: e.target.value }))} className="input-field flex-1" />
                    <input type="date" value={exportOptions.customTo} onChange={e => setExportOptions(prev => ({ ...prev, customTo: e.target.value }))} className="input-field flex-1" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Payment Mode</label>
                <select value={exportOptions.mode} onChange={(e) => setExportOptions(prev => ({ ...prev, mode: e.target.value as ModeFilter }))} className="input-field w-full">
                  <option value="all">All Modes</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>
            <div className="p-4 bg-white flex gap-3">
              <button onClick={() => setShowExportModal(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => { setShowExportModal(false); exportExcel(); }} disabled={!exportOptions.memberships && !exportOptions.inventory && !exportOptions.dues} className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50">
                Export Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
