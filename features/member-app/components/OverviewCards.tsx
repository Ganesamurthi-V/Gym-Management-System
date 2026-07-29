'use client'

import { Smartphone, Users, MailQuestion, LogIn, CalendarRange, CalendarDays } from 'lucide-react'
import type { MemberAppOverview } from '@/types/member-app'
import { Badge, StatCard } from './ui'

export default function OverviewCards({ overview }: { overview: MemberAppOverview }) {
  const online = overview.appStatus === 'Online'

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      <StatCard
        label="App Status"
        value={overview.appStatus}
        icon={<Smartphone className="w-4 h-4" />}
        iconBg={online ? 'bg-emerald-50' : 'bg-red-50'}
        iconColor={online ? 'text-emerald-600' : 'text-red-600'}
        badge={<Badge tone={online ? 'green' : 'red'}>{online ? 'Live' : 'Down'}</Badge>}
      />
      <StatCard
        label="Active Members"
        value={overview.activeMembers}
        icon={<Users className="w-4 h-4" />}
      />
      <StatCard
        label="Pending Invitations"
        value={overview.pendingInvitations}
        icon={<MailQuestion className="w-4 h-4" />}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
      />
      <StatCard
        label="Today's Logins"
        value={overview.todaysLogins}
        icon={<LogIn className="w-4 h-4" />}
        iconBg="bg-violet-50"
        iconColor="text-violet-600"
      />
      <StatCard
        label="Weekly Active"
        value={overview.weeklyActiveUsers}
        icon={<CalendarRange className="w-4 h-4" />}
        iconBg="bg-cyan-50"
        iconColor="text-cyan-600"
      />
      <StatCard
        label="Monthly Active"
        value={overview.monthlyActiveUsers}
        icon={<CalendarDays className="w-4 h-4" />}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
      />
    </div>
  )
}
