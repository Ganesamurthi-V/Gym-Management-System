import { chartPoints, niceRange, scaleX, scaleY, shortDate, fmtNum } from '@/lib/progress/chart'

interface Props {
  /** Newest first, as returned by getBodyLogs(). */
  logs: { loggedOn: string; weightKg: number | null }[]
}

const W = 320
const H = 160
const L = 36
const R = 12
const T = 12
const B = 28

export function WeightChart({ logs }: Props) {
  const pts = chartPoints(logs)
  if (pts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-400">
        Log your weight to see the trend.
      </div>
    )
  }

  const { min, max } = niceRange(pts.map((p) => p.value))
  const first = pts[0]
  const last = pts[pts.length - 1]
  const ticks = [max, (min + max) / 2, min]
  const xy = pts.map((p) => ({
    x: scaleX(p.date, first.date, last.date, L, W - R),
    y: scaleY(p.value, min, max, T, H - B),
  }))
  const label =
    pts.length === 1
      ? `Weight ${fmtNum(last.value)} kg on ${shortDate(last.date)}`
      : `Weight from ${fmtNum(first.value)} kg on ${shortDate(first.date)} to ${fmtNum(last.value)} kg on ${shortDate(last.date)}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t) => {
        const y = scaleY(t, min, max, T, H - B)
        return (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y} y2={y} className="stroke-slate-200" strokeWidth="1" />
            <text x={L - 6} y={y + 3} textAnchor="end" className="fill-slate-400" fontSize="10">{fmtNum(t)}</text>
          </g>
        )
      })}
      {xy.length > 1 && (
        <polyline
          points={xy.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          className="stroke-brand-500"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {xy.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" className="fill-brand-500" />
      ))}
      <text x={xy[0].x} y={H - 8} textAnchor={pts.length === 1 ? 'middle' : 'start'} className="fill-slate-400" fontSize="10">
        {shortDate(first.date)}
      </text>
      {pts.length > 1 && (
        <text x={xy[xy.length - 1].x} y={H - 8} textAnchor="end" className="fill-slate-400" fontSize="10">
          {shortDate(last.date)}
        </text>
      )}
    </svg>
  )
}
