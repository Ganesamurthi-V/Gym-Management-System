'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import {
  Activity, Boxes, Clock, Database, Gauge, Globe, HardDrive, Percent, ServerCrash, Zap,
  type LucideIcon,
} from 'lucide-react'

import { ChartAreaInteractive } from '@/components/dashboard/chart-area-interactive'
import { MetricCards, type MetricCardItem, type MetricTone } from '@/components/dashboard/metric-cards'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { BreadcrumbLabel } from '@/components/layout/breadcrumb-context'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AwsChart, AwsProperty, AwsRange, AwsResourceDetail, AwsResourceType } from '@/lib/aws/types'
import { formatTick, formatUnit } from '../../format'
import { RangeControls } from '../../_components/range-controls'

const REFRESH_MS = 60_000

const STAT_PICK: Record<AwsResourceType, string[]> = {
  lambda: ['Invocations', 'Errors', 'Error rate', 'p95 duration'],
  cloudfront: ['Requests', 'Data out', '4xx rate', '5xx rate'],
  dynamodb: ['Items', 'Size', 'Throttles'],
  s3: ['Size', 'Objects'],
}
const STAT_ICON: Record<string, LucideIcon> = {
  Invocations: Zap, Errors: ServerCrash, 'Error rate': Percent, 'p95 duration': Clock,
  Requests: Globe, 'Data out': Activity, '4xx rate': Percent, '5xx rate': Percent,
  Items: Boxes, Size: HardDrive, Throttles: Gauge, Objects: Database,
}
// Problem stats turn red (or amber) only when the value is above zero; the rest keep a fixed tone by meaning.
function statTone(label: string, value: string): MetricTone {
  const positive = parseFloat(value.replace(/,/g, '')) > 0
  switch (label) {
    case 'Errors':
    case 'Error rate':
    case '5xx rate':
    case 'Throttles':
      return positive ? 'red' : 'emerald'
    case '4xx rate':
      return positive ? 'amber' : 'emerald'
    case 'p95 duration':
      return 'violet'
    case 'Invocations':
    case 'Requests':
      return 'blue'
    default:
      return 'sky'
  }
}

const LEVEL_RE = /(ERROR|WARN(?:ING)?|Task timed out)/i

function LogMessage({ message }: { message: string }) {
  const m = LEVEL_RE.exec(message)
  if (!m) return <>{message}</>
  const warn = /^warn/i.test(m[1])
  return (
    <>
      {message.slice(0, m.index)}
      <span className={warn ? 'text-warning font-semibold' : 'text-destructive font-semibold'}>{m[1]}</span>
      {message.slice(m.index + m[1].length)}
    </>
  )
}

const CHART_PICK: Record<AwsResourceType, string[]> = {
  lambda: ['invocations', 'duration'],
  cloudfront: ['requests', 'errors'],
  dynamodb: ['consumed', 'throttles'],
  s3: ['size', 'objects'],
}
const PROP_PICK: Record<AwsResourceType, string[]> = {
  lambda: ['Runtime', 'Memory', 'Timeout', 'Last modified', 'Concurrency', 'Architecture'],
  cloudfront: ['Domain', 'Aliases', 'Status', 'Price class', 'WAF attached', 'Last modified'],
  dynamodb: ['Status', 'Billing mode', 'Keys', 'Global secondary indexes', 'Created'],
  s3: ['Region', 'Created'],
}

/** Pick by label in the preferred order; fall back to the first items when labels do not match. */
function pick(items: AwsProperty[], labels: string[], max: number): AwsProperty[] {
  const chosen = labels.map((l) => items.find((i) => i.label === l)).filter((i): i is AwsProperty => !!i)
  return (chosen.length ? chosen : items).slice(0, max)
}

function toRows(chart: AwsChart): Record<string, number>[] {
  const map = new Map<number, Record<string, number>>()
  chart.series.forEach((s, i) => {
    for (const p of s.points) {
      const row = map.get(p.t) ?? { t: p.t }
      row[`s${i}`] = p.v
      map.set(p.t, row)
    }
  })
  return Array.from(map.values()).sort((a, b) => a.t - b.t)
}

export default function ResourceDetailClient({ type, id, initialRange, initial, initialError }: {
  type: AwsResourceType
  id: string
  initialRange: AwsRange
  initial: AwsResourceDetail | null
  initialError: string | null
}) {
  const [data, setData] = useState<AwsResourceDetail | null>(initial)
  const [error, setError] = useState<string | null>(initialError)
  const [range, setRange] = useState<AwsRange>(initialRange)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(initial?.generatedAt ?? null)
  const reqId = useRef(0)

  const load = useCallback(async (r: AwsRange) => {
    const req = ++reqId.current
    setLoading(true)
    try {
      const qs = new URLSearchParams({ type, id, range: r })
      const res = await fetch(`/api/admin/aws/resource?${qs.toString()}`)
      const json = await res.json().catch(() => null)
      if (req !== reqId.current) return
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || 'Failed to load AWS resource')
      setData(json.data as AwsResourceDetail)
      setUpdatedAt(Date.now())
      setError(null)
    } catch (e) {
      if (req !== reqId.current) return
      setError(e instanceof Error ? e.message : 'Failed to load AWS resource')
    } finally {
      if (req === reqId.current) setLoading(false)
    }
  }, [type, id])

  function pickRange(r: AwsRange) {
    if (r === range) return
    setRange(r)
    load(r)
    // Keep the URL in sync without a navigation so a reload keeps the chosen window.
    window.history.replaceState(null, '', `?range=${r}`)
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

  const stats: MetricCardItem[] = useMemo(
    () => (data ? pick(data.stats, STAT_PICK[type], 4) : []).map((s) => ({
      icon: STAT_ICON[s.label] ?? Activity, label: s.label, value: s.value,
      tone: statTone(s.label, s.value), valueTone: statTone(s.label, s.value),
    })),
    [data, type],
  )
  const charts = useMemo(() => {
    if (!data) return []
    const byKey = CHART_PICK[type].map((k) => data.charts.find((c) => c.key === k)).filter((c): c is AwsChart => !!c)
    return (byKey.length ? byKey : data.charts).slice(0, 2)
  }, [data, type])
  const details = data ? pick(data.properties, PROP_PICK[type], 6) : []

  return (
    <div className="flex flex-col gap-4">
      <BreadcrumbLabel label={data?.title ?? id} />
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/aws?range=${range}`}>
            <ArrowLeft /> AWS Monitor
          </Link>
        </Button>
      </div>

      <PageToolbar
        title={data?.title ?? id}
        description={`${data?.subtitle ? `${data.subtitle} · ` : ''}Updated ${updatedText}`}
      >
        {data && <StatusBadge tone={data.status}>{data.status}</StatusBadge>}
        <RangeControls range={range} loading={loading} onRange={pickRange} onRefresh={() => load(range)} />
      </PageToolbar>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not load this resource</AlertTitle>
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}

      {data?.errors.map((e, i) => (
        <Alert key={i} variant="destructive">
          <AlertTriangle />
          <AlertDescription className="break-words">{e}</AlertDescription>
        </Alert>
      ))}

      {data && (
        <>
          {stats.length > 0 && <MetricCards items={stats} />}

          {charts.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {charts.map((c) => (
                <ChartAreaInteractive
                  key={c.key}
                  title={c.title}
                  data={toRows(c)}
                  series={c.series.map((s, i) => ({ key: `s${i}`, label: s.label }))}
                  valueFormatter={(v) => formatUnit(v, c.unit)}
                  xTickFormatter={(t) => formatTick(t, range)}
                  type={c.series.length > 1 ? 'line' : 'area'}
                  height={220}
                />
              ))}
            </div>
          )}

          {type === 'lambda' && (
            <Card>
              <CardHeader>
                <CardTitle>Recent errors and warnings</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentLogs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No errors or warnings in this window</p>
                ) : (
                  <ScrollArea className="max-h-80 overflow-y-auto">
                    <ul className="divide-y">
                      {data.recentLogs.map((l, i) => (
                        <li key={`${l.t}-${i}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-3">
                          <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums sm:w-40 sm:shrink-0">
                            {new Date(l.t).toLocaleString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })}
                          </span>
                          <span className="min-w-0 font-mono text-xs break-words whitespace-pre-wrap"><LogMessage message={l.message} /></span>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          {details.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>Configuration of this resource</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                  {details.map((p) => (
                    <div key={p.label} className="flex min-w-0 items-baseline justify-between gap-4 text-sm">
                      <dt className="text-muted-foreground shrink-0">{p.label}</dt>
                      <dd className="min-w-0 text-right break-words">{p.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
