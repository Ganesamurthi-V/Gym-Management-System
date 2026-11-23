'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink } from 'lucide-react'
import { DataTable } from '@/components/dashboard/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ResolveButton from '@/components/errors/ResolveButton'

export interface ErrorRow {
  id: string
  title: string
  culprit: string
  count: string
  userCount: number
  firstSeen: string
  lastSeen: string
  permalink: string
}

const columns: ColumnDef<ErrorRow, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Issue',
    cell: ({ row }) => (
      <div className="max-w-[16rem] min-w-0 sm:max-w-md">
        <p className="truncate font-medium" title={row.original.title}>{row.original.title}</p>
        <p className="text-muted-foreground truncate font-mono text-xs" title={row.original.culprit}>{row.original.culprit}</p>
      </div>
    ),
  },
  {
    accessorKey: 'count',
    header: 'Events',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="tabular-nums">{row.original.count}</Badge>
        {row.original.userCount > 0 && <span className="text-muted-foreground text-xs">{row.original.userCount} users</span>}
      </div>
    ),
  },
  { accessorKey: 'firstSeen', header: 'First Seen', cell: ({ row }) => <span className="text-muted-foreground text-xs whitespace-nowrap">{row.original.firstSeen}</span> },
  { accessorKey: 'lastSeen', header: 'Last Seen', cell: ({ row }) => <span className="text-muted-foreground text-xs whitespace-nowrap">{row.original.lastSeen}</span> },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <ResolveButton issueId={row.original.id} />
        <Button variant="ghost" size="icon" asChild>
          <a href={row.original.permalink} target="_blank" rel="noreferrer" title="View in Sentry" aria-label="View in Sentry">
            <ExternalLink />
          </a>
        </Button>
      </div>
    ),
  },
]

export function ErrorsTable({ data }: { data: ErrorRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="title"
      searchPlaceholder="Search issues..."
      emptyMessage="All clear! No unresolved errors found."
    />
  )
}
