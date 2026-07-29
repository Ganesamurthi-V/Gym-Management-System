'use client'

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { BarChart3 } from 'lucide-react'
import type { MemberAppAnalytics, TimeSeriesPoint } from '@/types/member-app'
import { Card, EmptyState, SectionHeader } from './ui'

/** Chart palette is fixed to the brand ramp — no new design colours. */
const STROKE = '#2563EB'  // brand-500
const FILL = '#DBEAFE'    // brand-100
const GRID = '#E2E8F0'    // surface-border
const AXIS = '#94A3B8'    // slate-400

const AXIS_PROPS = {
  stroke: AXIS,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

const TOOLTIP_STYLE = {
  borderRadius: '0.75rem',
  border: `1px solid ${GRID}`,
  fontSize: '12px',
  boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
} as const

type ChartKind = 'area' | 'bar' | 'line'

interface ChartSpec {
  key: keyof MemberAppAnalytics
  title: string
  subtitle: string
  kind: ChartKind
  /** Appended to tooltip values, e.g. '%' or ' min'. */
  unit?: string
}

const CHARTS: ChartSpec[] = [
  { key: 'dailyActiveUsers',         title: 'Daily Active Users',           subtitle: 'Last 30 days',  kind: 'area' },
  { key: 'weeklyActiveUsers',        title: 'Weekly Active Users',          subtitle: 'Last 12 weeks', kind: 'bar' },
  { key: 'monthlyActiveUsers',       title: 'Monthly Active Users',         subtitle: 'Last 12 months',kind: 'bar' },
  { key: 'retentionRate',            title: 'Retention Rate',               subtitle: 'Last 12 weeks', kind: 'line', unit: '%' },
  { key: 'avgSessionDuration',       title: 'Avg Session Duration',         subtitle: 'Last 30 days',  kind: 'area', unit: ' min' },
  { key: 'activationConversionRate', title: 'Activation Conversion Rate',   subtitle: 'Last 12 weeks', kind: 'line', unit: '%' },
]

export default function AnalyticsCharts({ analytics }: { analytics: MemberAppAnalytics }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
      {CHARTS.map(spec => (
        <ChartCard key={spec.key} spec={spec} data={analytics[spec.key]} />
      ))}
    </div>
  )
}

function ChartCard({ spec, data }: { spec: ChartSpec; data: TimeSeriesPoint[] }) {
  return (
    <Card>
      <SectionHeader title={spec.title} description={spec.subtitle} />

      {data.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-5 h-5" />}
          title="Not enough data yet"
          message="This chart populates once member app usage is recorded."
        />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(spec, data)}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/** Recharts requires a single element child inside ResponsiveContainer. */
function renderChart(spec: ChartSpec, data: TimeSeriesPoint[]) {
  // Recharts types the formatter value as ValueType (number | string | array),
  // so accept the wide type and narrow for display.
  const formatter = (value: unknown): [string, string] => [
    `${typeof value === 'number' || typeof value === 'string' ? value : ''}${spec.unit ?? ''}`,
    spec.title,
  ]
  const gradientId = `grad-${spec.key}`

  if (spec.kind === 'bar') {
    return (
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={formatter} />
        <Bar dataKey="value" fill={STROKE} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    )
  }

  if (spec.kind === 'line') {
    return (
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={formatter} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={STROKE}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: STROKE }}
        />
      </LineChart>
    )
  }

  return (
    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={FILL} stopOpacity={0.9} />
          <stop offset="100%" stopColor={FILL} stopOpacity={0.1} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
      <YAxis {...AXIS_PROPS} />
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={formatter} />
      <Area
        type="monotone"
        dataKey="value"
        stroke={STROKE}
        strokeWidth={2}
        fill={`url(#${gradientId})`}
      />
    </AreaChart>
  )
}
