'use client'

import Link from 'next/link'
import { Users, LogIn, CalendarRange, MailQuestion, Ban, Clock } from 'lucide-react'
import type { LoginOverviewSummary, RecentLogin } from '@/types/member-app'
import { ONLINE_THRESHOLD_MINUTES } from '@/types/member-app'
import { Badge, Card, EmptyState, SectionHeader, StatCard, TableWrap, Td, Th, Tr } from './ui'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/** A member counts as online when their last login is inside the threshold. */
function isOnline(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() <= ONLINE_THRESHOLD_MINUTES * 60_000
}

export default function LoginOverview({
  summary,
  recentLogins,
}: {
  summary: LoginOverviewSummary
  recentLogins: RecentLogin[]
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          label="Total Active Members"
          value={summary.totalActiveMembers}
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          label="Logged In Today"
          value={summary.loggedInToday}
          icon={<LogIn className="w-4 h-4" />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          label="Active This Week"
          value={summary.activeThisWeek}
          icon={<CalendarRange className="w-4 h-4" />}
          iconBg="bg-cyan-50"
          iconColor="text-cyan-600"
        />
        <StatCard
          label="Pending Invitations"
          value={summary.pendingInvitations}
          icon={<MailQuestion className="w-4 h-4" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          label="Suspended Accounts"
          value={summary.suspendedAccounts}
          icon={<Ban className="w-4 h-4" />}
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
      </div>

      <Card>
        <SectionHeader
          title="Recent Logins"
          description={`Last ${recentLogins.length} sessions. Online means active within ${ONLINE_THRESHOLD_MINUTES} minutes.`}
        />

        {recentLogins.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-5 h-5" />}
            title="No logins recorded yet"
            message="Sessions appear here once members sign in to the app."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Last Login</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {recentLogins.map(row => {
                const online = isOnline(row.lastLogin)
                return (
                  <Tr key={row.memberId}>
                    <Td>
                      <Link
                        href={`/members/${row.memberId}`}
                        className="font-semibold text-slate-900 hover:text-brand-600 transition-colors"
                      >
                        {row.memberName}
                      </Link>
                      <p className="text-xs text-slate-400 mt-0.5">
                        GF{String(row.memberNumber).padStart(4, '0')}
                      </p>
                    </Td>
                    <Td className="text-slate-500">{formatDateTime(row.lastLogin)}</Td>
                    <Td>
                      <Badge tone={online ? 'green' : 'slate'}>{online ? 'Online' : 'Offline'}</Badge>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
