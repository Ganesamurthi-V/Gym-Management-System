'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/dashboard/data-table'
import { StatusBadge, type StatusTone } from '@/components/dashboard/status-badge'

export interface LogRow {
  id: string
  level: string
  title: string
  culprit: string
  page: string
  time: string
}

function tone(level: string): StatusTone {
  if (level === 'error' || level === 'fatal') return 'error'
  if (level === 'warning') return 'warning'
  if (level === 'info') return 'info'
  return 'neutral'
}

const columns: ColumnDef<LogRow, unknown>[] = [
  { accessorKey: 'level', header: 'Level', cell: ({ row }) => <StatusBadge tone={tone(row.original.level)}>{row.original.level}</StatusBadge> },
  {
    accessorKey: 'title',
    header: 'Message',
    cell: ({ row }) => (
      <div className="max-w-[16rem] min-w-0 sm:max-w-md">
        <p className="truncate font-medium" title={row.original.title}>{row.original.title}</p>
        {row.original.culprit && (
          <p className="text-muted-foreground truncate text-xs" title={row.original.culprit}>{row.original.culprit}</p>
        )}
      </div>
    ),
  },
  { accessorKey: 'page', header: 'Context', cell: ({ row }) => <span className="text-muted-foreground font-mono text-xs">{row.original.page}</span> },
  { accessorKey: 'time', header: 'Time', cell: ({ row }) => <span className="text-muted-foreground text-xs whitespace-nowrap">{row.original.time}</span> },
]

export function LogsTable({ data }: { data: LogRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="title"
      searchPlaceholder="Search messages..."
      pageSize={20}
      emptyMessage="No events found or check Sentry API config"
    />
  )
}
