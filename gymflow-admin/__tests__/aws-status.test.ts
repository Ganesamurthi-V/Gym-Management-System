import { describe, it, expect } from 'vitest'
import { lambdaStatus, cloudfrontStatus, dynamoStatus, budgetStatus, pct, buildRange } from '../lib/aws/status'

describe('aws status', () => {
  it('lambda', () => {
    expect(lambdaStatus(1000, 0, 0)).toBe('healthy')
    expect(lambdaStatus(100, 1, 0)).toBe('warning')
    expect(lambdaStatus(100, 5, 0)).toBe('critical')
    // deploy-time blip: 104 throttles in 57,745 invocations stays healthy
    expect(lambdaStatus(57745, 0, 104)).toBe('healthy')
    expect(lambdaStatus(1000, 0, 6)).toBe('warning')
    expect(lambdaStatus(500, 0, 15)).toBe('critical')
    // tiny samples (< 200 requests) ignore the throttle rate
    expect(lambdaStatus(36, 0, 1)).toBe('healthy')
    expect(lambdaStatus(0, 0, 5)).toBe('healthy')
    expect(lambdaStatus(100, 5, 0)).toBe('critical')
    expect(lambdaStatus(0, 0, 0)).toBe('healthy')
  })
  it('cloudfront', () => {
    expect(cloudfrontStatus(50, 50, 19)).toBe('healthy')
    expect(cloudfrontStatus(5, 0, 100)).toBe('critical')
    expect(cloudfrontStatus(1, 0, 100)).toBe('warning')
    expect(cloudfrontStatus(0, 10, 100)).toBe('warning')
    expect(cloudfrontStatus(0.5, 9, 100)).toBe('healthy')
  })
  it('dynamo', () => {
    expect(dynamoStatus(0)).toBe('healthy')
    expect(dynamoStatus(2)).toBe('critical')
  })
  it('budget', () => {
    expect(budgetStatus(10, 'STANDBY')).toBe('healthy')
    expect(budgetStatus(10, null)).toBe('healthy')
    expect(budgetStatus(80, 'STANDBY')).toBe('warning')
    expect(budgetStatus(100, 'STANDBY')).toBe('critical')
    expect(budgetStatus(10, 'EXECUTION_SUCCESS')).toBe('critical')
  })
  it('pct handles a zero denominator', () => {
    expect(pct(5, 0)).toBe(0)
    expect(pct(1, 4)).toBe(25)
  })
  it('buildRange', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 30)
    const h = buildRange('1h', now), d = buildRange('24h', now), w = buildRange('7d', now)
    expect([h.periodSec, d.periodSec, w.periodSec]).toEqual([60, 300, 3600])
    expect(h.end - h.start).toBe(3_600_000)
    expect(d.end - d.start).toBe(86_400_000)
    expect(w.end - w.start).toBe(7 * 86_400_000)
    expect(h.end).toBeGreaterThanOrEqual(now)
    expect(h.end % 60_000).toBe(0)
  })
})
