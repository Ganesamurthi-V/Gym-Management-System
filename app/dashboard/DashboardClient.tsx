'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { 
  Users, Clock, AlertTriangle, CheckSquare, 
  MessageCircle, Plus, LogOut, ChevronRight,
  Dumbbell, CalendarCheck
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink, formatDate, formatCurrency } from '@/lib/utils'
import type { DashboardStats, MemberWithStatus } from '@/types'

interface Props {
  gymName: string
  stats: DashboardStats
  expiringMembers: MemberWithStatus[]
  gymId: string
}

export function DashboardClient({ gymName, stats, expiringMembers, gymId }: Props) {
  const [loggingOut, setLoggingOut] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-brand-600 px-4 pt-10 pb-16">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-brand-200" />
            <span className="text-brand-200 text-sm font-medium">{gymName}</span>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1 text-brand-200 text-sm py-1 px-2 rounded-lg active:bg-brand-700"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-brand-200 text-sm mt-0.5">Today's overview</p>
      </div>

      <div className="px-4 -mt-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard
            icon={<Users className="w-5 h-5 text-green-600" />}
            label="Active Members"
            value={stats.total_active}
            color="green"
          />
          <StatCard
            icon={<CheckSquare className="w-5 h-5 text-blue-600" />}
            label="Today's Attendance"
            value={stats.today_attendance}
            color="blue"
            href="/attendance"
          />
          <StatCard
            icon={<Clock className="w-5 h-5 text-amber-600" />}
            label="Expiring This Week"
            value={stats.expiring_this_week}
            color="amber"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            label="Expired"
            value={stats.expired_count}
            color="red"
          />
        </div>

        {/* Quick Actions */}
        <div className="card p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/members/new" className="flex items-center gap-2 bg-brand-50 text-brand-700 rounded-xl p-3 font-medium text-sm active:scale-[0.98] transition-all">
              <Plus className="w-4 h-4" />
              Add Member
            </Link>
            <Link href="/attendance" className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-xl p-3 font-medium text-sm active:scale-[0.98] transition-all">
              <CalendarCheck className="w-4 h-4" />
              Mark Attendance
            </Link>
          </div>
        </div>

        {/* Expiring This Week */}
        <div className="card mb-6">
          <div className="flex items-center justify-between p-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Expiring This Week</h2>
            <Link href="/members?filter=expiring" className="text-brand-600 text-sm font-medium">
              See all
            </Link>
          </div>

          {expiringMembers.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No members expiring this week 🎉
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expiringMembers.map((member) => (
                <ExpiringMemberRow key={member.id} member={member} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon, label, value, color, href
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'green' | 'blue' | 'amber' | 'red'
  href?: string
}) {
  const colorMap = {
    green: 'bg-green-50',
    blue: 'bg-blue-50',
    amber: 'bg-amber-50',
    red: 'bg-red-50',
  }

  const content = (
    <div className="card p-4">
      <div className={`w-9 h-9 ${colorMap[color]} rounded-xl flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}

function ExpiringMemberRow({ member }: { member: MemberWithStatus }) {
  const daysLeft = member.days_remaining
  const isToday = daysLeft === 0
  const isPast = daysLeft < 0

  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{member.name}</p>
        <p className="text-sm text-gray-500">{member.phone}</p>
        <p className="text-xs text-amber-600 font-medium mt-0.5">
          {isToday
            ? 'Expires today'
            : isPast
            ? `Expired ${Math.abs(daysLeft)}d ago`
            : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
        </p>
      </div>
      {member.latest_membership && (
        <a
          href={buildWhatsAppLink(member.phone, member.name, member.latest_membership.end_date)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 bg-green-500 text-white text-sm font-medium px-3 py-2 rounded-xl ml-3 active:scale-[0.98] transition-all whitespace-nowrap"
        >
          <MessageCircle className="w-4 h-4" />
          Remind
        </a>
      )}
    </div>
  )
}
