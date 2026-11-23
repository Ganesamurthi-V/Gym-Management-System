'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@/components/dashboard/data-table'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { AwsRange, AwsResourceType, AwsStatus } from '@/lib/aws/types'

export interface ResourceRow {
  type: AwsResourceType
  id: string
  name: string
  metricLabel: string
  metricValue: string
  /** raw number behind metricValue, for ordering */
  metricNum: number
  status: AwsStatus
}

const TYPE_LABEL: Record<AwsResourceType, string> = {
  lambda: 'Lambda',
  cloudfront: 'CloudFront',
  dynamodb: 'DynamoDB',
  s3: 'S3',
}

// Type tints live here (one-off palette-by-type, not a status). Each uses a semantic token.
const TYPE_CLASS: Record<AwsResourceType, string> = {
  lambda: 'border-violet/20 bg-violet/10 text-violet',
  cloudfront: 'border-primary/20 bg-primary/10 text-primary',
  dynamodb: 'border-info/20 bg-info/10 text-info',
  s3: 'border-success/20 bg-success/10 text-success',
}

const METRIC_CLASS: Partial<Record<AwsStatus, string>> = {
  critical: 'text-destructive font-medium',
  warning: 'text-warning font-medium',
}

const columns: ColumnDef<ResourceRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span className="block max-w-[14rem] truncate font-medium sm:max-w-sm" title={row.original.name}>
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline" className={TYPE_CLASS[row.original.type]}>{TYPE_LABEL[row.original.type]}</Badge>,
  },
  {
    id: 'metric',
    header: 'Key metric',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <span className="text-muted-foreground">{row.original.metricLabel} </span>
        <span className={cn('tabular-nums', METRIC_CLASS[row.original.status])}>{row.original.metricValue}</span>
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge tone={row.original.status}>{row.original.status}</StatusBadge>,
  },
]

export function ResourcesTable({ rows, range }: { rows: ResourceRow[]; range: AwsRange }) {
  const [filter, setFilter] = React.useState<'all' | AwsResourceType>('all')
  const data = React.useMemo(() => (filter === 'all' ? rows : rows.filter((r) => r.type === filter)), [rows, filter])

  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="name"
      searchPlaceholder="Search resources..."
      getRowHref={(r) => `/aws/${r.type}/${encodeURIComponent(r.id)}?range=${range}`}
      emptyMessage="No resources."
      toolbar={
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {(Object.keys(TYPE_LABEL) as AwsResourceType[]).map((t) => (
              <TabsTrigger key={t} value={t}>{TYPE_LABEL[t]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    />
  )
}
