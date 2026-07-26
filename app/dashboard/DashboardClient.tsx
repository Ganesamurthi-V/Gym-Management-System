'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Users, Clock, AlertTriangle, CheckSquare, MessageCircle, Plus, TrendingUp, FileText, IndianRupee, CalendarCheck, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink, formatCurrency, isValidPhone } from '@/lib/utils'
import { generateDailyReportPDF } from '@/lib/pdf'
import type { DashboardStats, MemberWithStatus } from '@/types'
import { format } from 'date-fns'

interface Props {
  gymName: string
  stats: DashboardStats
  expiringMembers: MemberWithStatus[]
  gymId: string
}

export function DashboardClient({ gymName, stats, expiringMembers, gymId }: Props) {
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [expiringFilter, setExpiringFilter] = useState<'week' | 'month'>('week')
  const [monthMembers, setMonthMembers] = useState<MemberWithStatus[] | null>(null)
  const [fetchingMonth, setFetchingMonth] = useState(false)

  // Memoize Supabase client to prevent recreation on every render
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (expiringFilter === 'month' && monthMembers === null && !fetchingMonth) {
      setFetchingMonth(true)
      const fetchMonth = async () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd')

        // Issue 4 fix: Added server-side date filter — only fetch memberships expiring THIS month.
        // Previously fetched ALL memberships for the gym (full table scan), which could be
        // thousands of rows for older gyms. Now filtered at the DB level.
        const currentMonth = todayStr.slice(0, 7) // e.g. "2026-06"
        const monthStart = `${currentMonth}-01`
        const monthEnd = `${currentMonth}-31` // Postgres clamps to last valid day

        const { data: membershipsData } = await supabase
          .from('memberships')
          .select('member_id, end_date, member:members(id, name, phone, member_number)')
          .eq('gym_id', gymId)
          .gte('end_date', monthStart)
          .lte('end_date', monthEnd)
          .order('end_date', { ascending: true })

        const memberMap = new Map<string, any>()
        for (const m of membershipsData ?? []) {
          if (!m.member || memberMap.has(m.member_id)) continue
          const daysRemaining = Math.ceil((new Date(m.end_date).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24))
          memberMap.set(m.member_id, { ...(m.member as any), latest_membership: m, days_remaining: daysRemaining })
        }

        setMonthMembers(Array.from(memberMap.values()).sort((a, b) => a.days_remaining - b.days_remaining))
        setFetchingMonth(false)
      }
      fetchMonth()
    }
  }, [expiringFilter, gymId, monthMembers, fetchingMonth, supabase])

  // Feature 1: Bulk WhatsApp Reminders — opens a single link with the first member,
  // since browsers block multiple window.open calls from a single user gesture.
  function handleBulkRemind() {
    const validMembers = expiringMembers.filter(m => m.latest_membership && isValidPhone(m.phone))
    if (validMembers.length === 0) return
    
    // Open the first member's link (only one popup allowed per click)
    const first = validMembers[0]
    window.open(buildWhatsAppLink(first.phone, first.name, first.latest_membership!.end_date), '_blank')
  }

  // Feature 3: Daily Report PDF
  async function handleDailyPDF() {
    setGeneratingPDF(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      
      // Use date-only filters for consistent results regardless of client timezone
      const [membershipsRes, newMembersRes] = await Promise.all([
        supabase
          .from('memberships')
          .select('amount, admission_fee, payment_mode, plan, category, member:members(name, member_number)')
          .eq('gym_id', gymId)
          .eq('start_date', today),
        supabase
          .from('members')
          .select('name, member_number, phone, area, gender')
          .eq('gym_id', gymId)
          .gte('created_at', `${today}T00:00:00.000Z`)
          .lt('created_at', `${today}T23:59:59.999Z`)
      ])

      const payments = (membershipsRes.data ?? []).map((p: any) => ({
        memberName: p.member?.name ?? 'Unknown',
        memberNumber: p.member?.member_number ?? 0,
        plan: p.plan,
        category: p.category,
        amount: p.amount,
        admission_fee: p.admission_fee ?? 0,
        payment_mode: p.payment_mode,
      }))

      const newMembers = (newMembersRes.data ?? []).map((m: any) => ({
        name: m.name,
        memberNumber: m.member_number,
        phone: m.phone,
        area: m.area || '-',
        gender: m.gender || '-'
      }))

      generateDailyReportPDF({ gymName, date: today, payments, newMembers })
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setGeneratingPDF(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5 animate-slide-up w-full h-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="object-contain md:w-8 md:h-8" priority />
            <span className="text-xs sm:text-sm text-slate-500 font-medium truncate max-w-[180px] sm:max-w-none">{gymName}</span>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        </div>
      </div>

      {/* Stats Grid — 2 cols mobile, 3 cols tablet, 6 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
        <StatCard
          icon={<Users className="w-4 h-4" style={{ color: '#16A34A' }} />}
          label="Active" value={stats.total_active}
          iconBg="#DCFCE7" cardBg="#F0FDF4" borderColor="#22C55E" valueColor="#15803D"
          href="/members?filter=active"
        />
        <StatCard
          icon={<CheckSquare className="w-4 h-4" style={{ color: '#2563EB' }} />}
          label="Attendance" value={stats.today_attendance}
          iconBg="#DBEAFE" cardBg="#EFF6FF" borderColor="#3B82F6" valueColor="#1D4ED8"
          href="/attendance"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" style={{ color: '#D97706' }} />}
          label="Expiring" value={stats.expiring_this_week}
          iconBg="#FEF3C7" cardBg="#FFFBEB" borderColor="#F59E0B" valueColor="#B45309"
          href="/members?filter=expiring"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" style={{ color: '#DC2626' }} />}
          label="Expired" value={stats.expired_count}
          iconBg="#FEE2E2" cardBg="#FEF2F2" borderColor="#EF4444" valueColor="#B91C1C"
          href="/members?filter=expired"
        />
        <StatCardCurrency
          icon={<IndianRupee className="w-4 h-4" style={{ color: '#0891B2' }} />}
          label="Today's Collection" value={stats.today_collection}
          iconBg="#CFFAFE" cardBg="#ECFEFF" borderColor="#06B6D4" valueColor="#0E7490"
        />
        <StatCardCurrency
          icon={<AlertTriangle className="w-4 h-4" style={{ color: '#EA580C' }} />}
          label="Total Dues" value={stats.total_dues}
          iconBg="#FFEDD5" cardBg="#FFF7ED" borderColor="#F97316" valueColor="#C2410C"
          href="/dues" danger
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-stretch" style={{ minHeight: '420px' }}>
        {/* Expiring members — fills all available horizontal space */}
        <div className="flex-1 min-w-0 flex flex-col">
          <motion.div
            className="card flex-1 flex flex-col"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.15 }}
          >
            <ExpiringContent
              expiringMembers={expiringFilter === 'month' ? (monthMembers || []) : expiringMembers}
              handleBulkRemind={handleBulkRemind}
              gymId={gymId}
              expiringFilter={expiringFilter}
              setExpiringFilter={setExpiringFilter}
              fetchingMonth={fetchingMonth}
            />
          </motion.div>
        </div>

        {/* Quick Actions — fixed width on desktop, full width on mobile */}
        <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 card p-4 md:p-5 flex flex-col gap-3 bg-gradient-to-b from-white to-slate-50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-3 h-3" />
            Quick Actions
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:gap-2.5 flex-1 lg:justify-center">
            <Link href="/members/new" className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl p-3 font-bold text-sm hover:shadow-lg hover:shadow-brand-200 active:scale-95 transition-all">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><Plus className="w-4 h-4" /></div>
              <span className="text-xs sm:text-sm">Add New Member</span>
            </Link>
            <Link href="/attendance" className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl p-3 font-bold text-sm hover:shadow-lg hover:shadow-cyan-200 active:scale-95 transition-all">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><CalendarCheck className="w-4 h-4" /></div>
              <span className="text-xs sm:text-sm">Mark Attendance</span>
            </Link>
            <Link href="/members/attendance" className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl p-3 font-bold text-sm hover:shadow-lg hover:shadow-indigo-200 active:scale-95 transition-all">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><ClipboardList className="w-4 h-4" /></div>
              <span className="text-xs sm:text-sm">Attendance Log</span>
            </Link>
            <button onClick={handleDailyPDF} disabled={generatingPDF}
              className="w-full flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl p-3 font-bold text-sm hover:shadow-lg hover:shadow-emerald-200 active:scale-95 transition-all disabled:opacity-60"
            >
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4" /></div>
              <span className="text-xs sm:text-sm">{generatingPDF ? 'Generating...' : 'Daily Report PDF'}</span>
            </button>
            <Link href="/dues" className="col-span-2 lg:col-span-1 flex items-center gap-2 bg-white text-red-600 rounded-xl p-3 font-bold text-sm hover:bg-red-50 transition-all border-2 border-red-100 active:scale-95">
              <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0"><IndianRupee className="w-4 h-4" /></div>
              <span className="text-xs sm:text-sm">View Fee Dues</span>
              {stats.total_dues > 0 && <span className="ml-auto text-xs bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse">{formatCurrency(stats.total_dues)}</span>}
            </Link>
          </div>
        </div>
      </div>

    </div>
  )
}

function ExpiringContent({
  expiringMembers,
  handleBulkRemind,
  gymId,
  expiringFilter,
  setExpiringFilter,
  fetchingMonth
}: {
  expiringMembers: MemberWithStatus[],
  handleBulkRemind: () => void,
  gymId: string,
  expiringFilter: 'week' | 'month',
  setExpiringFilter: (f: 'week' | 'month') => void,
  fetchingMonth: boolean
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 md:px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" />
          <select
            value={expiringFilter}
            onChange={(e) => setExpiringFilter(e.target.value as 'week' | 'month')}
            className="font-bold text-slate-900 text-sm md:text-base bg-transparent outline-none cursor-pointer hover:bg-slate-50 py-1 pr-1 rounded"
          >
            <option value="week">Expiring This Week</option>
            <option value="month">Expiring This Month</option>
          </select>
          {fetchingMonth && <span className="text-xs text-slate-400 animate-pulse ml-2">Loading...</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk WhatsApp Remind removed per user request */}
          <Link href="/members?filter=expiring" className="text-brand-600 text-sm font-semibold">See all</Link>
        </div>
      </div>
      {expiringMembers.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-2xl mb-1">🎉</p>
          <p className="text-slate-400 text-sm">No members expiring this {expiringFilter}</p>
        </div>
      ) : (
        <div className="flex-1 relative min-h-[200px]">
          <div className="absolute inset-0 overflow-y-auto divide-y divide-slate-50 overscroll-contain">
            {expiringMembers.map((member) => <ExpiringMemberRow key={member.id} member={member} gymId={gymId} />)}
          </div>
        </div>
      )}
    </>
  )
}

function StatCard({ icon, label, value, iconBg, cardBg, borderColor, valueColor, href }: {
  icon: React.ReactNode; label: string; value: number;
  iconBg: string; cardBg: string; borderColor: string; valueColor: string;
  href?: string
}) {
  const content = (
    <div
      className="card p-3 xs:p-3.5 md:p-4 hover:shadow-md transition-all"
      style={{ backgroundColor: cardBg, borderColor: borderColor, borderWidth: 1 }}
    >
      <div
        className="w-7 h-7 xs:w-8 xs:h-8 rounded-xl flex items-center justify-center mb-2"
        style={{ backgroundColor: iconBg }}
      >{icon}</div>
      <p className="text-xl xs:text-2xl font-bold leading-none" style={{ color: valueColor }}>{value}</p>
      <p className="text-[10px] xs:text-xs text-slate-500 mt-1 leading-tight">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function StatCardCurrency({ icon, label, value, iconBg, cardBg, borderColor, valueColor, href, danger }: {
  icon: React.ReactNode; label: string; value: number;
  iconBg: string; cardBg: string; borderColor: string; valueColor: string;
  href?: string; danger?: boolean
}) {
  const content = (
    <div
      className="card p-3 xs:p-3.5 md:p-4 hover:shadow-md transition-all"
      style={{ backgroundColor: cardBg, borderColor: borderColor, borderWidth: 1 }}
    >
      <div
        className="w-7 h-7 xs:w-8 xs:h-8 rounded-xl flex items-center justify-center mb-2"
        style={{ backgroundColor: iconBg }}
      >{icon}</div>
      <p className="text-sm xs:text-base md:text-lg font-bold leading-none" style={{ color: danger && value > 0 ? '#DC2626' : valueColor }}>
        {formatCurrency(value)}
      </p>
      <p className="text-[10px] xs:text-xs text-slate-500 mt-1 leading-tight">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function ExpiringMemberRow({ member, gymId }: { member: MemberWithStatus, gymId: string }) {
  const daysLeft = member.days_remaining
  return (
    <div className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="w-8 h-8 bg-gradient-to-br from-brand-100 to-brand-200 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-brand-700 font-bold text-xs">{member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm truncate">{member.name}</p>
        <p className="text-xs text-slate-400">{member.phone}</p>
      </div>
      <p className="text-xs font-semibold text-amber-600 whitespace-nowrap">
        {daysLeft === 0 ? 'Today' : daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
      </p>
      {member.latest_membership && (
        isValidPhone(member.phone) ? (
          <a href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors whitespace-nowrap"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Remind</span>
          </a>
        ) : (
          <div className="flex items-center gap-1 bg-slate-200 text-slate-400 text-xs font-semibold px-2 py-1.5 rounded-lg cursor-not-allowed whitespace-nowrap"
            title="Invalid phone number — cannot send WhatsApp message">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Remind</span>
          </div>
        )
      )}
    </div>
  )
}
