import { describe, it, expect } from 'vitest'
import { inventoryHas, s3Window, trimLogMessage, fmtBytes } from '../lib/aws/detailHelpers'

describe('aws detail helpers', () => {
  it('allowlist is exact match only', () => {
    expect(inventoryHas(['fn-a', 'fn-b'], 'fn-a')).toBe(true)
    expect(inventoryHas(['fn-a'], 'fn-')).toBe(false)
    expect(inventoryHas(['fn-a'], '../fn-a')).toBe(false)
  })
  it('s3 always uses 30 days at a daily period', () => {
    const w = s3Window(1_000_000_000_000)
    expect(w.end - w.start).toBe(30 * 86_400_000)
    expect(w.periodSec).toBe(86_400)
  })
  it('trims log messages to 500 chars', () => {
    expect(trimLogMessage('  hi\n')).toBe('hi')
    expect(trimLogMessage('x'.repeat(900))).toHaveLength(500)
  })
  it('formats bytes', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(1536)).toBe('1.5 KB')
  })
})
