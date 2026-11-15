'use client'

import * as React from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'

export interface ChartSeries {
  key: string
  label: string
  /** defaults to var(--chart-N) */
  color?: string
}

interface ChartAreaInteractiveProps {
  title: string
  description?: string
  data: Record<string, number>[]
  series: ChartSeries[]
  xKey?: string
  /** Slot in the card header, e.g. a range ToggleGroup supplied by the page. */
  action?: React.ReactNode
  valueFormatter?: (v: number) => string
  xTickFormatter?: (t: number) => string
  height?: number
  type?: 'area' | 'line' | 'bar'
}

export function ChartAreaInteractive({
  title,
  description,
  data,
  series,
  xKey = 't',
  action,
  valueFormatter,
  xTickFormatter,
  height = 250,
  type = 'area',
}: ChartAreaInteractiveProps) {
  const uid = React.useId().replace(/:/g, '')

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {}
    series.forEach((s, i) => {
      config[s.key] = { label: s.label, color: s.color ?? `var(--chart-${(i % 5) + 1})` }
    })
    return config
  }, [series])

  const formatValue = (v: number) => (valueFormatter ? valueFormatter(v) : v.toLocaleString())
  const formatX = (t: number) => (xTickFormatter ? xTickFormatter(t) : String(t))

  const common = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey={xKey}
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={32}
        tickFormatter={(v: number) => formatX(v)}
      />
      <YAxis hide domain={[0, 'auto']} />
      <ChartTooltip
        cursor={false}
        content={
          <ChartTooltipContent
            indicator="dot"
            labelFormatter={(_, payload) => {
              const t = payload?.[0]?.payload?.[xKey]
              return typeof t === 'number' ? formatX(t) : ''
            }}
            formatter={(value, name, item) => (
              <>
                <div
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color ?? item.payload?.fill }}
                />
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">{chartConfig[String(name)]?.label ?? name}</span>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {formatValue(Number(value))}
                  </span>
                </div>
              </>
            )}
          />
        }
      />
      {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
    </>
  )

  let chart: React.ReactElement
  if (type === 'bar') {
    chart = (
      <BarChart data={data}>
        {common}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    )
  } else if (type === 'line') {
    chart = (
      <LineChart data={data}>
        {common}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    )
  } else {
    chart = (
      <AreaChart data={data}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.8} />
              <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.1} />
            </linearGradient>
          ))}
        </defs>
        {common}
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            type="natural"
            fill={`url(#fill-${uid}-${s.key})`}
            stroke={`var(--color-${s.key})`}
          />
        ))}
      </AreaChart>
    )
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height }}>
          {chart}
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
