// Pure health rules and window maths. No SDK imports so they can be unit tested and reused.
import type { AwsRange, AwsStatus } from './types'

export function pct(n: number, d: number): number {
  return d > 0 ? (n / d) * 100 : 0
}

export function lambdaStatus(invocations: number, errors: number, throttles: number): AwsStatus {
  const rate = pct(errors, invocations)
  // Judge throttles as a rate, not a count: each SST deploy swaps the code and briefly throttles a
  // handful of requests (seen Nov 2026: 104 of 57,745 = 0.18% over 7 days, all within minutes of
  // UpdateFunctionCode). Throttled requests are not counted in Invocations, so add them back.
  // Ignore the rate on tiny samples: 1 throttle in 37 invocations is one deploy blip, not an incident.
  const throttleRate = invocations + throttles < 200 ? 0 : pct(throttles, invocations + throttles)
  if (rate >= 5 || throttleRate >= 2) return 'critical'
  if (rate >= 1 || throttleRate >= 0.5) return 'warning'
  return 'healthy'
}

export function cloudfrontStatus(rate5xxPct: number, rate4xxPct: number, requests: number): AwsStatus {
  // Too little traffic makes the percentages meaningless (one 404 out of 3 requests is 33%).
  if (requests < 20) return 'healthy'
  if (rate5xxPct >= 5) return 'critical'
  if (rate5xxPct >= 1 || rate4xxPct >= 10) return 'warning'
  return 'healthy'
}

export function dynamoStatus(throttled: number): AwsStatus {
  return throttled > 0 ? 'critical' : 'healthy'
}

export function budgetStatus(percentUsed: number, blockActionStatus: string | null): AwsStatus {
  if (percentUsed >= 100 || (blockActionStatus !== null && blockActionStatus !== 'STANDBY')) return 'critical'
  if (percentUsed >= 80) return 'warning'
  return 'healthy'
}

const RANGES: Record<AwsRange, { ms: number; periodSec: number }> = {
  '1h': { ms: 3_600_000, periodSec: 60 },
  '24h': { ms: 86_400_000, periodSec: 300 },
  '7d': { ms: 7 * 86_400_000, periodSec: 3600 },
}

export function buildRange(range: AwsRange, now: number): { start: number; end: number; periodSec: number } {
  const { ms, periodSec } = RANGES[range]
  // Align the end to a period boundary so repeated calls within a period hit the same buckets.
  const end = Math.floor(now / (periodSec * 1000)) * periodSec * 1000 + periodSec * 1000
  return { start: end - ms, end, periodSec }
}
