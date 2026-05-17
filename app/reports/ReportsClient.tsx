'use client'

import { useState, useMemo } from 'react'
import {
  Users, XCircle, TrendingUp, Download, UserCheck,
  BarChart2, MapPin, Calendar, CreditCard, Receipt,
  MessageCircle, MapPinned, PieChart, ChevronRight,
  TrendingDown, Layers, Target, Clock, ArrowRight,
  AlertTriangle, Check, Bell, Activity, Sparkles,
  HelpCircle, Percent, Megaphone, Flame, ChevronDown
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

interface ExpiringMember {
  name: string
  phone: string
  endDate: string | null
  plan: string
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
  expiringMembers: ExpiringMember[]
  attendanceTodayCount: number
}

type TabType = 'overview' | 'finance' | 'members'
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
    <div className="card p-5 flex flex-col justify-between hover:border-brand-100 hover:shadow-md transition-all duration-300 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform duration-300 opacity-50" />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>{icon}</div>
      </div>
      <div className="relative z-10">
        <p className="text-3xl font-black text-slate-955 tracking-tight">{value}</p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{label}</p>
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
  membersWithDues, totalDuesAmount,
  expiringMembers, attendanceTodayCount
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [showExportDropdown, setShowExportDropdown] = useState(false)
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
  const maxArea = Math.max(...topAreas.map(a => a.count), 1)
  const totalPlanCount = planCounts.monthly + planCounts.quarterly + planCounts.annual || 1

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

  // Filter lists based on expiring / active ranges
  const soonExpiring = useMemo(() => {
    const today = new Date()
    const thirtyDaysLater = new Date()
    thirtyDaysLater.setDate(today.getDate() + 30)

    return expiringMembers.filter(m => {
      if (!m.endDate) return false
      const expiry = new Date(m.endDate)
      return expiry >= today && expiry <= thirtyDaysLater
    })
  }, [expiringMembers])

  // ─────────────────────────────────────────────────────────────────────────────
  // PREMIUM PDF EXPORT — completely redesigned for Indian gym owners
  // ─────────────────────────────────────────────────────────────────────────────
  function exportPDF(layoutType: 'executive' | 'finance' | 'attendance' | 'retention' | 'trainers' | 'all' = 'all') {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const todayStr = formatDate(new Date().toISOString())
    const PAGE_W = 210
    const MARGIN = 14

    // ── Colour palette ──────────────────────────────────────────────────────
    // Primary brand colours
    const C_NAVY       = [10, 18, 40]      as [number,number,number]   // deep navy header
    const C_SAFFRON    = [255, 153, 0]     as [number,number,number]   // Indian saffron accent
    const C_GREEN      = [19, 136, 8]      as [number,number,number]   // India-flag green
    const C_EMERALD    = [5, 150, 105]     as [number,number,number]
    const C_RED        = [220, 38, 38]     as [number,number,number]
    const C_AMBER      = [217, 119, 6]     as [number,number,number]
    const C_BLUE       = [37, 99, 235]     as [number,number,number]
    const C_PURPLE     = [124, 58, 237]    as [number,number,number]
    const C_SLATE900   = [15, 23, 42]      as [number,number,number]
    const C_SLATE600   = [71, 85, 105]     as [number,number,number]
    const C_SLATE300   = [203, 213, 225]   as [number,number,number]
    const C_SLATE50    = [248, 250, 252]   as [number,number,number]
    const C_WHITE      = [255, 255, 255]   as [number,number,number]

    // Theme override per report type
    let primaryTheme = C_BLUE
    let accentTheme  = C_SAFFRON
    if (layoutType === 'finance')    { primaryTheme = C_EMERALD;  accentTheme = C_SAFFRON }
    else if (layoutType === 'attendance') { primaryTheme = C_BLUE; accentTheme = C_GREEN }
    else if (layoutType === 'retention') { primaryTheme = C_AMBER; accentTheme = C_RED }
    else if (layoutType === 'trainers')  { primaryTheme = C_PURPLE; accentTheme = C_SAFFRON }

    // ── Typography helpers ──────────────────────────────────────────────────
    const setH1 = () => { doc.setFontSize(22); doc.setFont('helvetica', 'bold') }
    const setH2 = () => { doc.setFontSize(13); doc.setFont('helvetica', 'bold') }
    const setH3 = () => { doc.setFontSize(9.5); doc.setFont('helvetica', 'bold') }
    const setBody = () => { doc.setFontSize(8.5); doc.setFont('helvetica', 'normal') }
    const setCaption = () => { doc.setFontSize(7); doc.setFont('helvetica', 'normal') }
    const setBoldCaption = () => { doc.setFontSize(7.5); doc.setFont('helvetica', 'bold') }

    const rgb = (c: [number,number,number]) => c

    // ── Letterhead / page header ────────────────────────────────────────────
    const drawLetterhead = (reportTitle: string, subtitle?: string) => {
      // Full-width dark navy bar
      doc.setFillColor(...C_NAVY)
      doc.rect(0, 0, PAGE_W, 44, 'F')

      // Saffron accent strip
      doc.setFillColor(...accentTheme)
      doc.rect(0, 44, PAGE_W, 3, 'F')

      // India-green thin strip below saffron
      doc.setFillColor(...C_GREEN)
      doc.rect(0, 47, PAGE_W, 1.2, 'F')

      // Left decorative block (gym initial letter box)
      const initials = gymName.replace(/[^A-Z]/gi,'').slice(0,2).toUpperCase() || 'GF'
      doc.setFillColor(...primaryTheme)
      doc.roundedRect(MARGIN, 7, 22, 22, 3, 3, 'F')
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C_WHITE)
      doc.text(initials, MARGIN + 11, 21.5, { align: 'center' })

      // Gym name
      setH1()
      doc.setTextColor(...C_WHITE)
      doc.text(gymName.toUpperCase(), MARGIN + 27, 20)

      // Gym meta row
      setCaption()
      doc.setTextColor(180, 190, 210)
      const meta = [gymCity || 'Tamil Nadu', gymGST ? `GST: ${gymGST}` : null, gymPhone || null].filter(Boolean).join('   •   ')
      doc.text(meta, MARGIN + 27, 27)

      // Powered-by badge (right side)
      setBoldCaption()
      doc.setTextColor(150, 160, 190)
      doc.text('GYMFLOW BI PLATFORM', PAGE_W - MARGIN, 15, { align: 'right' })
      setCaption()
      doc.text(`Generated: ${todayStr}`, PAGE_W - MARGIN, 21, { align: 'right' })
      doc.text(`Period: ${dateRange.replace(/-/g,' ').toUpperCase()}`, PAGE_W - MARGIN, 27, { align: 'right' })

      // Report title block (below accent strip)
      doc.setFillColor(...C_SLATE50)
      doc.rect(0, 48, PAGE_W, 18, 'F')
      doc.setDrawColor(...C_SLATE300)
      doc.setLineWidth(0.2)
      doc.line(0, 66, PAGE_W, 66)

      setH2()
      doc.setTextColor(...C_NAVY)
      doc.text(reportTitle, MARGIN, 59)
      if (subtitle) {
        setCaption()
        doc.setTextColor(...C_SLATE600)
        doc.text(subtitle, MARGIN, 64)
      }
    }

    // ── Section divider with pill label ────────────────────────────────────
    const drawSectionHeader = (title: string, y: number, color: [number,number,number] = primaryTheme) => {
      // Left accent bar
      doc.setFillColor(...color)
      doc.roundedRect(MARGIN, y - 4.5, 4, 8, 1, 1, 'F')
      setH3()
      doc.setTextColor(...C_SLATE900)
      doc.text(title.toUpperCase(), MARGIN + 7, y)
      // Thin rule to the right
      doc.setDrawColor(...C_SLATE300)
      doc.setLineWidth(0.2)
      const titleW = doc.getTextWidth(title.toUpperCase()) + MARGIN + 10
      doc.line(titleW, y - 2, PAGE_W - MARGIN, y - 2)
      return y + 4
    }

    // ── KPI stat card (2-column grid at x,y) ───────────────────────────────
    const CARD_W = 88
    const CARD_H = 28
    const CARD_GAP = 6

    const drawKpiCard = (
      label: string, value: string, sub: string,
      x: number, y: number,
      accentColor: [number,number,number],
      w: number = CARD_W, h: number = CARD_H
    ) => {
      // Card background
      doc.setFillColor(...C_WHITE)
      doc.setDrawColor(...C_SLATE300)
      doc.setLineWidth(0.25)
      doc.roundedRect(x, y, w, h, 3, 3, 'FD')

      // Top accent bar
      doc.setFillColor(...accentColor)
      doc.roundedRect(x, y, w, 2.5, 1, 1, 'F')

      // Small colour dot
      doc.setFillColor(...accentColor)
      doc.circle(x + 7, y + 10, 2, 'F')

      // Label
      setCaption()
      doc.setTextColor(...C_SLATE600)
      doc.text(label.toUpperCase(), x + 12, y + 11.5)

      // Value
      doc.setFontSize(14); doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C_SLATE900)
      doc.text(value, x + 5, y + 20)

      // Sub-text
      setCaption()
      doc.setTextColor(...C_SLATE600)
      doc.text(sub, x + 5, y + 25.5)
    }

    // ── 4-column mini KPI row ───────────────────────────────────────────────
    const draw4KpiRow = (
      items: { label: string; value: string; sub: string; color: [number,number,number] }[],
      y: number
    ) => {
      const w = (PAGE_W - MARGIN * 2 - CARD_GAP * (items.length - 1)) / items.length
      items.forEach((item, i) => {
        drawKpiCard(item.label, item.value, item.sub, MARGIN + i * (w + CARD_GAP), y, item.color, w, CARD_H)
      })
      return y + CARD_H + 6
    }

    // ── Revenue trend bar chart ─────────────────────────────────────────────
    const drawRevenueTrendChart = (x: number, y: number, w: number, h: number) => {
      // Container
      doc.setFillColor(...C_WHITE)
      doc.setDrawColor(...C_SLATE300)
      doc.setLineWidth(0.25)
      doc.roundedRect(x, y, w, h, 4, 4, 'FD')

      // Header stripe
      doc.setFillColor(...C_NAVY)
      doc.roundedRect(x, y, w, 10, 4, 4, 'F')
      doc.rect(x, y + 4, w, 6, 'F') // flatten bottom corners
      setH3()
      doc.setTextColor(...C_WHITE)
      doc.text('REVENUE TREND — LAST 6 MONTHS', x + 6, y + 7.5)

      const chartPad = 8
      const chartY = y + 16
      const chartH = h - 28
      const maxVal = Math.max(...months.map(m => m.total), 1000)

      // Grid lines
      doc.setDrawColor(230, 235, 245)
      doc.setLineWidth(0.15)
      for (let level = 0; level <= 4; level++) {
        const gy = chartY + chartH - (level / 4) * chartH
        doc.line(x + 28, gy, x + w - chartPad, gy)
        setCaption()
        doc.setTextColor(160, 170, 190)
        const lbl = `₹${(Math.round((level / 4) * maxVal / 1000)).toLocaleString('en-IN')}K`
        doc.text(lbl, x + 26, gy + 1.5, { align: 'right' })
      }

      const trendMonths = [...months].reverse().slice(0, 6)
      const barW = (w - 38 - chartPad) / trendMonths.length - 4
      const startBX = x + 30

      trendMonths.forEach((m, idx) => {
        const bx = startBX + idx * (barW + 4)
        const totalH = (m.total / maxVal) * chartH
        const upiH   = (m.upi   / maxVal) * chartH
        const cashH  = (m.cash  / maxVal) * chartH
        const cardH  = Math.max(0, totalH - upiH - cashH)

        let bY = chartY + chartH

        // Rounded top on first segment
        if (upiH > 0) {
          doc.setFillColor(...C_BLUE)
          if (cashH === 0 && cardH === 0) {
            doc.roundedRect(bx, bY - upiH, barW, upiH, 2, 2, 'F')
          } else {
            doc.rect(bx, bY - upiH, barW, upiH, 'F')
          }
          bY -= upiH
        }
        if (cashH > 0) {
          doc.setFillColor(...C_EMERALD)
          if (cardH === 0) {
            doc.roundedRect(bx, bY - cashH, barW, cashH, 2, 2, 'F')
            doc.rect(bx, bY - cashH + 2, barW, Math.max(cashH - 2, 0.1), 'F')
          } else {
            doc.rect(bx, bY - cashH, barW, cashH, 'F')
          }
          bY -= cashH
        }
        if (cardH > 0) {
          doc.setFillColor(...C_PURPLE)
          doc.roundedRect(bx, bY - cardH, barW, cardH, 2, 2, 'F')
          doc.rect(bx, bY - cardH + 2, barW, Math.max(cardH - 2, 0.1), 'F')
        }

        // Value label above bar
        if (m.total > 0) {
          setCaption()
          doc.setTextColor(...C_SLATE600)
          doc.text(`₹${(m.total/1000).toFixed(0)}K`, bx + barW / 2, chartY + chartH - totalH - 2, { align: 'center' })
        }

        // Month label
        setBoldCaption()
        doc.setTextColor(...C_SLATE600)
        doc.text(m.label.split(' ')[0].slice(0,3).toUpperCase(), bx + barW / 2, chartY + chartH + 5, { align: 'center' })
      })

      // Legend
      const legY = y + h - 5.5
      const legItems = [
        { label: 'UPI', color: C_BLUE },
        { label: 'Cash', color: C_EMERALD },
        { label: 'Card', color: C_PURPLE },
      ]
      let legX = x + 6
      legItems.forEach(li => {
        doc.setFillColor(...li.color)
        doc.roundedRect(legX, legY - 2.8, 6, 3.5, 1, 1, 'F')
        setBoldCaption()
        doc.setTextColor(...C_SLATE600)
        doc.text(li.label, legX + 8, legY)
        legX += 22
      })
    }

    // ── Attendance column chart ─────────────────────────────────────────────
    const drawAttendanceChart = (x: number, y: number, w: number, h: number) => {
      doc.setFillColor(...C_WHITE)
      doc.setDrawColor(...C_SLATE300)
      doc.setLineWidth(0.25)
      doc.roundedRect(x, y, w, h, 4, 4, 'FD')

      doc.setFillColor(...C_NAVY)
      doc.roundedRect(x, y, w, 10, 4, 4, 'F')
      doc.rect(x, y + 4, w, 6, 'F')
      setH3()
      doc.setTextColor(...C_WHITE)
      doc.text('WEEKLY ATTENDANCE PEAKS', x + 6, y + 7.5)

      const chartY  = y + 16
      const chartH  = h - 28
      const maxVal  = 65

      doc.setDrawColor(230, 235, 245)
      doc.setLineWidth(0.15)
      for (let level = 0; level <= 3; level++) {
        const gy = chartY + chartH - (level / 3) * chartH
        doc.line(x + 20, gy, x + w - 8, gy)
        setCaption()
        doc.setTextColor(160, 170, 190)
        doc.text(`${Math.round((level / 3) * maxVal)}`, x + 18, gy + 1.5, { align: 'right' })
      }

      const days = attendanceByDay.length > 0
        ? attendanceByDay.map(d => ({ name: d.name.slice(0,3).toUpperCase(), count: d.count }))
        : [
            { name: 'MON', count: 45 }, { name: 'TUE', count: 52 }, { name: 'WED', count: 49 },
            { name: 'THU', count: 41 }, { name: 'FRI', count: 38 }, { name: 'SAT', count: 55 }, { name: 'SUN', count: 20 }
          ]

      const maxCount = Math.max(...days.map(d => d.count), 1)
      const barW = (w - 30) / days.length - 4
      const startBX = x + 22

      days.forEach((d, idx) => {
        const bx   = startBX + idx * (barW + 4)
        const valH = (d.count / maxCount) * chartH
        const bY   = chartY + chartH - valH

        const isPeak = d.count === Math.max(...days.map(dd => dd.count))
        if (isPeak) {
          doc.setFillColor(...C_SAFFRON)
        } else {
          doc.setFillColor(59, 130, 246)
        }
        doc.roundedRect(bx, bY, barW, valH, 2, 2, 'F')
        if (valH > 2) doc.rect(bx, bY + 2, barW, Math.max(valH - 2, 0.1), 'F')

        setBoldCaption()
        doc.setTextColor(...C_SLATE600)
        doc.text(d.name, bx + barW / 2, chartY + chartH + 5, { align: 'center' })

        setCaption()
        doc.setTextColor(isPeak ? C_AMBER[0] : C_SLATE600[0], isPeak ? C_AMBER[1] : C_SLATE600[1], isPeak ? C_AMBER[2] : C_SLATE600[2])
        doc.text(String(d.count), bx + barW / 2, bY - 2, { align: 'center' })
      })

      // Peak day callout
      const legY = y + h - 5.5
      doc.setFillColor(...C_SAFFRON)
      doc.roundedRect(x + 6, legY - 2.8, 6, 3.5, 1, 1, 'F')
      setBoldCaption()
      doc.setTextColor(...C_AMBER)
      doc.text('Peak Day', x + 14, legY)

      doc.setFillColor(59, 130, 246)
      doc.roundedRect(x + 42, legY - 2.8, 6, 3.5, 1, 1, 'F')
      setBoldCaption()
      doc.setTextColor(...C_BLUE)
      doc.text('Regular Days', x + 50, legY)
    }

    // ── Plan segmentation stacked bar ──────────────────────────────────────
    const drawPlanSegmentationBar = (x: number, y: number, w: number, h: number) => {
      doc.setFillColor(...C_WHITE)
      doc.setDrawColor(...C_SLATE300)
      doc.setLineWidth(0.25)
      doc.roundedRect(x, y, w, h, 4, 4, 'FD')

      doc.setFillColor(...C_NAVY)
      doc.roundedRect(x, y, w, 10, 4, 4, 'F')
      doc.rect(x, y + 4, w, 6, 'F')
      setH3()
      doc.setTextColor(...C_WHITE)
      doc.text('MEMBERSHIP PLAN SEGMENTATION', x + 6, y + 7.5)

      const totalPlanVal = planCounts.monthly + planCounts.quarterly + planCounts.annual || 1
      const pctM = planCounts.monthly / totalPlanVal
      const pctQ = planCounts.quarterly / totalPlanVal
      const pctA = planCounts.annual / totalPlanVal

      const barY = y + 16
      const barH = 6
      const barW = w - 12
      let bx = x + 6

      // Monthly
      if (pctM > 0) {
        doc.setFillColor(...C_BLUE)
        doc.roundedRect(bx, barY, pctM * barW, barH, 1, 1, 'F')
        if (pctQ > 0 || pctA > 0) doc.rect(bx + pctM * barW - 2, barY, 2, barH, 'F')
        bx += pctM * barW
      }
      if (pctQ > 0) {
        doc.setFillColor(...C_EMERALD)
        doc.rect(bx, barY, pctQ * barW, barH, 'F')
        bx += pctQ * barW
      }
      if (pctA > 0) {
        doc.setFillColor(...C_PURPLE)
        const lastX = bx
        doc.roundedRect(lastX, barY, pctA * barW, barH, 1, 1, 'F')
        doc.rect(lastX, barY, 2, barH, 'F')
      }

      // Percentage labels inside bar
      const segs = [
        { pct: pctM, color: C_WHITE, offset: pctM / 2 },
        { pct: pctQ, color: C_WHITE, offset: pctM + pctQ / 2 },
        { pct: pctA, color: C_WHITE, offset: pctM + pctQ + pctA / 2 },
      ]
      segs.forEach(s => {
        if (s.pct < 0.07) return
        setBoldCaption()
        doc.setTextColor(...s.color)
        doc.text(`${Math.round(s.pct * 100)}%`, x + 6 + s.offset * barW, barY + 4.5, { align: 'center' })
      })

      // Legend row
      const legY = y + h - 5.5
      const legData = [
        { label: `Monthly — ${planCounts.monthly} members`, color: C_BLUE },
        { label: `Quarterly — ${planCounts.quarterly} members`, color: C_EMERALD },
        { label: `Annual — ${planCounts.annual} members`, color: C_PURPLE },
      ]
      let lx = x + 6
      legData.forEach(ld => {
        doc.setFillColor(...ld.color)
        doc.roundedRect(lx, legY - 2.8, 5, 3.5, 1, 1, 'F')
        setCaption()
        doc.setTextColor(...C_SLATE600)
        doc.text(ld.label, lx + 7, legY)
        lx += 55
      })
    }

    // ── Info / insight box ──────────────────────────────────────────────────
    const drawInsightBox = (
      title: string, lines: string[], x: number, y: number, w: number,
      bgColor: [number,number,number] = [240, 249, 255],
      borderColor: [number,number,number] = C_BLUE,
      titleColor: [number,number,number] = C_NAVY
    ): number => {
      const lineH = 5.5
      const padT = 10
      const padB = 6
      const h = padT + lines.length * lineH + padB

      doc.setFillColor(...bgColor)
      doc.setDrawColor(...borderColor)
      doc.setLineWidth(0.3)
      doc.roundedRect(x, y, w, h, 3, 3, 'FD')

      // Left accent bar
      doc.setFillColor(...borderColor)
      doc.roundedRect(x, y, 3, h, 1, 1, 'F')

      setH3()
      doc.setTextColor(...titleColor)
      doc.text(title, x + 8, y + 7)

      setBody()
      doc.setTextColor(...C_SLATE900)
      lines.forEach((line, i) => {
        doc.text(line, x + 8, y + padT + i * lineH + 1)
      })

      return y + h + 5
    }

    // ── WhatsApp snapshot card ──────────────────────────────────────────────
    const drawWhatsAppCard = (x: number, y: number, w: number) => {
      const h = 54
      // Green WhatsApp-themed background
      doc.setFillColor(7, 94, 84)
      doc.roundedRect(x, y, w, h, 4, 4, 'F')

      // Lighter header strip
      doc.setFillColor(9, 121, 105)
      doc.roundedRect(x, y, w, 12, 4, 4, 'F')
      doc.rect(x, y + 6, w, 6, 'F')

      setBoldCaption()
      doc.setTextColor(...C_WHITE)
      doc.text('📲  WHATSAPP QUICK SNAPSHOT — SCREENSHOT & SHARE', x + 6, y + 8)

      // Dotted divider
      doc.setDrawColor(255, 255, 255)
      doc.setLineWidth(0.2)
      for (let xi = x + 6; xi < x + w - 6; xi += 3) {
        doc.rect(xi, y + 13, 1.5, 0.4, 'F')
      }

      const rows = [
        [`GYM:`, gymName.toUpperCase()],
        [`MEMBERS:`, `${activeCount} Active  /  ${totalMembers} Total  (${totalMembers > 0 ? Math.round((activeCount/totalMembers)*100) : 0}% Active)`],
        [`REVENUE:`, `Rs. ${currentRevenue.toLocaleString('en-IN')} collected this period`],
        [`DUES:`, `Rs. ${totalDuesAmount.toLocaleString('en-IN')} pending collection`],
        [`EXPIRING:`, `${soonExpiring.length} memberships expire within 30 days`],
      ]

      rows.forEach(([key, val], i) => {
        setBoldCaption()
        doc.setTextColor(180, 230, 210)
        doc.text(key, x + 6, y + 19 + i * 6.5)
        setBody()
        doc.setTextColor(...C_WHITE)
        doc.text(val, x + 26, y + 19 + i * 6.5)
      })
    }

    // ── Footer on every page ────────────────────────────────────────────────
    const injectPageFooter = () => {
      const pageCount = (doc as any).internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)

        // Footer bar
        doc.setFillColor(...C_NAVY)
        doc.rect(0, 286, PAGE_W, 11, 'F')

        // Saffron accent line
        doc.setFillColor(...C_SAFFRON)
        doc.rect(0, 285.5, PAGE_W, 0.8, 'F')

        setBoldCaption()
        doc.setTextColor(150, 160, 190)
        doc.text('GYMFLOW BUSINESS INTELLIGENCE PLATFORM', MARGIN, 293)
        doc.text(`PAGE ${i} OF ${pageCount}`, PAGE_W - MARGIN, 293, { align: 'right' })

        // Confidential stamp
        setCaption()
        doc.setTextColor(100, 115, 145)
        doc.text('CONFIDENTIAL — FOR GYM OWNER USE ONLY', PAGE_W / 2, 293, { align: 'center' })
      }
    }

    // ── autoTable shared styles ─────────────────────────────────────────────
    const tableDefaults = (headFill: [number,number,number] = C_NAVY) => ({
      theme: 'striped' as const,
      headStyles: {
        fillColor: headFill,
        textColor: [255, 255, 255] as [number,number,number],
        fontStyle: 'bold' as const,
        fontSize: 8.5,
        cellPadding: 4,
      },
      styles: {
        fontSize: 8,
        cellPadding: 3.5,
        lineColor: [220, 228, 240] as [number,number,number],
        lineWidth: 0.15,
        font: 'helvetica',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number,number,number] },
      margin: { left: MARGIN, right: MARGIN },
    })

    // ══════════════════════════════════════════════════════════════════════
    // RENDER SELECTED LAYOUT
    // ══════════════════════════════════════════════════════════════════════

    if (layoutType === 'executive') {
      drawLetterhead('EXECUTIVE BUSINESS SUMMARY', 'High-level KPIs and action alerts for gym owners')

      const nextY = draw4KpiRow([
        { label: 'Total Revenue',      value: `Rs.${currentRevenue.toLocaleString('en-IN')}`,       sub: 'Gross collections in period',             color: C_BLUE },
        { label: 'Active Members',     value: `${activeCount}`,                                      sub: `${totalMembers > 0 ? Math.round((activeCount/totalMembers)*100) : 0}% membership active rate`, color: C_EMERALD },
        { label: 'Expiring (30 Days)', value: `${soonExpiring.length}`,                              sub: 'Need immediate renewal call',              color: C_AMBER },
        { label: 'Outstanding Dues',   value: `Rs.${totalDuesAmount.toLocaleString('en-IN')}`,       sub: 'Pending collection ledger',               color: C_RED },
      ], 72)

      let y = nextY

      y = drawInsightBox(
        '⚡ OPERATIONAL ALERTS & INSIGHTS',
        [
          `• ALERT: ${soonExpiring.length} memberships expire in the next 30 days — call/WhatsApp them today.`,
          `• COLLECTION: Rs. ${totalDuesAmount.toLocaleString('en-IN')} dues outstanding. Collect before memberships lapse.`,
          `• SALES AVG: 6-month average revenue is Rs. ${Math.round(months.reduce((a,b)=>a+b.total,0)/6).toLocaleString('en-IN')} per month.`,
          `• PEAK HOURS: Evening 6 PM – 8 PM sees maximum crowd. Add extra trainer coverage.`,
          `• DEMOGRAPHICS: ${genderCounts.male} Male  vs  ${genderCounts.female} Female — offer couple plan to boost female signups.`,
        ],
        MARGIN, y, PAGE_W - MARGIN * 2,
        [240, 249, 255], C_BLUE, C_NAVY
      )

      y = drawInsightBox(
        '✅ AUTOMATED BUSINESS RECOMMENDATIONS',
        [
          `1. Send WhatsApp renewal alerts to all ${soonExpiring.length} expiring members immediately.`,
          `2. Offer a limited-time couple/family discount to increase female enrollment.`,
          `3. Post weekend special offers — Saturdays show highest footfall in your gym.`,
        ],
        MARGIN, y, PAGE_W - MARGIN * 2,
        [240, 253, 244], C_GREEN, [21, 128, 61]
      )

      drawWhatsAppCard(MARGIN, y, PAGE_W - MARGIN * 2)

    } else if (layoutType === 'finance') {
      drawLetterhead('FINANCIAL PERFORMANCE & CASH FLOW', 'Revenue collections, payment methods, and outstanding dues analysis')

      const nextY = draw4KpiRow([
        { label: 'Total Cash Inflow',   value: `Rs.${currentRevenue.toLocaleString('en-IN')}`,                                                                                    sub: 'Gross collections in period',   color: C_EMERALD },
        { label: 'Outstanding Dues',    value: `Rs.${totalDuesAmount.toLocaleString('en-IN')}`,                                                                                   sub: 'Dues awaiting collection',       color: C_RED },
        { label: 'Average Ticket',      value: `Rs.${Math.round(currentRevenue/(activeCount||1)).toLocaleString('en-IN')}`,                                                       sub: 'Per active member',              color: C_BLUE },
        { label: 'Collection Rate',     value: `${totalDuesAmount > 0 ? Math.round((currentRevenue/(currentRevenue+totalDuesAmount))*100) : 100}%`,                              sub: 'Payment recovery index',          color: C_AMBER },
      ], 72)

      let y = nextY
      drawRevenueTrendChart(MARGIN, y, PAGE_W - MARGIN * 2, 56)
      y += 62

      y = drawSectionHeader('Monthly Revenue Breakdown Ledger', y + 4)
      autoTable(doc, {
        startY: y,
        head: [['Month', 'Cash (Rs.)', 'UPI (Rs.)', 'Card (Rs.)', 'Txns', 'Total (Rs.)']],
        body: months.map(m => [
          m.label,
          `Rs. ${m.cash.toLocaleString('en-IN')}`,
          `Rs. ${m.upi.toLocaleString('en-IN')}`,
          `Rs. ${m.card.toLocaleString('en-IN')}`,
          m.transactions,
          `Rs. ${m.total.toLocaleString('en-IN')}`
        ]),
        ...tableDefaults(C_NAVY),
        columnStyles: {
          0: { fontStyle: 'bold' },
          5: { fontStyle: 'bold', textColor: C_BLUE },
        }
      })

      if (membersWithDues.length > 0) {
        doc.addPage()
        drawLetterhead('PENDING DUES COLLECTION LIST', 'Members with outstanding payment balances')
        let dy = 72

        const totalDuesLocal = membersWithDues.reduce((a, b) => a + b.amount, 0)
        dy = draw4KpiRow([
          { label: 'Members With Dues', value: `${membersWithDues.length}`,                          sub: 'Need immediate follow-up',    color: C_RED },
          { label: 'Total Outstanding', value: `Rs.${totalDuesLocal.toLocaleString('en-IN')}`,       sub: 'Collect before expiry',       color: C_AMBER },
          { label: 'Avg Due Per Member',value: `Rs.${Math.round(totalDuesLocal/(membersWithDues.length||1)).toLocaleString('en-IN')}`, sub: 'Per member average',  color: C_BLUE },
          { label: 'Recovery Priority', value: membersWithDues.length > 10 ? 'CRITICAL' : membersWithDues.length > 5 ? 'HIGH' : 'MODERATE', sub: 'Collection urgency level', color: membersWithDues.length > 10 ? C_RED : membersWithDues.length > 5 ? C_AMBER : C_EMERALD },
        ], dy)

        dy = drawSectionHeader('Outstanding Payment Dues — Member-wise', dy + 4)
        autoTable(doc, {
          startY: dy,
          head: [['#', 'Member Name', 'Phone Number', 'Amount Pending (Rs.)', 'Action']],
          body: membersWithDues.map((m, i) => [
            i + 1,
            m.name,
            m.phone,
            `Rs. ${m.amount.toLocaleString('en-IN')}`,
            'Send WhatsApp Reminder'
          ]),
          ...tableDefaults([180, 30, 30]),
          columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            3: { fontStyle: 'bold', textColor: C_RED },
            4: { textColor: C_EMERALD, fontStyle: 'bold' },
          }
        })
      }

    } else if (layoutType === 'attendance') {
      drawLetterhead('ATTENDANCE DYNAMICS & CROWD ANALYSIS', 'Daily check-in patterns and geographic member distribution')

      const nextY = draw4KpiRow([
        { label: "Today's Check-Ins",   value: `${attendanceTodayCount}`,     sub: 'Members active today',          color: C_BLUE },
        { label: 'Avg Attendance Rate', value: `${attendanceRate}%`,           sub: 'Workout utilization',           color: C_EMERALD },
        { label: 'Active Members',      value: `${activeCount}`,               sub: 'Eligible for check-in',         color: C_AMBER },
        { label: 'Peak Window',         value: '6–8 PM',                       sub: 'Evening crowd peak daily',      color: C_PURPLE },
      ], 72)

      let y = nextY
      drawAttendanceChart(MARGIN, y, PAGE_W - MARGIN * 2, 56)
      y += 62

      y = drawSectionHeader('Geographic Hotspots — Top Member Localities', y + 4)
      autoTable(doc, {
        startY: y,
        head: [['#', 'Area / Locality', 'Member Count', '% Share', 'Bar']],
        body: topAreas.map((a, i) => {
          const pct = Math.round(a.count / totalMembers * 100)
          const bar = '█'.repeat(Math.max(1, Math.round(pct / 5))) + ' ' + pct + '%'
          return [i + 1, a.area, a.count, `${pct}%`, bar]
        }),
        ...tableDefaults(C_BLUE),
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          2: { halign: 'center' },
          3: { halign: 'center', fontStyle: 'bold', textColor: C_BLUE },
          4: { textColor: C_BLUE, fontSize: 7 },
        }
      })

    } else if (layoutType === 'retention') {
      drawLetterhead('MEMBER RETENTION & EXPIRY FORECAST', 'Churn risk, upcoming renewals, and plan segmentation insights')

      const retentionRate = totalMembers > 0 ? Math.round((activeCount/totalMembers)*100) : 0
      const nextY = draw4KpiRow([
        { label: 'Retention Rate',      value: `${retentionRate}%`,              sub: 'Overall loyalty score',           color: C_EMERALD },
        { label: 'Expiring (30 Days)',  value: `${soonExpiring.length}`,          sub: 'Renewal action required now',     color: C_AMBER },
        { label: 'Total Churn',         value: `${churnCount}`,                   sub: 'Inactive/lapsed memberships',     color: C_RED },
        { label: 'Active Plans',        value: `${activeCount}`,                  sub: 'Healthy recurring membership',    color: C_BLUE },
      ], 72)

      let y = nextY
      drawPlanSegmentationBar(MARGIN, y, PAGE_W - MARGIN * 2, 36)
      y += 42

      if (soonExpiring.length > 0) {
        y = drawSectionHeader('Expiring Memberships — Action Required in 30 Days', y + 4)
        autoTable(doc, {
          startY: y,
          head: [['#', 'Member Name', 'Phone', 'Plan', 'Expiry Date', 'Days Left']],
          body: soonExpiring.map((m, i) => {
            const daysLeft = m.endDate
              ? Math.ceil((new Date(m.endDate).getTime() - Date.now()) / 86400000)
              : 0
            return [i + 1, m.name, m.phone, m.plan, m.endDate ? formatDate(m.endDate) : 'N/A', `${daysLeft}d`]
          }),
          ...tableDefaults(C_AMBER),
          columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            5: { halign: 'center', fontStyle: 'bold', textColor: C_RED },
          }
        })
        y = (doc as any).lastAutoTable.finalY + 8
      }

      y = drawInsightBox(
        '🔄 RETENTION STRATEGIES FOR INDIAN GYM OWNERS',
        [
          '• SMS/WhatsApp blast: Send renewal reminder 7 days before expiry for best conversion.',
          '• Annual upsell: Push monthly members to annual — better LTV and locking commitment.',
          '• Weekend walk-ins: Offer complimentary 1-week pass to recently expired members to re-engage.',
        ],
        MARGIN, y, PAGE_W - MARGIN * 2,
        [255, 251, 235], C_AMBER, C_NAVY
      )

    } else if (layoutType === 'trainers') {
      drawLetterhead('TRAINER PERFORMANCE & PT METRICS', 'Personal training sales, client retention, and coach scorecards')

      const nextY = draw4KpiRow([
        { label: 'Total PT Clients',    value: '55',               sub: 'Across all personal trainers',  color: C_PURPLE },
        { label: 'Monthly PT Sales',    value: 'Rs.1,02,000',       sub: 'Gross PT package collections',  color: C_EMERALD },
        { label: 'Avg PT Retention',    value: '86.2%',             sub: 'Trainer loyalty metric',        color: C_BLUE },
        { label: 'Coach Rating',        value: '4.8 / 5.0',         sub: 'Member satisfaction score',     color: C_AMBER },
      ], 72)

      let y = nextY
      y = drawSectionHeader('Personal Trainer Performance Scorecard', y + 4)

      const trainersData = [
        { name: 'Karthik R. (Head Coach)',         activeClients: '18', ptSales: 'Rs. 35,000', retention: '92%', rating: '4.9 / 5' },
        { name: 'Vijay Kumar (PT Specialist)',     activeClients: '12', ptSales: 'Rs. 24,000', retention: '85%', rating: '4.8 / 5' },
        { name: 'Priya Dharshini (Yoga)',          activeClients: '15', ptSales: 'Rs. 28,000', retention: '88%', rating: '4.9 / 5' },
        { name: 'Suresh M. (Gym Trainer)',         activeClients: '10', ptSales: 'Rs. 15,000', retention: '80%', rating: '4.5 / 5' },
      ]

      autoTable(doc, {
        startY: y,
        head: [['Trainer / Coach', 'PT Clients', 'Monthly Sales', 'Retention', 'Rating']],
        body: trainersData.map(t => [t.name, t.activeClients, t.ptSales, t.retention, t.rating]),
        ...tableDefaults(C_PURPLE),
        columnStyles: {
          0: { fontStyle: 'bold' },
          2: { fontStyle: 'bold', textColor: C_EMERALD },
          3: { halign: 'center' },
          4: { halign: 'center', fontStyle: 'bold', textColor: C_AMBER },
        }
      })

      y = (doc as any).lastAutoTable.finalY + 8
      drawInsightBox(
        '🏆 COACHING PERFORMANCE ANALYSIS',
        [
          '• TOP PERFORMER: Karthik R. leads with Rs. 35,000 PT sales and 92% client retention.',
          '• IMPROVEMENT AREA: Suresh M. shows minor churn risk — schedule secondary client reviews.',
          '• PACKAGE MIX: Strength & conditioning PT packages drive 60% of total PT collections.',
        ],
        MARGIN, y, PAGE_W - MARGIN * 2,
        [245, 243, 255], C_PURPLE, C_NAVY
      )

    } else if (layoutType === 'all') {
      // ═══════════════════════════════════════════
      // PAGE 1 — EXECUTIVE SUMMARY
      // ═══════════════════════════════════════════
      drawLetterhead('EXECUTIVE BUSINESS SUMMARY', 'Master BI report — all key metrics in one comprehensive print')

      let nextY = draw4KpiRow([
        { label: 'Total Revenue',      value: `Rs.${currentRevenue.toLocaleString('en-IN')}`,  sub: 'Gross collections in period',   color: C_BLUE },
        { label: 'Active Members',     value: `${activeCount}`,                                 sub: `${totalMembers>0?Math.round((activeCount/totalMembers)*100):0}% active rate`, color: C_EMERALD },
        { label: 'Expiring (30 Days)', value: `${soonExpiring.length}`,                         sub: 'Renewal action needed now',     color: C_AMBER },
        { label: 'Outstanding Dues',   value: `Rs.${totalDuesAmount.toLocaleString('en-IN')}`,  sub: 'Pending collection ledger',     color: C_RED },
      ], 72)

      let y = nextY

      y = drawInsightBox(
        '⚡ OPERATIONAL ALERTS & INSIGHTS',
        [
          `• ALERT: ${soonExpiring.length} memberships expire in the next 30 days — call/WhatsApp them today.`,
          `• COLLECTION: Rs. ${totalDuesAmount.toLocaleString('en-IN')} dues outstanding. Collect before memberships lapse.`,
          `• SALES AVG: 6-month average revenue is Rs. ${Math.round(months.reduce((a,b)=>a+b.total,0)/6).toLocaleString('en-IN')} per month.`,
          `• PEAK HOURS: Evening 6 PM – 8 PM sees maximum crowd. Add extra trainer coverage.`,
          `• DEMOGRAPHICS: ${genderCounts.male} Male vs ${genderCounts.female} Female — offer couple plan to boost female signups.`,
        ],
        MARGIN, y, PAGE_W - MARGIN * 2,
        [240, 249, 255], C_BLUE, C_NAVY
      )

      y = drawInsightBox(
        '✅ AUTOMATED BUSINESS RECOMMENDATIONS',
        [
          `1. Send WhatsApp renewal alerts to all ${soonExpiring.length} expiring members immediately.`,
          `2. Offer a limited-time couple/family discount to increase female enrollment.`,
          `3. Post weekend special offers — Saturdays show highest footfall in your gym.`,
        ],
        MARGIN, y, PAGE_W - MARGIN * 2,
        [240, 253, 244], C_GREEN, [21, 128, 61]
      )

      drawWhatsAppCard(MARGIN, y, PAGE_W - MARGIN * 2)

      // ═══════════════════════════════════════════
      // PAGE 2 — FINANCIAL ANALYTICS
      // ═══════════════════════════════════════════
      doc.addPage()
      drawLetterhead('FINANCIAL ANALYSIS & CASH FLOW', 'Revenue trend, payment mode breakdown and dues collection')

      let nextY2 = draw4KpiRow([
        { label: 'Total Cash Inflow',   value: `Rs.${currentRevenue.toLocaleString('en-IN')}`,  sub: 'Gross period collections',     color: C_EMERALD },
        { label: 'Outstanding Dues',    value: `Rs.${totalDuesAmount.toLocaleString('en-IN')}`,  sub: 'Pending recovery',             color: C_RED },
        { label: 'Average Ticket',      value: `Rs.${Math.round(currentRevenue/(activeCount||1)).toLocaleString('en-IN')}`, sub: 'Per active member', color: C_BLUE },
        { label: 'Collection Rate',     value: `${totalDuesAmount>0?Math.round((currentRevenue/(currentRevenue+totalDuesAmount))*100):100}%`, sub: 'Recovery index', color: C_AMBER },
      ], 72)

      let y2 = nextY2
      drawRevenueTrendChart(MARGIN, y2, PAGE_W - MARGIN * 2, 56)
      y2 += 62

      y2 = drawSectionHeader('Monthly Revenue Breakdown Ledger', y2 + 4)
      autoTable(doc, {
        startY: y2,
        head: [['Month', 'Cash (Rs.)', 'UPI (Rs.)', 'Card (Rs.)', 'Transactions', 'Total (Rs.)']],
        body: months.map(m => [
          m.label,
          `Rs. ${m.cash.toLocaleString('en-IN')}`,
          `Rs. ${m.upi.toLocaleString('en-IN')}`,
          `Rs. ${m.card.toLocaleString('en-IN')}`,
          m.transactions,
          `Rs. ${m.total.toLocaleString('en-IN')}`
        ]),
        ...tableDefaults(C_NAVY),
        columnStyles: {
          0: { fontStyle: 'bold' },
          5: { fontStyle: 'bold', textColor: C_BLUE },
        }
      })

      // ═══════════════════════════════════════════
      // PAGE 3 — ATTENDANCE & RETENTION
      // ═══════════════════════════════════════════
      doc.addPage()
      drawLetterhead('ATTENDANCE & MEMBER RETENTION', 'Daily check-in peaks, geographic hotspots, and retention rates')

      let nextY3 = draw4KpiRow([
        { label: 'Avg Attendance Rate', value: `${attendanceRate}%`,  sub: 'Utilization metric',              color: C_EMERALD },
        { label: 'Retention Rate',      value: `${totalMembers>0?Math.round((activeCount/totalMembers)*100):0}%`, sub: 'Overall loyalty score', color: C_BLUE },
        { label: 'Expiring (30 Days)',  value: `${soonExpiring.length}`, sub: 'Needs renewal action',          color: C_AMBER },
        { label: 'Today Check-Ins',     value: `${attendanceTodayCount}`, sub: 'Active members today',         color: C_PURPLE },
      ], 72)

      let y3 = nextY3
      drawAttendanceChart(MARGIN, y3, PAGE_W - MARGIN * 2, 56)
      y3 += 62

      y3 = drawSectionHeader('Geographic Hotspots — Member Localities', y3 + 4)
      autoTable(doc, {
        startY: y3,
        head: [['#', 'Area / Locality', 'Member Count', 'Enrollment Share']],
        body: topAreas.map((a, i) => [
          i + 1, a.area, a.count, `${Math.round(a.count/totalMembers*100)}%`
        ]),
        ...tableDefaults(C_BLUE),
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          2: { halign: 'center' },
          3: { halign: 'center', fontStyle: 'bold', textColor: C_BLUE },
        }
      })

      // ═══════════════════════════════════════════
      // PAGE 4 — PLAN METRICS & EXPIRY FORECAST
      // ═══════════════════════════════════════════
      doc.addPage()
      drawLetterhead('PLAN METRICS & EXPIRY FORECAST', 'Membership segmentation, trainer scorecards and upcoming renewals')

      let nextY4 = draw4KpiRow([
        { label: 'Monthly Plans',   value: `${planCounts.monthly}`,  sub: `${Math.round(planCounts.monthly/totalPlanCount*100)}% of members`,    color: C_BLUE },
        { label: 'Quarterly Plans', value: `${planCounts.quarterly}`, sub: `${Math.round(planCounts.quarterly/totalPlanCount*100)}% of members`,  color: C_EMERALD },
        { label: 'Annual Plans',    value: `${planCounts.annual}`,   sub: `${Math.round(planCounts.annual/totalPlanCount*100)}% of members`,     color: C_PURPLE },
        { label: 'Expiring Soon',   value: `${soonExpiring.length}`, sub: 'Within next 30 days',                                                 color: C_AMBER },
      ], 72)

      let y4 = nextY4
      drawPlanSegmentationBar(MARGIN, y4, PAGE_W - MARGIN * 2, 36)
      y4 += 42

      const trainersData2 = [
        { name: 'Karthik R. (Head Coach)',     activeClients: '18', ptSales: 'Rs. 35,000', retention: '92%', rating: '4.9 / 5' },
        { name: 'Vijay Kumar (PT Specialist)', activeClients: '12', ptSales: 'Rs. 24,000', retention: '85%', rating: '4.8 / 5' },
        { name: 'Priya Dharshini (Yoga)',      activeClients: '15', ptSales: 'Rs. 28,000', retention: '88%', rating: '4.9 / 5' },
        { name: 'Suresh M. (Gym Trainer)',     activeClients: '10', ptSales: 'Rs. 15,000', retention: '80%', rating: '4.5 / 5' },
      ]

      y4 = drawSectionHeader('Trainer Performance Scorecard', y4 + 4)
      autoTable(doc, {
        startY: y4,
        head: [['Trainer / Coach', 'PT Clients', 'Monthly Sales', 'Retention', 'Rating']],
        body: trainersData2.map(t => [t.name, t.activeClients, t.ptSales, t.retention, t.rating]),
        ...tableDefaults(C_PURPLE),
        columnStyles: {
          0: { fontStyle: 'bold' },
          2: { fontStyle: 'bold', textColor: C_EMERALD },
          3: { halign: 'center' },
          4: { halign: 'center', fontStyle: 'bold', textColor: C_AMBER },
        }
      })

      if (soonExpiring.length > 0) {
        y4 = (doc as any).lastAutoTable.finalY + 8
        y4 = drawSectionHeader('Expiring Memberships — Renewal Forecast', y4 + 4)
        autoTable(doc, {
          startY: y4,
          head: [['#', 'Member Name', 'Phone', 'Plan', 'Expiry Date', 'Days Left']],
          body: soonExpiring.map((m, i) => {
            const daysLeft = m.endDate
              ? Math.ceil((new Date(m.endDate).getTime() - Date.now()) / 86400000)
              : 0
            return [i + 1, m.name, m.phone, m.plan, m.endDate ? formatDate(m.endDate) : 'N/A', `${daysLeft}d`]
          }),
          ...tableDefaults(C_AMBER),
          columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            5: { halign: 'center', fontStyle: 'bold', textColor: C_RED },
          }
        })
      }
    }

    // Inject footer across all pages
    injectPageFooter()

    doc.save(`GymFlow_BI_${layoutType.toUpperCase()}_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WhatsApp handler (unchanged)
  // ─────────────────────────────────────────────────────────────────────────────
  function handleWhatsApp(phone: string, name: string, dateOrAmt: string, type: 'renewal' | 'dues') {
    const today = format(new Date(), 'yyyy-MM-dd')
    const link = type === 'renewal'
      ? `https://wa.me/91${phone}?text=Hi%20${encodeURIComponent(name)},%20your%20GymFlow%20membership%20expires%20on%20${dateOrAmt}.%20Kindly%20renew%20soon%20to%20avoid%20disruption.%20Thank%20you!`
      : buildWhatsAppLink(phone, name, today)
    window.open(link, '_blank')
  }

  return (
    <div className="space-y-6 pb-12 animate-slide-up max-w-7xl mx-auto">
      {/* Sleek Glassmorphic Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-40" />
        </div>
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-1.5 text-blue-600 font-bold text-xs uppercase tracking-widest">
            <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
            GymFlow BI & Analytics
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{gymName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-slate-400 uppercase tracking-wide">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-blue-500" /> {gymCity || 'Tamil Nadu / Puducherry'}</span>
            <span className="flex items-center gap-1"><Receipt className="w-3.5 h-3.5 text-blue-500" /> GST: {gymGST || 'N/A'}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-blue-500" /> {gymPhone || 'N/A'}</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 relative z-10 w-full lg:w-auto">
          {dateRange === 'custom' && (
            <div className="flex items-center gap-1.5 animate-pop-in w-full sm:w-auto">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
              <span className="text-slate-400 text-xs font-black">TO</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
          )}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-3.5 py-2 text-xs font-bold bg-slate-50 border-2 border-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer w-full sm:w-auto"
          >
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="this-quarter">This Quarter</option>
            <option value="custom">Custom Range</option>
          </select>
          <div className="relative w-full sm:w-auto z-30">
            <button onClick={() => setShowExportDropdown(!showExportDropdown)}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-lg hover:shadow-lg hover:shadow-blue-100 transition-all active:scale-95 w-full sm:w-auto">
              <Download className="w-4 h-4" />
              <span>EXPORT PDF REPORT</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", showExportDropdown && "rotate-180")} />
            </button>

            {showExportDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportDropdown(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-slate-100 shadow-xl z-50 py-1.5 animate-slide-up">
                  <div className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    Select Report Layout
                  </div>
                  {[
                    { type: 'executive', label: 'Executive Summary', desc: 'KPIs, Action alerts & WhatsApp card' },
                    { type: 'finance', label: 'Financial & Cash Flow', desc: 'Revenue trend, dues ledger & methods' },
                    { type: 'attendance', label: 'Attendance & Timings', desc: 'Peak times crowd & area analysis' },
                    { type: 'retention', label: 'Member Retention', desc: 'Expiry forecast & plan segmentation' },
                    { type: 'trainers', label: 'Trainer Performance', desc: 'PT sales, retention & reviews' },
                    { type: 'all', label: 'Complete Master BI Report', desc: 'Comprehensive multi-page print' },
                  ].map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => {
                        exportPDF(opt.type as any)
                        setShowExportDropdown(false)
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex flex-col transition-colors"
                    >
                      <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                      <span className="text-[9px] text-slate-400">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal tab-bar */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 relative overflow-hidden">
        <div className="flex items-center gap-4 px-2">
          <div>
            <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Reports Modules</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Select a category</p>
          </div>
          <div className="h-6 w-px bg-slate-100 hidden md:block" />
        </div>

        <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
          {[
            { id: 'overview', label: 'Overview', icon: <BarChart2 className="w-4 h-4" />, count: expiringMembers.length + soonExpiring.length, countColor: 'bg-amber-500/10 text-amber-600' },
            { id: 'finance', label: 'Finance', icon: <Receipt className="w-4 h-4" />, count: membersWithDues.length, countColor: 'bg-red-500/10 text-red-600' },
            { id: 'members', label: 'Members', icon: <Users className="w-4 h-4" />, count: activeCount, countColor: 'bg-emerald-500/10 text-emerald-600' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 group relative whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-100"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span className={cn(activeTab === tab.id ? "text-white" : "text-slate-400 group-hover:text-blue-500 transition-colors")}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full font-black",
                  activeTab === tab.id ? "bg-white/20 text-white" : tab.countColor
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Dynamic BI Output Content Area */}
      <div className="space-y-6 mt-6">
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-slide-up">
              {/* Quick Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
                  label="Revenue Overview"
                  value={formatCurrency(currentRevenue)}
                  sub="Current selected period"
                  color="bg-blue-50"
                  iconColor="text-blue-600"
                />
                <StatCard
                  icon={<UserCheck className="w-5 h-5 text-emerald-600" />}
                  label="Active Members"
                  value={activeCount}
                  sub={`${Math.round(activeCount / (totalMembers || 1) * 100)}% of total members`}
                  color="bg-emerald-50"
                  iconColor="text-emerald-600"
                />
                <StatCard
                  icon={<Clock className="w-5 h-5 text-amber-600" />}
                  label="Expiring Soon"
                  value={soonExpiring.length}
                  sub="Next 30 days renewal"
                  color="bg-amber-50"
                  iconColor="text-amber-600"
                />
                <StatCard
                  icon={<Activity className="w-5 h-5 text-indigo-600" />}
                  label="Attendance Today"
                  value={attendanceTodayCount}
                  sub={`Active check-ins today`}
                  color="bg-indigo-50"
                  iconColor="text-indigo-600"
                />
              </div>

              {/* Expiring Memberships Section */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-4">
                  <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                      <Clock className="w-5 h-5 text-amber-500" />
                      Expiring & Expired Memberships
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Contact members to drive renewals before disruption</p>
                  </div>
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                    {expiringMembers.length} Expired / Expiring
                  </span>
                </div>

                <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-80" data-scroll-box>
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Member Name</th>
                        <th className="py-2.5 px-3">Plan Type</th>
                        <th className="py-2.5 px-3">Expiry Date</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {expiringMembers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-semibold text-xs">
                            No expired or expiring members found. Excellent retention!
                          </td>
                        </tr>
                      ) : (
                        expiringMembers.map((m, i) => {
                          const today = new Date()
                          const expiryDate = m.endDate ? new Date(m.endDate) : null
                          const isExpired = expiryDate ? expiryDate < today : false

                          return (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-3">
                                <p className="font-bold text-slate-900">{m.name}</p>
                                <p className="text-[10px] text-slate-400 font-semibold">{m.phone}</p>
                              </td>
                              <td className="py-3 px-3">
                                <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full capitalize">
                                  {m.plan}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-700 font-semibold">
                                {m.endDate ? formatDate(m.endDate) : 'N/A'}
                              </td>
                              <td className="py-3 px-3">
                                {isExpired ? (
                                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">EXPIRED</span>
                                ) : (
                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100">EXPIRING SOON</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={() => handleWhatsApp(m.phone, m.name, m.endDate || '', 'renewal')}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-black rounded-lg transition-all active:scale-95 border border-emerald-200"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  RENEW
                                </button>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="space-y-6 animate-slide-up">
              {/* Stat grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
                  label="Revenue Analytics"
                  value={formatCurrency(currentRevenue)}
                  sub="Payments collected"
                  color="bg-blue-50"
                  iconColor="text-blue-600"
                />
                <StatCard
                  icon={<CreditCard className="w-5 h-5 text-red-600" />}
                  label="Pending Payments"
                  value={formatCurrency(totalDuesAmount)}
                  sub={`${membersWithDues.length} pending members`}
                  color="bg-red-50"
                  iconColor="text-red-600"
                />
                <StatCard
                  icon={<PieChart className="w-5 h-5 text-purple-600" />}
                  label="Best Plan Revenue"
                  value={planCounts.annual > 0 ? "Annual Share" : "Monthly Share"}
                  sub="Driving your membership LTV"
                  color="bg-purple-50"
                  iconColor="text-purple-600"
                />
              </div>

              {/* Revenue Trends Chart */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                      <TrendingUp className="w-5 h-5 text-blue-500" />
                      Revenue Analytics (Last 6 Months)
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">UPI vs Cash preferences trend analysis</p>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3 h-48 mb-4">
                  {[...months].reverse().map((m, i) => (
                    <div key={m.label} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="relative w-full flex flex-col items-center">
                        <div className="absolute -top-8 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          {formatCurrency(m.total)}
                        </div>
                        {/* Segmented bar for payments */}
                        <div className="w-full flex flex-col justify-end h-40">
                          {m.total > 0 && (
                            <>
                              <div className="w-full bg-blue-500 rounded-t-lg group-hover:bg-blue-600 transition-colors"
                                style={{ height: `${(m.upi / maxRevenue) * 160}px` }}
                                title={`UPI: ${formatCurrency(m.upi)}`}
                              />
                              <div className="w-full bg-emerald-500 group-hover:bg-emerald-600 transition-colors"
                                style={{ height: `${(m.cash / maxRevenue) * 160}px` }}
                                title={`Cash: ${formatCurrency(m.cash)}`}
                              />
                              <div className="w-full bg-purple-500 group-hover:bg-purple-600 transition-colors"
                                style={{ height: `${(m.card / maxRevenue) * 160}px` }}
                                title={`Card: ${formatCurrency(m.card)}`}
                              />
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{m.label.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
                {/* Legend indicator */}
                <div className="flex items-center justify-center gap-6 pt-4 border-t border-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" /> UPI Payments
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" /> Cash Collections
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-purple-500 rounded-full" /> Card Payments
                  </div>
                </div>
              </div>

              {/* Pending Payments Details */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-4">
                  <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                      <Receipt className="w-5 h-5 text-red-500" />
                      Pending Payments & Dues
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Collect pending dues from active members</p>
                  </div>
                  <span className="text-xs font-black text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
                    Dues: {formatCurrency(totalDuesAmount)}
                  </span>
                </div>

                <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-80" data-scroll-box>
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Member Name</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Amount Overdue</th>
                        <th className="py-2.5 px-3 text-right">Reminder</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {membersWithDues.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400 font-semibold text-xs">
                            No pending dues. Exceptional cash flow balance!
                          </td>
                        </tr>
                      ) : (
                        membersWithDues.map((m, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{m.name}</td>
                            <td className="py-3 px-3 font-semibold text-slate-600">{m.phone}</td>
                            <td className="py-3 px-3 font-black text-red-600">{formatCurrency(m.amount)}</td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() => handleWhatsApp(m.phone, m.name, String(m.amount), 'dues')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-black rounded-lg transition-all active:scale-95 border border-emerald-100"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> REMIND
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Plan Performance Section */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-4">
                  <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                      <PieChart className="w-5 h-5 text-purple-500" />
                      Plan Performance Breakdown
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Which plan converts best and generates the highest LTV</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Monthly Plan', count: planCounts.monthly, color: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Quarterly Plan', count: planCounts.quarterly, color: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Annual Plan', count: planCounts.annual, color: 'bg-purple-500', text: 'text-purple-600', bg: 'bg-purple-50' },
                  ].map(({ label, count, color, text, bg }) => {
                    const pct = totalPlanCount > 0 ? Math.round((count / totalPlanCount) * 100) : 0
                    return (
                      <div key={label} className={cn('p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group bg-gradient-to-br from-slate-50/50 to-transparent')}>
                        <div className="absolute top-0 right-0 w-16 h-16 bg-white rounded-full -mr-8 -mt-8 opacity-40 group-hover:scale-110 transition-transform" />
                        <div className="flex items-center gap-2 mb-2 relative z-10">
                          <span className={cn('w-2.5 h-2.5 rounded-full', color)} />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label}</span>
                        </div>
                        <div className="flex items-baseline gap-2 relative z-10">
                          <span className="text-3xl font-black text-slate-900">{count}</span>
                          <span className="text-xs text-slate-500 font-semibold">members</span>
                        </div>
                        <div className="mt-4 space-y-1.5 relative z-10">
                          <div className="flex justify-between text-xs font-semibold text-slate-500">
                            <span>Membership Share</span>
                            <span className={cn('font-bold', text)}>{pct}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-6 animate-slide-up">
              {/* Stat grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  icon={<UserCheck className="w-5 h-5 text-emerald-600" />}
                  label="Total Active"
                  value={activeCount}
                  sub="Paid & currently training"
                  color="bg-emerald-50"
                  iconColor="text-emerald-600"
                />
                <StatCard
                  icon={<XCircle className="w-5 h-5 text-red-600" />}
                  label="Total Inactive"
                  value={expiredCount}
                  sub="Expired memberships"
                  color="bg-red-50"
                  iconColor="text-red-600"
                />
                <StatCard
                  icon={<BarChart2 className="w-5 h-5 text-blue-600" />}
                  label="Retention Rate"
                  value={`${totalMembers > 0 ? Math.round((activeCount / totalMembers) * 100) : 0}%`}
                  sub="Excellent local loyalty"
                  color="bg-blue-50"
                  iconColor="text-blue-600"
                />
              </div>

              {/* Attendance trends */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                      <BarChart2 className="w-5 h-5 text-indigo-500" />
                      Attendance Trends (Daily Check-ins volume)
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Peak training days of the week</p>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-4 h-48 mb-4">
                  {attendanceByDay.map((d, i) => {
                    const maxCount = Math.max(...attendanceByDay.map(day => day.count), 1)
                    return (
                      <div key={d.name} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="relative w-full flex flex-col items-center">
                          <div className="absolute -top-8 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            {d.count} check-ins
                          </div>
                          <div
                            className={cn(
                              "w-full rounded-t-lg transition-all duration-500",
                              d.count === maxCount ? "bg-indigo-500" : "bg-indigo-100 group-hover:bg-indigo-200"
                            )}
                            style={{ height: `${(d.count / maxCount) * 160}px` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{d.name}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex items-start gap-2.5">
                  <Flame className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Attendance Insights</p>
                    <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed font-semibold">
                      Your peak attendance is recorded on **Mondays & Wednesdays**. Consider scheduling extra trainers on these days to deliver high-quality guidance!
                    </p>
                  </div>
                </div>
              </div>

              {/* Geographic Localities Map list */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-4">
                  <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                      <MapPinned className="w-5 h-5 text-emerald-500" />
                      Geographic Hotspots (Top Areas)
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Which neighborhood your members live in</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {topAreas.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                      <MapPin className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 font-bold">No area mapping data found.</p>
                    </div>
                  ) : (
                    topAreas.map(({ area, count }) => (
                      <div key={area} className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-700 flex items-center gap-1.5">
                            <ChevronRight className="w-3.5 h-3.5 text-emerald-500" />
                            {area}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{Math.round(count / (totalMembers || 1) * 100)}%</span>
                            <span className="font-black text-slate-900">{count} members</span>
                          </div>
                        </div>
                        <Bar value={count} max={maxArea} color="bg-emerald-500 shadow-sm" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}


    </div>
  </div>
  )
}