'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Clock, AlertTriangle, CheckSquare, MessageCircle, Plus, LogOut, Dumbbell, CalendarCheck, TrendingUp, FileText, IndianRupee, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink, formatDate, formatCurrency, isValidPhone } from '@/lib/utils'
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
  console.log("[CLIENT] DASHBOARD_CLIENT_RENDERED")
  const [sendingBulk, setSendingBulk] = useState(false)
  const [bulkSent, setBulkSent] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [expiringFilter, setExpiringFilter] = useState<'week' | 'month'>('week')
  const [monthMembers, setMonthMembers] = useState<MemberWithStatus[] | null>(null)
  const [fetchingMonth, setFetchingMonth] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (expiringFilter === 'month' && monthMembers === null && !fetchingMonth) {
      setFetchingMonth(true)
      const fetchMonth = async () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const { data: membershipsData } = await supabase
          .from('memberships')
          .select('member_id, end_date, member:members(id, name, phone, member_number)')
          .eq('gym_id', gymId)
          .order('created_at', { ascending: false })
          
        const memberMap = new Map<string, any>()
        for (const m of membershipsData ?? []) {
          if (!m.member || memberMap.has(m.member_id)) continue
          const daysRemaining = Math.ceil((new Date(m.end_date).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24))
          memberMap.set(m.member_id, { ...(m.member as any), latest_membership: m, days_remaining: daysRemaining })
        }
        
        const currentMonth = todayStr.slice(0, 7) // e.g. "2026-06"
        const monthExpiring = Array.from(memberMap.values()).filter(m => {
          if (!m.latest_membership) return false
          const endStr = m.latest_membership.end_date // "2026-06-25"
          return endStr.startsWith(currentMonth)
        })
        
        setMonthMembers(monthExpiring.sort((a, b) => a.days_remaining - b.days_remaining))
        setFetchingMonth(false)
      }
      fetchMonth()
    }
  }, [expiringFilter, gymId, monthMembers, fetchingMonth, supabase])

  // Feature 1: Bulk WhatsApp Reminders
  function handleBulkRemind() {
    if (expiringMembers.length === 0) return
    setSendingBulk(true)

    expiringMembers.forEach((member, i) => {
      if (!member.latest_membership) return
      setTimeout(() => {
        window.open(buildWhatsAppLink(member.phone, member.name, member.latest_membership!.end_date), '_blank')
      }, i * 600)
    })
    setTimeout(() => { setSendingBulk(false) }, expiringMembers.length * 600 + 500)
  }

  // Feature 3: Daily Report PDF
  async function handleDailyPDF() {
    setGeneratingPDF(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const [membershipsRes, newMembersRes] = await Promise.all([
      supabase
        .from('memberships')
        .select('amount, admission_fee, payment_mode, plan, category, member:members(name, member_number)')
        .eq('gym_id', gymId)
        .gte('created_at', startOfToday.toISOString())
        .lte('created_at', endOfToday.toISOString()),
      supabase
        .from('members')
        .select('name, member_number, phone, area, gender')
        .eq('gym_id', gymId)
        .gte('created_at', startOfToday.toISOString())
        .lte('created_at', endOfToday.toISOString())
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
    setGeneratingPDF(false)
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-slide-up max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Dumbbell className="w-4 h-4 text-brand-500" />
            <span className="text-sm text-slate-500 font-medium">{gymName}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        </div>
      </div>

      {/* Stats Grid — 2 cols mobile, 3 cols tablet, 6 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        <StatCard icon={<Users className="w-4 h-4 text-emerald-600" />} label="Active" value={stats.total_active} bg="bg-emerald-50" href="/members?filter=active" />
        <StatCard icon={<CheckSquare className="w-4 h-4 text-brand-600" />} label="Attendance" value={stats.today_attendance} bg="bg-brand-50" href="/attendance" />
        <StatCard icon={<Clock className="w-4 h-4 text-amber-600" />} label="Expiring" value={stats.expiring_this_week} bg="bg-amber-50" href="/members?filter=expiring" />
        <StatCard icon={<AlertTriangle className="w-4 h-4 text-red-500" />} label="Expired" value={stats.expired_count} bg="bg-red-50" href="/members?filter=expired" />
        <StatCardCurrency icon={<IndianRupee className="w-4 h-4 text-cyan-600" />} label="Today's Collection" value={stats.today_collection} bg="bg-cyan-50" />
        <StatCardCurrency icon={<AlertTriangle className="w-4 h-4 text-red-500" />} label="Total Dues" value={stats.total_dues} bg="bg-red-50" href="/dues" danger />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 md:gap-6 items-stretch">
        <div className="flex-1 w-full min-w-0 flex flex-col">
          <motion.div
            className="card flex-1"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.15 }}
          >
            <ExpiringContent
              expiringMembers={expiringFilter === 'month' ? (monthMembers || []) : expiringMembers}
              handleBulkRemind={handleBulkRemind}
              sendingBulk={sendingBulk}
              bulkSent={bulkSent}
              gymId={gymId}
              expiringFilter={expiringFilter}
              setExpiringFilter={setExpiringFilter}
              fetchingMonth={fetchingMonth}
            />
          </motion.div>
        </div>

        {/* Quick Actions */}
        <div className="w-full lg:w-96 flex-shrink-0 card p-4 md:p-5 flex flex-col gap-3 bg-gradient-to-b from-white to-slate-50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
            <TrendingUp className="w-3 h-3" />
            Quick Actions
          </p>
          <div className="flex flex-col gap-3 flex-1 justify-center">
            <Link href="/members/new" className="flex items-center gap-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl p-3.5 font-bold text-sm hover:shadow-lg hover:shadow-brand-200 active:scale-95 transition-all">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><Plus className="w-5 h-5" /></div>
              Add New Member
            </Link>
            <Link href="/attendance" className="flex items-center gap-3 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl p-3.5 font-bold text-sm hover:shadow-lg hover:shadow-cyan-200 active:scale-95 transition-all">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><CalendarCheck className="w-5 h-5" /></div>
              Mark Attendance
            </Link>
            {/* Feature 3: Daily Collection PDF */}
            <button onClick={handleDailyPDF} disabled={generatingPDF}
              className="w-full flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl p-3.5 font-bold text-sm hover:shadow-lg hover:shadow-emerald-200 active:scale-95 transition-all disabled:opacity-60"
            >
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><FileText className="w-5 h-5" /></div>
              {generatingPDF ? 'Generating...' : "Daily Report PDF"}
            </button>
            <Link href="/dues" className="flex items-center gap-3 bg-white text-red-600 rounded-xl p-3.5 font-bold text-sm hover:bg-red-50 transition-all border-2 border-red-100 active:scale-95">
              <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center"><IndianRupee className="w-5 h-5" /></div>
              View Fee Dues {stats.total_dues > 0 && <span className="ml-auto text-xs bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse">{formatCurrency(stats.total_dues)}</span>}
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
  sendingBulk, 
  bulkSent, 
  gymId,
  expiringFilter,
  setExpiringFilter,
  fetchingMonth
}: { 
  expiringMembers: MemberWithStatus[], 
  handleBulkRemind: () => void, 
  sendingBulk: boolean, 
  bulkSent: boolean, 
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
        <div className="divide-y divide-slate-50">
          {expiringMembers.map((member) => <ExpiringMemberRow key={member.id} member={member} gymId={gymId} />)}
        </div>
      )}
    </>
  )
}

function StatCard({ icon, label, value, bg, href }: { icon: React.ReactNode; label: string; value: number; bg: string; href?: string }) {
  const content = (
    <div className="card p-3.5 md:p-4 hover:shadow-md transition-shadow">
      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-2`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function StatCardCurrency({ icon, label, value, bg, href, danger }: { icon: React.ReactNode; label: string; value: number; bg: string; href?: string; danger?: boolean }) {
  const content = (
    <div className="card p-3.5 md:p-4 hover:shadow-md transition-shadow">
      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-2`}>{icon}</div>
      <p className={`text-lg font-bold leading-none ${danger && value > 0 ? 'text-red-600' : 'text-slate-900'}`}>
        {formatCurrency(value)}
      </p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
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
      <p className="text-xs font-semibold text-amber-600 whitespace-nowrap hidden sm:block">
        {daysLeft === 0 ? 'Expires today' : daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
      </p>
      {member.latest_membership && (
        isValidPhone(member.phone) ? (
          <a href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors whitespace-nowrap"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Remind</span>
          </a>
        ) : (
          <div className="flex items-center gap-1 bg-slate-200 text-slate-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-not-allowed whitespace-nowrap"
            title="Invalid phone number — cannot send WhatsApp message">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Remind</span>
          </div>
        )
      )}
    </div>
  )
}
