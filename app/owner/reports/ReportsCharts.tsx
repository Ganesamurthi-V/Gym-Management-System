'use client'

import type { ReactNode } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ReportData } from './report-data'

// Grid and tick colours come from the theme ramp so they flip with dark mode;
// recharts writes them into SVG attributes, which Tailwind classes cannot reach.
const GRID = 'rgb(var(--c-slate-200))'
const TICK = 'rgb(var(--c-slate-500))'
const BRAND = '#2563EB'
const EMERALD = '#10B981'
const VIOLET = '#8B5CF6'
const ORANGE = '#EA580C'

const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`
const compactInr = (value: number) =>
  value >= 100000 ? `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')}L`
    : value >= 1000 ? `₹${Math.round(value / 1000)}k`
    : `₹${value}`
const shortMonth = (label: string) => label.split(' ')[0]

type Month = ReportData['months'][number]

// The tooltip stays dark in both themes (`ink` does not flip), so its text is
// literal white rather than a slate step that would invert against it.
function Tip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-ink-900 border border-ink-800 px-3.5 py-2.5 rounded-xl shadow-lg text-white text-xs space-y-1">
      <p className="font-bold text-white/60">{title}</p>
      {children}
    </div>
  )
}

interface TipProps<Row> {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Row }>
}

const axis = { stroke: TICK, fontSize: 10, tickLine: false, axisLine: false } as const

export function CollectionsChart({ months, average }: { months: Month[]; average: number | null }) {
  const current = months[months.length - 1]?.label
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={months} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="reportsCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={BRAND} stopOpacity={0.25} />
            <stop offset="95%" stopColor={BRAND} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tickFormatter={shortMonth} dy={8} {...axis} />
        <YAxis tickFormatter={compactInr} width={48} {...axis} />
        <Tooltip
          content={({ active, payload }: TipProps<Month>) => {
            const row = payload?.[0]?.payload
            if (!active || !row) return null
            return (
              <Tip title={row.label === current ? `${row.label} · so far` : row.label}>
                <p className="font-black text-sm text-brand-300">{inr(row.total)}</p>
                <p className="text-white/70">Memberships {inr(row.memberships)}</p>
                <p className="text-white/70">Dues collected {inr(row.dues)}</p>
                <p className="text-white/70">Inventory {inr(row.inventory)}</p>
              </Tip>
            )
          }}
        />
        {average !== null && average > 0 && (
          <ReferenceLine y={average} stroke={TICK} strokeDasharray="6 4" />
        )}
        <Area type="monotone" dataKey="total" stroke={BRAND} strokeWidth={3} fill="url(#reportsCollected)" animationDuration={1200} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function PaymentModeDonut({ upi, cash, card }: { upi: number; cash: number; card: number }) {
  const slices = [
    { name: 'UPI', value: upi, color: BRAND },
    { name: 'Cash', value: cash, color: EMERALD },
    { name: 'Card', value: card, color: VIOLET },
  ]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={slices} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none" animationDuration={1000}>
          {slices.map(slice => <Cell key={slice.name} fill={slice.color} />)}
        </Pie>
        <Tooltip
          content={({ active, payload }: TipProps<(typeof slices)[number]>) => {
            const row = payload?.[0]?.payload
            if (!active || !row) return null
            return (
              <Tip title={row.name}>
                <p className="font-black text-brand-300">{inr(row.value)}</p>
              </Tip>
            )
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

type Weekday = ReportData['attendance']['byDay'][number]

export function WeekdayBars({ byDay }: { byDay: Weekday[] }) {
  const peak = Math.max(...byDay.map(day => day.count))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={byDay} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
        <XAxis dataKey="name" dy={8} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip
          cursor={{ fill: GRID, opacity: 0.4 }}
          content={({ active, payload }: TipProps<Weekday>) => {
            const row = payload?.[0]?.payload
            if (!active || !row) return null
            return (
              <Tip title={row.name}>
                <p className="font-black text-brand-300">{row.count} check-ins</p>
              </Tip>
            )
          }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1200}>
          {byDay.map(day => <Cell key={day.name} fill={peak > 0 && day.count === peak ? ORANGE : '#3B82F6'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function JoinsChart({ months }: { months: Month[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={months} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tickFormatter={shortMonth} dy={8} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip
          cursor={{ fill: GRID, opacity: 0.4 }}
          content={({ active, payload }: TipProps<Month>) => {
            const row = payload?.[0]?.payload
            if (!active || !row) return null
            return (
              <Tip title={row.label}>
                <p className="font-black text-brand-300">{row.newMembers} new</p>
                <p className="font-black text-emerald-400">{row.renewals} renewed</p>
              </Tip>
            )
          }}
        />
        <Bar dataKey="newMembers" fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Bar dataKey="renewals" fill={EMERALD} radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
