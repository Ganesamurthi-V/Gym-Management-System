'use client'

import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Building2 } from 'lucide-react'

import { DataTable } from '@/components/dashboard/data-table'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { StatusBadge, type StatusTone } from '@/components/dashboard/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Gym = {
  id: string
  name: string
  created_at: string
  is_active: boolean
  subscription_status: string
  plan_type: string | null
  memberCount: number
}

type StatusFilter = 'all' | 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled'

const SUB_BADGE: Record<string, { label: string; tone: StatusTone }> = {
  trial: { label: 'Trial', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  expired: { label: 'Expired', tone: 'error' },
  suspended: { label: 'Suspended', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  unknown: { label: 'Unknown', tone: 'unknown' },
}

const columns: ColumnDef<Gym, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Gym Name',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border">
          <Building2 className="size-4" />
        </div>
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: 'memberCount',
    header: 'Members',
    cell: ({ row }) => <span className="tabular-nums">{row.original.memberCount}</span>,
  },
  {
    accessorKey: 'is_active',
    header: 'Account',
    cell: ({ row }) =>
      row.original.is_active ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="error">Banned</StatusBadge>,
  },
  {
    accessorKey: 'subscription_status',
    header: 'Subscription',
    cell: ({ row }) => {
      const gym = row.original
      const badge = SUB_BADGE[gym.subscription_status] ?? SUB_BADGE.unknown
      return (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          {gym.plan_type && gym.plan_type !== 'trial' && (
            <span className="text-muted-foreground text-xs capitalize">{gym.plan_type}</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Joined',
    cell: ({ row }) => (
      <span className="text-muted-foreground whitespace-nowrap">
        {new Date(row.original.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
    ),
  },
]

export default function GymsClient({ gyms, error }: { gyms: Gym[]; error: string | null }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = gyms.filter(g => statusFilter === 'all' || g.subscription_status === statusFilter)

  return (
    <div className="space-y-4">
      <PageToolbar title="Gyms" description={`All registered gym accounts, ${gyms.length} total`} />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        searchKey="name"
        searchPlaceholder="Search gyms by name..."
        getRowHref={gym => `/gyms/${gym.id}`}
        emptyMessage={gyms.length === 0 ? 'No gyms registered yet' : 'No gyms match your search or filter'}
        toolbar={
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger size="sm" className="w-44" aria-label="Filter by subscription status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </div>
  )
}
