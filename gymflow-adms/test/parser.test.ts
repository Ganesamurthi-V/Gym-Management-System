import { describe, expect, it } from 'vitest'
import { parseAttlog } from '../src/parser.js'

describe('parseAttlog', () => {
  it('parses classic tab lines', () => {
    const r = parseAttlog('12\t2026-11-09 08:01:02\t0\t1\t0\t0\n7\t2026-11-09 18:00:00\t1\t15')
    expect(r.punches).toEqual([
      { pin: '12', time: '2026-11-09 08:01:02', status: 0, verify: 1 },
      { pin: '7', time: '2026-11-09 18:00:00', status: 1, verify: 15 },
    ])
    expect(r.skipped).toBe(0)
  })

  it('handles CRLF and trailing blank lines, null for absent fields', () => {
    const r = parseAttlog('5\t2026-11-09 08:01:02\r\n\r\n')
    expect(r.punches).toEqual([{ pin: '5', time: '2026-11-09 08:01:02', status: null, verify: null }])
  })

  it('parses key=value lines', () => {
    const r = parseAttlog('pin=1\ttime=2026-11-09 08:01:02\tstatus=0\tverifytype=1')
    expect(r.punches).toEqual([{ pin: '1', time: '2026-11-09 08:01:02', status: 0, verify: 1 }])
  })

  it('falls back to whitespace separated lines', () => {
    const r = parseAttlog('9 2026-11-09 08:01:02 0 1')
    expect(r.punches).toEqual([{ pin: '9', time: '2026-11-09 08:01:02', status: 0, verify: 1 }])
  })

  it('skips lines over 512 chars quickly, even a 1 MB line of spaces', () => {
    const t = Date.now()
    const r = parseAttlog(' '.repeat(1024 * 1024) + '\n1\t2026-11-09 08:01:02\t0\t1\n' + 'pin=1 '.repeat(100))
    expect(Date.now() - t).toBeLessThan(500)
    expect(r.punches).toHaveLength(1)
    expect(r.skipped).toBe(2)
  })

  it('skips and counts garbage and bad pins', () => {
    const r = parseAttlog('garbage\n\t\n12\tnot-a-date\n../x\t2026-11-09 08:01:02\n1\t2026-11-09 08:01:02\t0\t1')
    expect(r.punches).toHaveLength(1)
    expect(r.skipped).toBe(3)
  })
})

describe('parseAttlog dialects', () => {
  it('parses the eSSL key=value line with aliases and mixed case', () => {
    const r = parseAttlog('PIN=1001\tDateTime=2025-09-02 14:32:11\tVerified=1\tStatus=0')
    expect(r.punches).toEqual([{ pin: '1001', time: '2025-09-02 14:32:11', status: 0, verify: 1 }])
  })

  it('accepts userid/badgenumber, checktime, checktype and verifymode aliases', () => {
    expect(parseAttlog('UserID=5\tCheckTime=2025-09-02 14:32:11\tCheckType=1\tVerifyMode=15').punches).toEqual([
      { pin: '5', time: '2025-09-02 14:32:11', status: 1, verify: 15 },
    ])
    expect(parseAttlog('BadgeNumber=6\ttime=2025-09-02 14:32:11').punches[0]!.pin).toBe('6')
  })

  it('converts a 10-digit epoch using the offset (default 330)', () => {
    // 1767225600 = 2026-01-01 00:00:00 UTC
    expect(parseAttlog('9\t1767225600\t0\t1').punches[0]!.time).toBe('2026-01-01 05:30:00')
    expect(parseAttlog('9\t1767225600\t0\t1', { epochOffsetMinutes: 0 }).punches[0]!.time).toBe('2026-01-01 00:00:00')
    expect(parseAttlog('pin=9\ttime=1767225600', { epochOffsetMinutes: -60 }).punches[0]!.time).toBe('2025-12-31 23:00:00')
  })

  it('does not treat other digit strings as epochs', () => {
    expect(parseAttlog('9\t17672256\t0\t1').punches).toHaveLength(0)
  })
})
