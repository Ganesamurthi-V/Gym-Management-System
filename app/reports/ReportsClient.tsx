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
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
        <p className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">{value}</p>
        <p className="text-sm font-medium text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
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
    doc.setFontSize(22)
    doc.setTextColor(17, 24, 39)
    doc.text(gymName, 14, 20)

    doc.setFontSize(10)
    doc.setTextColor(107, 114, 128)
    doc.text(`City: ${gymCity || 'Pondicherry / Chennai'}`, 14, 27)
    doc.text(`GST: ${gymGST || 'N/A'} | Contact: ${gymPhone || 'N/A'}`, 14, 32)

    doc.setDrawColor(229, 231, 235)
    doc.line(14, 38, 196, 38)

    // 2. Report period and generated date
    doc.setFontSize(12)
    doc.setTextColor(17, 24, 39)
    doc.text(`Business Report: ${dateRange.replace(/-/g, ' ').toUpperCase()}`, 14, 48)
    doc.setFontSize(10)
    doc.setTextColor(107, 114, 128)
    doc.text(`Generated on: ${today}`, 196, 48, { align: 'right' })

    // 3. Summary stat boxes in a 2x2 grid
    const startY = 55
    const cardWidth = 88
    const cardHeight = 25

    const drawStat = (label: string, value: string, x: number, y: number) => {
      doc.setFillColor(249, 250, 251)
      doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'F')
      doc.setFontSize(9)
      doc.setTextColor(107, 114, 128)
      doc.text(label.toUpperCase(), x + 5, y + 8)
      doc.setFontSize(14)
      doc.setTextColor(17, 24, 39)
      doc.text(value, x + 5, y + 18)
    }

    drawStat('Total Revenue', formatCurrency(currentRevenue), 14, startY)
    drawStat('Active Members', activeCount.toString(), 108, startY)
    drawStat('Dues Collected', formatCurrency(totalDuesAmount), 14, startY + 30)
    drawStat('Attendance Rate', `${attendanceRate}%`, 108, startY + 30)

    let currentY = startY + 65

    // 4. Revenue trend table
    doc.setFontSize(12)
    doc.setTextColor(17, 24, 39)
    doc.text('Revenue Trend (Last 6 Months)', 14, currentY)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Month', 'Cash', 'UPI', 'Card', 'Transactions', 'Total']],
      body: months.map(m => [
        m.label,
        formatCurrency(m.cash),
        formatCurrency(m.upi),
        formatCurrency(m.card),
        m.transactions,
        formatCurrency(m.total)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 251, 252] },
      margin: { left: 14, right: 14 }
    })

    currentY = (doc as any).lastAutoTable.finalY + 15

    // 5. Member plan distribution table
    doc.text('Plan Distribution', 14, currentY)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Plan', 'Count', 'Percentage']],
      body: [
        ['Monthly', planCounts.monthly, `${Math.round(planCounts.monthly / totalPlanCount * 100)}%`],
        ['Quarterly', planCounts.quarterly, `${Math.round(planCounts.quarterly / totalPlanCount * 100)}%`],
        ['Annual', planCounts.annual, `${Math.round(planCounts.annual / totalPlanCount * 100)}%`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] },
      margin: { left: 14, right: 14 }
    })

    // New page for remaining sections
    doc.addPage()
    currentY = 20

    // 6. Area-wise member count table
    doc.text('Top Areas Distribution', 14, currentY)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Area / Locality', 'Member Count']],
      body: topAreas.map(a => [a.area, a.count]),
      theme: 'striped',
      headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81] },
      margin: { left: 14, right: 14 }
    })

    currentY = (doc as any).lastAutoTable.finalY + 15

    // 7. Dues overdue list
    doc.setTextColor(185, 28, 28) // Red color for dues
    doc.text('Outstanding Dues List', 14, currentY)
    doc.setTextColor(17, 24, 39)
    currentY += 5

    autoTable(doc, {
      startY: currentY,
      head: [['Member Name', 'Phone', 'Amount Overdue']],
      body: membersWithDues.map(m => [m.name, m.phone, formatCurrency(m.amount)]),
      theme: 'striped',
      headStyles: { fillColor: [254, 242, 242], textColor: [153, 27, 27] },
      margin: { left: 14, right: 14 }
    })

    // 8. Footer
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
    <div className="space-y-6 pb-12">
      {/* TN/Puducherry Friendly Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-xs uppercase tracking-widest">
            <BarChart2 className="w-4 h-4" />
            Business Analytics
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{gymName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {gymCity || 'Pondicherry / Chennai'}</span>
            <span className="flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> GST: {gymGST || 'N/A'}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {gymPhone || 'N/A'}</span>
            <span className="flex items-center gap-1 text-xs font-medium text-gray-400">| {formatDate(new Date().toISOString())}</span>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2">
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 animate-pop-in">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1.5 text-xs font-medium bg-gray-50 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 text-xs font-medium bg-gray-50 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-3 py-2 text-sm font-semibold bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
          >
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="this-quarter">This Quarter</option>
            <option value="custom">Custom Range</option>
          </select>
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-all shadow-sm">
            <Download className="w-4 h-4" />Export PDF
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
          sub={`${Math.round(activeCount/totalMembers*100)}% of total`}
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
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-500" />
              Revenue Trend (Last 6 Months)
            </h2>
          </div>
          <div className="flex items-end justify-between gap-2 h-48 mb-4">
            {[...months].reverse().map((m, i) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="relative w-full flex flex-col items-center">
                  <div className="absolute -top-8 bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
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
                <span className="text-[10px] font-bold text-gray-400 uppercase">{m.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-50">
            <div className="text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avg Monthly</p>
              <p className="text-sm font-bold text-gray-900">{formatCurrency(Math.round(months.reduce((a, b) => a + b.total, 0) / 6))}</p>
            </div>
            <div className="text-center border-x border-gray-50">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Highest</p>
              <p className="text-sm font-bold text-gray-900">{formatCurrency(maxRevenue)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Payments</p>
              <p className="text-sm font-bold text-gray-900">{months.reduce((a, b) => a + b.transactions, 0)}</p>
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
                  <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{m.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">{m.phone}</p>
                    </div>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(m.amount)}</p>
                  </div>
                ))}
                {membersWithDues.length > 3 && (
                  <p className="text-center text-xs font-medium text-gray-400">+{membersWithDues.length - 3} more members</p>
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
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <MapPinned className="w-5 h-5 text-emerald-500" />
              Top Areas (Puducherry & Chennai)
            </h2>
            <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">By Localities</span>
          </div>

          <div className="space-y-5">
            {topAreas.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400 font-medium">No area data available for this gym.</p>
              </div>
            ) : (
              topAreas.map(({ area, count }) => (
                <div key={area} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-gray-700 flex items-center gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-500" />
                      {area}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{Math.round(count/totalMembers*100)}%</span>
                      <span className="font-black text-gray-900">{count}</span>
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
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-purple-500" />
              Plan Distribution
            </h2>
          </div>

          <div className="space-y-8 py-4">
            <div className="flex h-12 w-full rounded-2xl overflow-hidden shadow-inner bg-gray-100">
              <div
                className="bg-brand-500 h-full transition-all duration-1000 flex items-center justify-center text-[10px] font-black text-white"
                style={{ width: `${(planCounts.monthly / totalPlanCount) * 100}%` }}
              >
                {planCounts.monthly > 0 && 'M'}
              </div>
              <div
                className="bg-emerald-500 h-full transition-all duration-1000 flex items-center justify-center text-[10px] font-black text-white border-l border-white/20"
                style={{ width: `${(planCounts.quarterly / totalPlanCount) * 100}%` }}
              >
                {planCounts.quarterly > 0 && 'Q'}
              </div>
              <div
                className="bg-purple-500 h-full transition-all duration-1000 flex items-center justify-center text-[10px] font-black text-white border-l border-white/20"
                style={{ width: `${(planCounts.annual / totalPlanCount) * 100}%` }}
              >
                {planCounts.annual > 0 && 'A'}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PlanItem label="Monthly" count={planCounts.monthly} total={totalPlanCount} color="bg-brand-500" />
              <PlanItem label="Quarterly" count={planCounts.quarterly} total={totalPlanCount} color="bg-emerald-500" />
              <PlanItem label="Annual" count={planCounts.annual} total={totalPlanCount} color="bg-purple-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanItem({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  return (
    <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-2.5 h-2.5 rounded-full", color)} />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-black text-gray-900">{count}</p>
      <p className="text-[10px] font-bold text-gray-400">{Math.round(count/total*100)}% of members</p>
    </div>
  )
}
