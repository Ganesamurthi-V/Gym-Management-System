'use client'

import { useState, useMemo } from 'react'
import {
  Users, XCircle, TrendingUp, Download, UserCheck,
  BarChart2, MapPin, Calendar, CreditCard, Receipt,
  MessageCircle, MapPinned, PieChart, ChevronRight
} from 'lucide-react'
import { formatCurrency, formatDate, buildWhatsAppLink, cn } from '@/lib/utils'
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface MonthData {
  label: string
  total: number
  cash: number
  upi: number
  card: number
  transactions: number
  newMembers: number
}

interface MemberDue {
  name: string
  phone: string
  amount: number
}

interface Props {
  months: MonthData[]
  expiredCount: number
  activeCount: number
  totalMembers: number
  planCounts: { monthly: number; quarterly: number; annual: number }
  genderCounts: { male: number; female: number; other: number; unknown: number }
  ageBuckets: Record<string, number>
  newMembersByMonth: { label: string; count: number }[]
  churnCount: number
  attendanceByDay: { name: string; count: number }[]
  topAreas: { area: string; count: number }[]
  gymName: string
  gymCity?: string | null
  gymGST?: string | null
  gymPhone?: string | null
  membersWithDues: MemberDue[]
  totalDuesAmount: number
}

type DateRange = 'this-month' | 'last-month' | 'this-quarter' | 'custom'

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, iconColor }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string; iconColor: string
}) {
  return (
    <div className="card p-4 md:p-5 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
        <p className="text-sm font-medium text-slate-500 mt-1">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
          {sub}
        </p>}
      </div>
    </div>
  )
}

export function ReportsClient({
  months, expiredCount, activeCount, totalMembers,
  planCounts, genderCounts, ageBuckets,
  newMembersByMonth, churnCount, attendanceByDay, topAreas, gymName,
  gymCity, gymGST, gymPhone,
  membersWithDues, totalDuesAmount
}: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('this-month')
  const [customStart, setCustomStart] = useState(format(subMonths(new Date(), 1), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'))

  const filteredMonths = useMemo(() => {
    switch (dateRange) {
      case 'this-month':
        return months.slice(0, 1)
      case 'last-month':
        return months.slice(1, 2)
      case 'this-quarter':
        return months.slice(0, 3)
      case 'custom':
        return months.filter(m => {
          const mDate = parseISO(format(startOfMonth(new Date(m.label)), 'yyyy-MM-dd'))
          return isWithinInterval(mDate, {
            start: startOfMonth(parseISO(customStart)),
            end: endOfMonth(parseISO(customEnd))
          })
        })
      default:
        return months
    }
  }, [months, dateRange, customStart, customEnd])

  const maxRevenue = Math.max(...months.map(m => m.total), 1)
  const maxNewMembers = Math.max(...newMembersByMonth.map(m => m.count), 1)
  const maxAttendance = Math.max(...attendanceByDay.map(d => d.count), 1)
  const maxArea = Math.max(...topAreas.map(a => a.count), 1)
  const totalPlanCount = planCounts.monthly + planCounts.quarterly + planCounts.annual || 1
  const totalGender = genderCounts.male + genderCounts.female + genderCounts.other + genderCounts.unknown || 1

  const currentRevenue = filteredMonths.reduce((acc, m) => acc + m.total, 0)
  const filteredNewMembers = useMemo(() => {
    if (dateRange === 'custom') {
      return newMembersByMonth.filter(m => {
        const mDate = parseISO(format(startOfMonth(new Date(m.label)), 'yyyy-MM-dd'))
        return isWithinInterval(mDate, {
          start: startOfMonth(parseISO(customStart)),
          end: endOfMonth(parseISO(customEnd))
        })
      }).reduce((acc, m) => acc + m.count, 0)
    }
    const sliceMap: Record<string, number> = { 'this-month': 1, 'last-month': 1, 'this-quarter': 3 }
    const slice = sliceMap[dateRange] || 6
    const startIndex = dateRange === 'last-month' ? 1 : 0
    return newMembersByMonth.slice(startIndex, startIndex + (dateRange === 'last-month' ? 1 : slice)).reduce((acc, m) => acc + m.count, 0)
  }, [newMembersByMonth, dateRange, customStart, customEnd])

  const attendanceRate = totalMembers > 0 ? Math.round((attendanceByDay.reduce((acc, d) => acc + d.count, 0) / (totalMembers * 90)) * 100) : 0

  function exportPDF() {
    const doc = new jsPDF()
    const today = formatDate(new Date().toISOString())

    // 1. Letterhead
    doc.setFillColor(249, 115, 22) // brand-500
    doc.rect(0, 0, 210, 40, 'F')

    doc.setFontSize(28)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text(gymName.toUpperCase(), 14, 25)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`${gymCity || 'Tamil Nadu / Puducherry'} | GST: ${gymGST || 'N/A'} | Contact: ${gymPhone || 'N/A'}`, 14, 33)

    // 2. Report period and generated date
    let currentY = 55
    doc.setFontSize(16)
    doc.setTextColor(17, 24, 39)
    doc.text('Business Intelligence Report', 14, currentY)

    doc.setFontSize(10)
    doc.setTextColor(107, 114, 128)
    doc.text(`Period: ${dateRange.replace(/-/g, ' ').toUpperCase()}`, 14, currentY + 7)
    doc.text(`Generated: ${today}`, 196, currentY + 7, { align: 'right' })

    // 3. Summary stat boxes (3x2 grid)
    currentY += 15
    const cardWidth = 62
    const cardHeight = 28
    const gutter = 5

    const drawStat = (label: string, value: string, x: number, y: number, isLast = false) => {
      doc.setFillColor(249, 250, 251)
      doc.setDrawColor(229, 231, 235)
      doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD')
      doc.setFontSize(8)
      doc.setTextColor(107, 114, 128)
      doc.setFont('helvetica', 'bold')
      doc.text(label.toUpperCase(), x + 5, y + 8)
      doc.setFontSize(14)
      doc.setTextColor(isLast ? 185 : 17, isLast ? 28 : 24, isLast ? 28 : 39)
      doc.text(value, x + 5, y + 19)
    }

    drawStat('Total Revenue', formatCurrency(currentRevenue), 14, currentY)
    drawStat('Active Members', activeCount.toString(), 14 + cardWidth + gutter, currentY)
    drawStat('Avg Monthly', formatCurrency(Math.round(months.reduce((a, b) => a + b.total, 0) / 6)), 14 + (cardWidth + gutter) * 2, currentY)

    currentY += cardHeight + gutter
    drawStat('New Members', filteredNewMembers.toString(), 14, currentY)
    drawStat('Attendance Rate', `${attendanceRate}%`, 14 + cardWidth + gutter, currentY)
    drawStat('Total Dues', formatCurrency(totalDuesAmount), 14 + (cardWidth + gutter) * 2, currentY, true)

    currentY += cardHeight + 15

    // 4. Revenue trend table
    doc.setFontSize(12)
    doc.setTextColor(17, 24, 39)
    doc.text('Revenue Analytics (Last 6 Months)', 14, currentY)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Month', 'Cash', 'UPI', 'Transactions', 'Revenue']],
      body: months.map(m => [
        m.label,
        formatCurrency(m.cash),
        formatCurrency(m.upi),
        m.transactions,
        formatCurrency(m.total)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    })

    currentY = (doc as any).lastAutoTable.finalY + 15

    // 5. Demographics (Gender & Plan)
    doc.setFontSize(12)
    doc.text('Member Demographics & Plans', 14, currentY)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Segment', 'Male', 'Female', 'Monthly', 'Quarterly', 'Annual']],
      body: [[
        'Count',
        genderCounts.male,
        genderCounts.female,
        planCounts.monthly,
        planCounts.quarterly,
        planCounts.annual
      ]],
      theme: 'grid',
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] },
      styles: { halign: 'center' },
      margin: { left: 14, right: 14 }
    })

    // New page
    doc.addPage()
    currentY = 20

    // 6. Area-wise distribution
    doc.setFontSize(12)
    doc.text('Geographic Distribution (Top Localities)', 14, currentY)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Area / Locality', 'Members', 'Percentage']],
      body: topAreas.map(a => [a.area, a.count, `${Math.round(a.count / totalMembers * 100)}%`]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
      margin: { left: 14, right: 14 }
    })

    currentY = (doc as any).lastAutoTable.finalY + 15

    // 7. Age distribution
    doc.setFontSize(12)
    doc.text('Age Group Breakdown', 14, currentY)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Age Range', 'Member Count', 'Status']],
      body: Object.entries(ageBuckets).map(([range, count]) => [
        range,
        count,
        count > (totalMembers / 4) ? 'High' : 'Normal'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] },
      margin: { left: 14, right: 14 }
    })

    currentY = (doc as any).lastAutoTable.finalY + 15

    // 8. Dues list (Critical)
    if (membersWithDues.length > 0) {
      doc.setTextColor(185, 28, 28)
      doc.text('Overdue Collection List', 14, currentY)
      currentY += 5

      autoTable(doc, {
        startY: currentY,
        head: [['Member Name', 'Phone', 'Pending Amount']],
        body: membersWithDues.map(m => [m.name, m.phone, formatCurrency(m.amount)]),
        theme: 'striped',
        headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255] },
        margin: { left: 14, right: 14 }
      })
    }

    // 9. Footer
    const pageCount = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.setTextColor(156, 163, 175)
      doc.text('Generated by GymFlow', 14, 285)
      doc.text(`Page ${i} of ${pageCount}`, 196, 285, { align: 'right' })
    }

    doc.save(`GymFlow_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
  }

  function handleBulkWhatsApp() {
    if (membersWithDues.length === 0) return

    // In a real scenario, we might use a service.
    // Here we open the first 3 to demonstrate "bulk" without crashing the browser
    membersWithDues.slice(0, 3).forEach((m, i) => {
      setTimeout(() => {
        const link = buildWhatsAppLink(m.phone, m.name, format(new Date(), 'yyyy-MM-dd'))
        window.open(link, '_blank')
      }, i * 800)
    })

    if (membersWithDues.length > 3) {
      alert(`Opening first 3 reminders. Total pending: ${membersWithDues.length}`)
    }
  }

  return (
    <div className="space-y-6 pb-12 animate-slide-up">
      {/* TN/Puducherry Friendly Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-full -mr-16 -mt-16 opacity-50" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-xs uppercase tracking-widest">
            <BarChart2 className="w-4 h-4" />
            Business Intelligence
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{gymName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="flex items-center gap-1 font-medium"><MapPin className="w-3.5 h-3.5 text-brand-400" /> {gymCity || 'Tamil Nadu / Puducherry'}</span>
            <span className="flex items-center gap-1 font-medium"><Receipt className="w-3.5 h-3.5 text-brand-400" /> GST: {gymGST || 'N/A'}</span>
            <span className="flex items-center gap-1 font-medium"><Calendar className="w-3.5 h-3.5 text-brand-400" /> {gymPhone || 'N/A'}</span>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 relative z-10">
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 animate-pop-in">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-slate-400 text-xs font-bold">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-3 py-2 text-sm font-bold bg-slate-50 border-2 border-slate-100 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer"
          >
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="this-quarter">This Quarter</option>
            <option value="custom">Custom Range</option>
          </select>
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-black text-white bg-gradient-to-r from-brand-500 to-brand-600 rounded-lg hover:shadow-lg hover:shadow-brand-200 transition-all active:scale-95">
            <Download className="w-4 h-4" />EXPORT REPORT
          </button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-brand-600" />}
          label="Total Revenue"
          value={formatCurrency(currentRevenue)}
          sub="For selected period"
          color="bg-brand-50"
          iconColor="text-brand-600"
        />
        <StatCard
          icon={<UserCheck className="w-5 h-5 text-emerald-600" />}
          label="Active Members"
          value={activeCount}
          sub={totalMembers > 0 ? `${Math.round(activeCount/totalMembers*100)}% of total` : 'No members yet'}
          color="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          icon={<CreditCard className="w-5 h-5 text-amber-600" />}
          label="Dues Collected"
          value={formatCurrency(totalDuesAmount)}
          sub={`${membersWithDues.length} members pending`}
          color="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          icon={<BarChart2 className="w-5 h-5 text-blue-600" />}
          label="Attendance Rate"
          value={`${attendanceRate}%`}
          sub="Daily avg check-ins"
          color="bg-blue-50"
          iconColor="text-blue-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-500" />
              Revenue Trend (Last 6 Months)
            </h2>
          </div>
          <div className="flex items-end justify-between gap-2 h-48 mb-4">
            {[...months].reverse().map((m, i) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="relative w-full flex flex-col items-center">
                  <div className="absolute -top-8 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatCurrency(m.total)}
                  </div>
                  <div
                    className={cn(
                      "w-full rounded-t-lg transition-all duration-500",
                      i === 5 ? "bg-brand-500" : "bg-brand-100 group-hover:bg-brand-200"
                    )}
                    style={{ height: `${(m.total / maxRevenue) * 160}px` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{m.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-50">
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Monthly</p>
              <p className="text-sm font-bold text-slate-900">{formatCurrency(Math.round(months.reduce((a, b) => a + b.total, 0) / 6))}</p>
            </div>
            <div className="text-center border-x border-slate-50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Highest</p>
              <p className="text-sm font-bold text-slate-900">{formatCurrency(maxRevenue)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payments</p>
              <p className="text-sm font-bold text-slate-900">{months.reduce((a, b) => a + b.transactions, 0)}</p>
            </div>
          </div>
        </div>

        {/* Dues Summary Card */}
        <div className="card border-amber-100 overflow-hidden">
          <div className="p-6 bg-gradient-to-br from-amber-50/50 to-transparent h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-amber-900 flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                Dues Summary
              </h2>
            </div>

            <div className="flex-1 space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">Total Overdue</p>
                <p className="text-3xl font-black text-amber-900">{formatCurrency(totalDuesAmount)}</p>
              </div>

              <div className="space-y-3">
                {membersWithDues.slice(0, 3).map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{m.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{m.phone}</p>
                    </div>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(m.amount)}</p>
                  </div>
                ))}
                {membersWithDues.length > 3 && (
                  <p className="text-center text-xs font-medium text-slate-400">+{membersWithDues.length - 3} more members</p>
                )}
              </div>
            </div>

            <button
              onClick={handleBulkWhatsApp}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
            >
              <MessageCircle className="w-5 h-5" />
              WhatsApp Reminders
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Areas Section */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <MapPinned className="w-5 h-5 text-emerald-500" />
              Top Areas (Puducherry & Chennai)
            </h2>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">By Localities</span>
          </div>

          <div className="space-y-5">
            {topAreas.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">No area data available for this gym.</p>
              </div>
            ) : (
              topAreas.map(({ area, count }) => (
                <div key={area} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-500" />
                      {area}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{Math.round(count/totalMembers*100)}%</span>
                      <span className="font-black text-slate-900">{count}</span>
                    </div>
                  </div>
                  <Bar value={count} max={maxArea} color="bg-emerald-500 shadow-sm" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Plan Distribution Section */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-purple-500" />
              Plan Distribution
            </h2>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
              {totalPlanCount} members
            </span>
          </div>

          <div className="space-y-5">
            {[
              { label: 'Monthly',   count: planCounts.monthly,   color: 'bg-brand-500',   text: 'text-brand-600',   bg: 'bg-brand-50'   },
              { label: 'Quarterly', count: planCounts.quarterly, color: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Annual',    count: planCounts.annual,    color: 'bg-purple-500',  text: 'text-purple-600',  bg: 'bg-purple-50'  },
            ].map(({ label, count, color, text, bg }) => {
              const pct = totalPlanCount > 0 ? Math.round((count / totalPlanCount) * 100) : 0
              return (
                <div key={label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2.5 h-2.5 rounded-full', color)} />
                      <span className="text-sm font-semibold text-slate-700">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', bg, text)}>
                        {pct}%
                      </span>
                      <span className="text-sm font-black text-slate-900 w-6 text-right">{count}</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-700', color)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary row */}
          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Monthly',   count: planCounts.monthly,   color: 'text-brand-600'   },
              { label: 'Quarterly', count: planCounts.quarterly, color: 'text-emerald-600' },
              { label: 'Annual',    count: planCounts.annual,    color: 'text-purple-600'  },
            ].map(({ label, count, color }) => (
              <div key={label}>
                <p className={cn('text-xl font-black', color)}>{count}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanItem({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  return (
    <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-2.5 h-2.5 rounded-full", color)} />
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-black text-slate-900">{count}</p>
      <p className="text-[10px] font-bold text-slate-400">{total > 0 ? Math.round(count/total*100) : 0}% of members</p>
    </div>
  )
}
