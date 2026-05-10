'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Users, Clock, AlertTriangle, CheckSquare, MessageCircle, Plus, LogOut, Dumbbell, CalendarCheck, TrendingUp, FileText, IndianRupee, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink, formatDate, formatCurrency, isValidPhone } from '@/lib/utils'
import { generateDailyCollectionPDF } from '@/lib/pdf'
import type { DashboardStats, MemberWithStatus } from '@/types'
import { format } from 'date-fns'

interface Props {
  gymName: string
  stats: DashboardStats
  expiringMembers: MemberWithStatus[]
  gymId: string
}

export function DashboardClient({ gymName, stats, expiringMembers, gymId }: Props) {
  const [sendingBulk, setSendingBulk] = useState(false)
  const [bulkSent, setBulkSent] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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

  // Feature 3: Daily Collection PDF
  async function handleDailyPDF() {
    setGeneratingPDF(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('memberships')
      .select('amount, admission_fee, payment_mode, plan, member:members(name, member_number)')
      .eq('gym_id', gymId)
      .eq('start_date', today)

    const payments = (data ?? []).map((p: any) => ({
      memberName: p.member?.name ?? 'Unknown',
      memberNumber: p.member?.member_number ?? 0,
      plan: p.plan,
      amount: p.amount,
      admission_fee: p.admission_fee ?? 0,
      payment_mode: p.payment_mode,
    }))

    generateDailyCollectionPDF({ gymName, date: today, payments })
    setGeneratingPDF(false)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Dumbbell className="w-4 h-4 text-brand-500" />
            <span className="text-sm text-gray-500 font-medium">{gymName}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>
      </div>

      {/* Stats Grid — 2 cols mobile, 3 cols desktop (added dues + collection) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<Users className="w-4 h-4 text-emerald-600" />} label="Active" value={stats.total_active} bg="bg-emerald-50" href="/members?filter=active" />
        <StatCard icon={<CheckSquare className="w-4 h-4 text-blue-600" />} label="Attendance" value={stats.today_attendance} bg="bg-blue-50" href="/attendance" />
        <StatCard icon={<Clock className="w-4 h-4 text-amber-600" />} label="Expiring" value={stats.expiring_this_week} bg="bg-amber-50" href="/members?filter=expiring" />
        <StatCard icon={<AlertTriangle className="w-4 h-4 text-red-500" />} label="Expired" value={stats.expired_count} bg="bg-red-50" href="/members?filter=expired" />
        <StatCardCurrency icon={<IndianRupee className="w-4 h-4 text-brand-600" />} label="Today's Collection" value={stats.today_collection} bg="bg-brand-50" />
        <StatCardCurrency icon={<AlertTriangle className="w-4 h-4 text-red-500" />} label="Total Dues" value={stats.total_dues} bg="bg-red-50" href="/dues" danger />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Quick Actions */}
        <div className="card p-4 md:p-5 space-y-2.5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Quick Actions</p>
          <Link href="/members/new" className="flex items-center gap-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl p-3 font-semibold text-sm hover:from-brand-600 hover:to-brand-700 transition-all">
            <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center"><Plus className="w-4 h-4" /></div>
            Add New Member
          </Link>
          <Link href="/attendance" className="flex items-center gap-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-3 font-semibold text-sm hover:from-blue-600 hover:to-blue-700 transition-all">
            <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center"><CalendarCheck className="w-4 h-4" /></div>
            Mark Attendance
          </Link>
          {/* Feature 3: Daily Collection PDF */}
          <button onClick={handleDailyPDF} disabled={generatingPDF}
            className="w-full flex items-center gap-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl p-3 font-semibold text-sm hover:from-purple-600 hover:to-purple-700 transition-all disabled:opacity-60"
          >
            <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center"><FileText className="w-4 h-4" /></div>
            {generatingPDF ? 'Generating...' : "Today's Collection PDF"}
          </button>
          <Link href="/dues" className="flex items-center gap-3 bg-red-50 text-red-700 rounded-xl p-3 font-semibold text-sm hover:bg-red-100 transition-all border border-red-200">
            <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center"><IndianRupee className="w-4 h-4" /></div>
            View Fee Dues {stats.total_dues > 0 && <span className="ml-auto text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">{formatCurrency(stats.total_dues)}</span>}
          </Link>
        </div>

        {/* Expiring This Week */}
        <div className="card md:col-span-2">
          <div className="flex items-center justify-between px-4 md:px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="font-bold text-gray-900 text-sm md:text-base">Expiring This Week</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Feature 1: Bulk WhatsApp Remind */}
              {expiringMembers.length > 0 && (
                <button onClick={handleBulkRemind} disabled={sendingBulk || bulkSent}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                    bulkSent
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  {bulkSent ? 'Sent!' : sendingBulk ? 'Sending...' : `Remind All (${expiringMembers.length})`}
                </button>
              )}
              <Link href="/members?filter=expiring" className="text-brand-600 text-sm font-semibold">See all</Link>
            </div>
          </div>
          {expiringMembers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-2xl mb-1">🎉</p>
              <p className="text-gray-400 text-sm">No members expiring this week</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expiringMembers.map((member) => <ExpiringMemberRow key={member.id} member={member} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, bg, href }: { icon: React.ReactNode; label: string; value: number; bg: string; href?: string }) {
  const content = (
    <div className="card p-3.5 md:p-4 hover:shadow-md transition-shadow">
      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-2`}>{icon}</div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function StatCardCurrency({ icon, label, value, bg, href, danger }: { icon: React.ReactNode; label: string; value: number; bg: string; href?: string; danger?: boolean }) {
  const content = (
    <div className="card p-3.5 md:p-4 hover:shadow-md transition-shadow">
      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-2`}>{icon}</div>
      <p className={`text-lg font-bold leading-none ${danger && value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {formatCurrency(value)}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

function ExpiringMemberRow({ member }: { member: MemberWithStatus }) {
  const daysLeft = member.days_remaining
  return (
    <div className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-gray-50 transition-colors">
      <div className="w-8 h-8 bg-gradient-to-br from-brand-100 to-brand-200 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-brand-700 font-bold text-xs">{member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{member.name}</p>
        <p className="text-xs text-gray-400">{member.phone}</p>
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
          <div className="flex items-center gap-1 bg-gray-200 text-gray-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-not-allowed whitespace-nowrap"
            title="Invalid phone number — cannot send WhatsApp message">
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Remind</span>
          </div>
        )
      )}
    </div>
  )
}
