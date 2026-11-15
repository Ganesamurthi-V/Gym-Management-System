'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Globe, Timer, Wallet } from 'lucide-react'

import { ChartAreaInteractive } from '@/components/dashboard/chart-area-interactive'
import { MetricCards, type MetricCardItem } from '@/components/dashboard/metric-cards'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { AwsMonitorOverview, AwsRange, AwsStatus } from '@/lib/aws/types'
import { formatBytes, formatMs, formatNumber, formatTick, formatUsd } from './format'
import { RangeControls } from './_components/range-controls'
import { ResourcesTable, type ResourceRow } from './_components/resources-table'

const REFRESH_MS = 60_000
const SECTION_LABEL = { lambda: 'Lambda', cloudfront: 'CloudFront', dynamodb: 'DynamoDB', s3: 'S3', cost: 'Cost' }
const SEVERITY: Record<AwsStatus, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3 }

function blockLabel(s: string | null): string {
  if (!s || s === 'STANDBY') return 'Auto-block armed'
  return `Block action: ${s.replace(/_/g, ' ').toLowerCase()}`
}

function buildRows(data: AwsMonitorOverview): ResourceRow[] {
  const rows: ResourceRow[] = [
    ...data.lambda.map((f): ResourceRow => ({
      type: 'lambda', id: f.name, name: f.name, metricLabel: 'Invocations',
      metricValue: formatNumber(f.invocations), metricNum: f.invocations, status: f.status,
    })),
    ...data.cloudfront.map((d): ResourceRow => ({
      type: 'cloudfront', id: d.id, name: d.aliases[0] ?? d.domain, metricLabel: 'Requests',
      metricValue: formatNumber(d.requests), metricNum: d.requests, status: d.status,
    })),
    ...data.dynamodb.map((t): ResourceRow => ({
      type: 'dynamodb', id: t.name, name: t.name, metricLabel: 'Throttles',
      metricValue: formatNumber(t.throttledRequests), metricNum: t.throttledRequests, status: t.health,
    })),
    ...data.s3.map((b): ResourceRow => ({
      type: 's3', id: b.name, name: b.name, metricLabel: 'Size',
      metricValue: formatBytes(b.sizeBytes), metricNum: b.sizeBytes ?? 0, status: 'unknown',
    })),
  ]
  return rows.sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.metricNum - a.metricNum)
}

export default function AwsMonitorClient({ initial, initialError }: {
  initial: AwsMonitorOverview | null
  initialError: string | null
}) {
  const [data, setData] = useState<AwsMonitorOverview | null>(initial)
  const [error, setError] = useState<string | null>(initialError)
  const [range, setRange] = useState<AwsRange>(initial?.range ?? '24h')
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(initial?.generatedAt ?? null)
  const reqId = useRef(0)

  const load = useCallback(async (r: AwsRange) => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/aws/overview?range=${r}`)
      const json = await res.json().catch(() => null)
      if (id !== reqId.current) return
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || 'Failed to load AWS data')
      setData(json.data as AwsMonitorOverview)
      setUpdatedAt(Date.now())
      setError(null)
    } catch (e) {
      if (id !== reqId.current) return
      setError(e instanceof Error ? e.message : 'Failed to load AWS data')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [])

  function pickRange(r: AwsRange) {
    if (r === range) return
    setRange(r)
    load(r)
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(range)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [range, load])

  const updatedText = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })
    : '—'

  return (
    <div className="flex flex-col gap-4">
      <PageToolbar
        title="AWS Monitor"
        description={`Region ${data?.region ?? 'ap-south-1'} · Updated ${updatedText}`}
      >
        <RangeControls range={range} loading={loading} onRange={pickRange} onRefresh={() => load(range)} />
      </PageToolbar>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not load AWS data</AlertTitle>
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}

      {data?.errors.map((e) => (
        <Alert key={e.section} variant="destructive">
          <AlertTriangle />
          <AlertTitle>{SECTION_LABEL[e.section]}</AlertTitle>
          <AlertDescription className="break-words">{e.message}</AlertDescription>
        </Alert>
      ))}

      {data && <Body data={data} range={range} />}
    </div>
  )
}

function Body({ data, range }: { data: AwsMonitorOverview; range: AwsRange }) {
  const rows = useMemo(() => buildRows(data), [data])
  const cloudfrontFailed = data.errors.some((e) => e.section === 'cloudfront')

  const traffic = useMemo(() => {
    const map = new Map<number, { t: number; requests: number; errors5xx: number }>()
    for (const d of data.cloudfront) {
      for (const [key, pts] of [['requests', d.requestsSeries], ['errors5xx', d.errors5xxSeries]] as const) {
        for (const p of pts) {
          const row = map.get(p.t) ?? { t: p.t, requests: 0, errors5xx: 0 }
          row[key] += p.v
          map.set(p.t, row)
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.t - b.t)
  }, [data.cloudfront])

  const cost = data.cost
  const budget = cost?.budget ?? null
  const totalRequests = data.cloudfront.reduce((a, d) => a + d.requests, 0)
  const lambdaErrors = data.lambda.reduce((a, f) => a + f.errors, 0)
  const cfErrors = data.cloudfront.reduce((a, d) => a + Math.round((d.requests * d.rate5xxPct) / 100), 0)
  const serverErrors = lambdaErrors + cfErrors
  const p95s = data.lambda
    .filter((f) => /server/i.test(f.name) && f.p95DurationMs != null)
    .map((f) => f.p95DurationMs as number)

  const items: MetricCardItem[] = [
    {
      icon: Wallet,
      label: 'Spend this month',
      value: cost ? formatUsd(cost.monthToDateUsd) : '—',
      badge: budget
        ? { text: budget.status === 'healthy' ? 'on track' : budget.status, variant: budget.status === 'critical' ? 'destructive' : 'secondary' }
        : undefined,
      footnote: budget ? `of ${formatUsd(budget.limitUsd)} budget · ${blockLabel(budget.blockActionStatus)}` : undefined,
      progress: budget?.percentUsed,
    },
    {
      icon: Globe,
      label: 'App requests',
      value: formatNumber(totalRequests),
      footnote: `across ${data.cloudfront.length} distribution${data.cloudfront.length === 1 ? '' : 's'}`,
    },
    {
      icon: AlertTriangle,
      label: 'Server errors',
      value: formatNumber(serverErrors),
      badge: serverErrors === 0 ? { text: 'healthy', variant: 'secondary' } : { text: 'needs attention', variant: 'destructive' },
    },
    {
      icon: Timer,
      label: 'p95 response time',
      value: p95s.length ? formatMs(Math.max(...p95s)) : '—',
      footnote: 'server functions',
    },
  ]

  return (
    <>
      <MetricCards items={items} />
      {!cloudfrontFailed && (
        <ChartAreaInteractive
          title="Traffic"
          description="Requests and 5xx errors across all distributions"
          data={traffic}
          series={[
            { key: 'requests', label: 'Requests' },
            { key: 'errors5xx', label: '5xx errors' },
          ]}
          valueFormatter={formatNumber}
          xTickFormatter={(t) => formatTick(t, range)}
        />
      )}
      <ResourcesTable rows={rows} range={range} />
    </>
  )
}
