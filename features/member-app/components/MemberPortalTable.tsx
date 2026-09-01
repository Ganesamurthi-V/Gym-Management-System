'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  MoreVertical, Loader2, ChevronLeft, ChevronRight, Users,
  Power, PowerOff, Send, RefreshCw, Ban, CheckCircle2, KeyRound, LogOut,
} from 'lucide-react'
import type {
  InvitationStatus, MemberBulkAction, MemberPortalRow, MemberRowAction, PortalStatus,
} from '@/types/member-app'
import { memberRowAction, memberBulkAction } from '@/app/owner/member-app/actions'
import { useAsyncAction } from '../hooks/useMemberAppActions'
import { useFilteredRows, useRowSelection, useTableFilters } from '../hooks/useMemberAppFilters'
import { Badge, Card, EmptyState, SearchInput, SectionHeader, TableWrap, Td, Th, Tr, ChipFilter } from './ui'
import type { BadgeTone } from './ui'

const PAGE_SIZE = 8

const PORTAL_STATUSES: readonly PortalStatus[] = ['enabled', 'disabled', 'not_invited']

const PORTAL_LABELS: Record<PortalStatus, string> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
  not_invited: 'Not Invited',
}

const PORTAL_TONES: Record<PortalStatus, BadgeTone> = {
  enabled: 'green',
  disabled: 'slate',
  not_invited: 'amber',
}

const INVITE_LABELS: Record<InvitationStatus, string> = {
  not_sent: 'Not Sent',
  pending: 'Pending',
  delivered: 'Delivered',
  activated: 'Activated',
  expired: 'Expired',
}

const INVITE_TONES: Record<InvitationStatus, BadgeTone> = {
  not_sent: 'slate',
  pending: 'amber',
  delivered: 'blue',
  activated: 'green',
  expired: 'red',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function MemberPortalTable({ rows: initialRows, onMutationComplete }: { rows: MemberPortalRow[]; onMutationComplete?: (rows?: MemberPortalRow[]) => void }) {
  const [rows, setRows] = useState(initialRows)
  const [page, setPage] = useState(1)
  const filters = useTableFilters<PortalStatus>()
  const { run, isPending, isBusy } = useAsyncAction()

  useEffect(() => setRows(initialRows), [initialRows])

  const filtered = useFilteredRows(rows, filters, {
    searchText: row => `${row.memberName} ${row.memberNumber} ${row.phone}`,
    status: row => row.portalStatus,
  })

  // Clamp the page when filtering shrinks the result set below the current page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  useEffect(() => { if (page !== safePage) setPage(safePage) }, [page, safePage])

  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  )

  const pageIds = useMemo(() => pageRows.map(r => r.memberId), [pageRows])
  const selection = useRowSelection(pageIds)

  /** Optimistically reflect the mutation locally; the service is a stub. */
  function applyLocal(memberId: string, action: MemberRowAction) {
    setRows(prev => prev.map(row => {
      if (row.memberId !== memberId) return row
      switch (action) {
        case 'enable_portal':  return { ...row, portalStatus: 'enabled' }
        case 'disable_portal': return { ...row, portalStatus: 'disabled' }
        case 'send_invitation':
        case 'resend_invitation': return { ...row, invitationStatus: 'pending' }
        case 'suspend_access':    return { ...row, suspended: true, portalStatus: 'disabled' }
        case 'reactivate_access': return { ...row, suspended: false, portalStatus: 'enabled' }
        default: return row
      }
    }))
  }

  async function handleRowAction(row: MemberPortalRow, action: MemberRowAction) {
    const result = await run(`${row.memberId}:${action}`, () => memberRowAction(action, row.memberId))
    if (result?.success || result?.invitationCreated) {
      applyLocal(row.memberId, action)
      // Notify parent to update overview cards and trigger server refresh
      onMutationComplete?.(rows.map(r => {
        if (r.memberId !== row.memberId) return r
        switch (action) {
          case 'enable_portal':  return { ...r, portalStatus: 'enabled' as const, suspended: false }
          case 'disable_portal': return { ...r, portalStatus: 'disabled' as const }
          case 'send_invitation':
          case 'resend_invitation': return { ...r, invitationStatus: 'pending' as const, portalStatus: 'enabled' as const }
          case 'suspend_access':    return { ...r, suspended: true, portalStatus: 'disabled' as const }
          case 'reactivate_access': return { ...r, suspended: false, portalStatus: 'enabled' as const }
          default: return r
        }
      }))
    }
  }

  async function handleBulk(action: MemberBulkAction) {
    const ids = [...selection.selected]
    const result = await run(action, () => memberBulkAction(action, ids))
    if (!result?.success && !(action === 'bulk_send_invitation' && result?.invitationCreated)) return

    if (action === 'bulk_send_invitation') {
      // Per-member outcomes can differ. Do not mark every selected row pending
      // from an aggregate result; refresh from the authoritative server rows.
      selection.clear()
      onMutationComplete?.()
      return
    }

    if (action === 'bulk_enable_portal') ids.forEach(id => applyLocal(id, 'enable_portal'))
    if (action === 'bulk_suspend') ids.forEach(id => applyLocal(id, 'suspend_access'))
    selection.clear()
    onMutationComplete?.()
  }

  return (
    <Card>
      <SectionHeader
        title="Member Portal Management"
        description="Control portal access and invitations for each member."
        action={
          <SearchInput
            value={filters.search}
            onChange={value => { filters.setSearch(value); setPage(1) }}
            placeholder="Search name, ID or phone"
          />
        }
      />

      <div className="mb-4">
        <ChipFilter
          options={PORTAL_STATUSES}
          selected={filters.statuses}
          onToggle={value => { filters.toggleStatus(value); setPage(1) }}
          labelFor={value => PORTAL_LABELS[value]}
        />
      </div>

      {selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-brand-50 border border-brand-100 rounded-xl">
          <span className="text-sm font-semibold text-brand-700 mr-1">
            {selection.count} selected
          </span>
          <BulkButton label="Enable Portal" action="bulk_enable_portal" onRun={handleBulk} isPending={isPending} isBusy={isBusy} />
          <BulkButton label="Send Invitation" action="bulk_send_invitation" onRun={handleBulk} isPending={isPending} isBusy={isBusy} />
          <BulkButton label="Suspend" action="bulk_suspend" onRun={handleBulk} isPending={isPending} isBusy={isBusy} />
          <BulkButton label="Export" action="bulk_export" onRun={handleBulk} isPending={isPending} isBusy={isBusy} />
          <button
            type="button"
            onClick={selection.clear}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-5 h-5" />}
          title="No members match your filters"
          message="Adjust the search text or status filters to see more members."
        />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all members on this page"
                    checked={selection.allVisibleSelected}
                    onChange={selection.toggleAll}
                    className="w-4 h-4 rounded border-surface-border text-brand-600 focus:ring-brand-500/30"
                  />
                </Th>
                <Th>Member Name</Th>
                <Th>Portal Status</Th>
                <Th>Invitation Status</Th>
                <Th>Activated On</Th>
                <Th>Last Login</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => (
                <Tr key={row.memberId}>
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.memberName}`}
                      checked={selection.isSelected(row.memberId)}
                      onChange={() => selection.toggle(row.memberId)}
                      className="w-4 h-4 rounded border-surface-border text-brand-600 focus:ring-brand-500/30"
                    />
                  </Td>
                  <Td>
                    <Link href={`/owner/members/${row.memberId}`} className="font-semibold text-slate-900 hover:text-brand-600 transition-colors">
                      {row.memberName}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">
                      GF{String(row.memberNumber).padStart(4, '0')} · {row.phone}
                    </p>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={PORTAL_TONES[row.portalStatus]}>{PORTAL_LABELS[row.portalStatus]}</Badge>
                      {row.suspended && <Badge tone="red">Suspended</Badge>}
                    </div>
                  </Td>
                  <Td><Badge tone={INVITE_TONES[row.invitationStatus]}>{INVITE_LABELS[row.invitationStatus]}</Badge></Td>
                  <Td className="text-slate-500">{formatDate(row.activatedOn)}</Td>
                  <Td className="text-slate-500">{formatDateTime(row.lastLogin)}</Td>
                  <Td className="text-right">
                    <RowMenu row={row} onAction={handleRowAction} isBusy={isBusy} isPending={isPending} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>

          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-slate-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                aria-label="Previous page"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-slate-600 px-2">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                aria-label="Next page"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Bulk action button ──────────────────────────────────────────────────────

function BulkButton({
  label, action, onRun, isPending, isBusy,
}: {
  label: string
  action: MemberBulkAction
  onRun: (action: MemberBulkAction) => Promise<void>
  isPending: (key: string) => boolean
  isBusy: boolean
}) {
  const pending = isPending(action)
  return (
    <button
      type="button"
      onClick={() => onRun(action)}
      disabled={isBusy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-brand-200 text-brand-700 text-xs font-semibold rounded-lg hover:bg-brand-100/50 disabled:opacity-50 transition-colors"
    >
      {pending && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </button>
  )
}

// ─── Row action dropdown ─────────────────────────────────────────────────────

function RowMenu({
  row, onAction, isBusy, isPending,
}: {
  row: MemberPortalRow
  onAction: (row: MemberPortalRow, action: MemberRowAction) => Promise<void>
  isBusy: boolean
  isPending: (key: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    function onEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const portalEnabled = row.portalStatus === 'enabled'
  const inviteSent = row.invitationStatus !== 'not_sent'

  const items: Array<{ label: string; action: MemberRowAction; icon: React.ReactNode; danger?: boolean }> = [
    portalEnabled
      ? { label: 'Disable Portal', action: 'disable_portal', icon: <PowerOff className="w-3.5 h-3.5" /> }
      : { label: 'Enable Portal',  action: 'enable_portal',  icon: <Power className="w-3.5 h-3.5" /> },
    inviteSent
      ? { label: 'Resend Invitation', action: 'resend_invitation', icon: <RefreshCw className="w-3.5 h-3.5" /> }
      : { label: 'Send Invitation',   action: 'send_invitation',   icon: <Send className="w-3.5 h-3.5" /> },
    row.suspended
      ? { label: 'Reactivate', action: 'reactivate_access', icon: <CheckCircle2 className="w-3.5 h-3.5" /> }
      : { label: 'Suspend Access', action: 'suspend_access', icon: <Ban className="w-3.5 h-3.5" />, danger: true },
    { label: 'Reset Password', action: 'reset_password', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { label: 'Force Logout',   action: 'force_logout',   icon: <LogOut className="w-3.5 h-3.5" />, danger: true },
  ]

  const rowPending = items.some(item => isPending(`${row.memberId}:${item.action}`))

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={isBusy && !rowPending}
        aria-label={`Actions for ${row.memberName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 transition-colors"
      >
        {rowPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-52 bg-white rounded-xl shadow-lg border border-surface-border py-1"
        >
          {items.map(item => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); void onAction(row, item.action) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors ${
                item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
