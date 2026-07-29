'use client'

import Link from 'next/link'
import { Activity } from 'lucide-react'
import type { MemberActivityEvent, MemberActivityType } from '@/types/member-app'
import { useFilteredRows, useTableFilters } from '../hooks/useMemberAppFilters'
import {
  Badge, Card, ChipFilter, DateRangeFilter, EmptyState, SearchInput, SectionHeader,
  TableWrap, Td, Th, Tr,
} from './ui'
import type { BadgeTone } from './ui'

const ACTIVITY_TYPES: readonly MemberActivityType[] = [
  'portal_activated', 'logged_in', 'password_reset',
  'membership_renewed', 'membership_expired',
  'invitation_resent', 'portal_disabled', 'portal_enabled',
]

/** Display strings are fixed by spec — do not reword. */
const ACTIVITY_LABELS: Record<MemberActivityType, string> = {
  portal_activated: 'Portal Activated',
  logged_in: 'Logged In',
  password_reset: 'Password Reset',
  membership_renewed: 'Membership Renewed',
  membership_expired: 'Membership Expired',
  invitation_resent: 'Invitation Resent',
  portal_disabled: 'Portal Disabled',
  portal_enabled: 'Portal Enabled',
}

const ACTIVITY_TONES: Record<MemberActivityType, BadgeTone> = {
  portal_activated: 'green',
  logged_in: 'blue',
  password_reset: 'amber',
  membership_renewed: 'green',
  membership_expired: 'red',
  invitation_resent: 'violet',
  portal_disabled: 'slate',
  portal_enabled: 'green',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function MemberActivityLog({ activity }: { activity: MemberActivityEvent[] }) {
  const filters = useTableFilters<MemberActivityType>()

  const filtered = useFilteredRows(activity, filters, {
    searchText: row => `${row.memberName} ${row.memberNumber}`,
    status: row => row.activity,
    date: row => row.occurredAt,
  })

  return (
    <Card>
      <SectionHeader
        title="Member Activity"
        description="Portal events recorded for your members."
        action={
          <SearchInput
            value={filters.search}
            onChange={filters.setSearch}
            placeholder="Search member name"
          />
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-start gap-3 mb-4">
        <ChipFilter
          options={ACTIVITY_TYPES}
          selected={filters.statuses}
          onToggle={filters.toggleStatus}
          labelFor={value => ACTIVITY_LABELS[value]}
        />
        <div className="lg:ml-auto lg:flex-shrink-0">
          <DateRangeFilter
            from={filters.from}
            to={filters.to}
            onFromChange={filters.setFrom}
            onToChange={filters.setTo}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-5 h-5" />}
          title={filters.isFiltered ? 'No activity matches your filters' : 'No member activity yet'}
          message={
            filters.isFiltered
              ? 'Try clearing the activity chips or widening the date range.'
              : 'Events appear here once members start using the app.'
          }
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Activity</Th>
              <Th>Date &amp; Time</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <Tr key={row.id}>
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
                <Td><Badge tone={ACTIVITY_TONES[row.activity]}>{ACTIVITY_LABELS[row.activity]}</Badge></Td>
                <Td className="text-slate-500">{formatDateTime(row.occurredAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  )
}
