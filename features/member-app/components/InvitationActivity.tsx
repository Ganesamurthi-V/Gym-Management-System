'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, MailQuestion, RefreshCw } from 'lucide-react'
import type { InvitationActivity as InvitationRow, InvitationStatus } from '@/types/member-app'
import { runMemberRowAction } from '../services/memberAppService'
import { useAsyncAction } from '../hooks/useMemberAppActions'
import { useFilteredRows, useTableFilters } from '../hooks/useMemberAppFilters'
import {
  Badge, Card, ChipFilter, DateRangeFilter, EmptyState, SearchInput, SectionHeader,
  TableWrap, Td, Th, Tr,
} from './ui'
import type { BadgeTone } from './ui'

type SentStatus = Exclude<InvitationStatus, 'not_sent'>

const STATUSES: readonly SentStatus[] = ['pending', 'delivered', 'activated', 'expired']

const LABELS: Record<SentStatus, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  activated: 'Activated',
  expired: 'Expired',
}

const TONES: Record<SentStatus, BadgeTone> = {
  pending: 'amber',
  delivered: 'blue',
  activated: 'green',
  expired: 'red',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Invitation pipeline view.
 *
 * Deliberately surfaces only member-facing outcome data. WhatsApp message IDs,
 * delivery receipts, API status codes and queue identifiers are never rendered.
 */
export default function InvitationActivity({ invitations }: { invitations: InvitationRow[] }) {
  const [rows, setRows] = useState(invitations)
  const filters = useTableFilters<SentStatus>()
  const { run, isPending, isBusy } = useAsyncAction()

  useEffect(() => setRows(invitations), [invitations])

  const filtered = useFilteredRows(rows, filters, {
    searchText: row => `${row.memberName} ${row.memberNumber}`,
    status: row => row.status,
    date: row => row.sentOn,
  })

  async function handleResend(row: InvitationRow) {
    const result = await run(row.id, () => runMemberRowAction('resend_invitation', row.memberId))
    if (result?.success) {
      setRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, status: 'pending', sentOn: new Date().toISOString() } : r,
      ))
    }
  }

  return (
    <Card>
      <SectionHeader
        title="Invitation Activity"
        description="Track the invitation pipeline from send through activation."
        action={
          <SearchInput
            value={filters.search}
            onChange={filters.setSearch}
            placeholder="Search member name"
          />
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <ChipFilter
          options={STATUSES}
          selected={filters.statuses}
          onToggle={filters.toggleStatus}
          labelFor={value => LABELS[value]}
        />
        <div className="lg:ml-auto">
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
          icon={<MailQuestion className="w-5 h-5" />}
          title={filters.isFiltered ? 'No invitations match your filters' : 'No invitations sent yet'}
          message={
            filters.isFiltered
              ? 'Try clearing the status chips or widening the date range.'
              : 'Send a portal invitation from Member Portal Management to get started.'
          }
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Invitation Sent On</Th>
              <Th>Status</Th>
              <Th>Activated On</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <Tr key={row.id}>
                <Td>
                  <span className="font-semibold text-slate-900">{row.memberName}</span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    GF{String(row.memberNumber).padStart(4, '0')}
                  </p>
                </Td>
                <Td className="text-slate-500">{formatDateTime(row.sentOn)}</Td>
                <Td><Badge tone={TONES[row.status]}>{LABELS[row.status]}</Badge></Td>
                <Td className="text-slate-500">{formatDateTime(row.activatedOn)}</Td>
                <Td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleResend(row)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-brand-700 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors"
                  >
                    {isPending(row.id)
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    Resend
                  </button>
                  <Link
                    href={`/members/${row.memberId}`}
                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    View Member
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  )
}
