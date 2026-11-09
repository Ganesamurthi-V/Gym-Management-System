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

  it('skips and counts garbage and bad pins', () => {
    const r = parseAttlog('garbage\n\t\n12\tnot-a-date\n../x\t2026-11-09 08:01:02\n1\t2026-11-09 08:01:02\t0\t1')
    expect(r.punches).toHaveLength(1)
    expect(r.skipped).toBe(3)
  })
})
