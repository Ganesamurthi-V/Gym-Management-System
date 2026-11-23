import type { AwsChartUnit, AwsRange } from '@/lib/aws/types'

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let v = n
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toFixed(n > 0 && n < 0.1 ? 2 : 1)}%`
}

/** Axis tick: clock time for 1h/24h, day + month for 7d. IST to match the rest of the product. */
export function formatTick(t: number, range: AwsRange): string {
  const d = new Date(t)
  if (range === '7d') return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
}

export function formatMs(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`
  return `${Math.round(n)} ms`
}

/** Format a chart value by its unit (axis ticks and tooltips). */
export function formatUnit(v: number, unit: AwsChartUnit): string {
  if (unit === 'bytes') return formatBytes(v)
  if (unit === 'ms') return formatMs(v)
  if (unit === 'percent') return formatPct(v)
  if (unit === 'units') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v)
  return formatNumber(v)
}
