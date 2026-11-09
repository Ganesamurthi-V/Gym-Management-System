import { describe, it, expect } from 'vitest'
import { deviceLocalToInstant, istDateOf, sessionOf, isStale, isValidTimeZone } from '@/lib/devices/time'

describe('deviceLocalToInstant', () => {
  it('converts an IST device time', () => {
    expect(deviceLocalToInstant('2026-11-09 06:00:00', 'Asia/Kolkata')?.toISOString()).toBe('2026-11-09T00:30:00.000Z')
  })
  it('keeps the IST date either side of midnight', () => {
    const before = deviceLocalToInstant('2026-11-08 23:50:00', 'Asia/Kolkata')!
    const after = deviceLocalToInstant('2026-11-09 00:10:00', 'Asia/Kolkata')!
    expect(after.toISOString()).toBe('2026-11-08T18:40:00.000Z')
    expect(istDateOf(before)).toBe('2026-11-08')
    expect(istDateOf(after)).toBe('2026-11-09')
  })
  it('honours a non-IST zone (New York, standard time) and derives the IST date from the instant', () => {
    const at = deviceLocalToInstant('2026-11-09 08:00:00', 'America/New_York')!
    expect(at.toISOString()).toBe('2026-11-09T13:00:00.000Z')
    expect(istDateOf(at)).toBe('2026-11-09')
  })
  it('a device ahead of IST can land on the previous UTC day but the right IST day', () => {
    const at = deviceLocalToInstant('2026-11-09 03:00:00', 'Asia/Dubai')!
    expect(at.toISOString()).toBe('2026-11-08T23:00:00.000Z')
    expect(istDateOf(at)).toBe('2026-11-09')
  })
  it('rejects malformed, impossible and unknown-zone input', () => {
    expect(deviceLocalToInstant('2026-11-09T06:00:00', 'Asia/Kolkata')).toBeNull()
    expect(deviceLocalToInstant('2026-02-30 10:00:00', 'Asia/Kolkata')).toBeNull()
    expect(deviceLocalToInstant('2026-11-09 24:00:00', 'Asia/Kolkata')).toBeNull()
    expect(deviceLocalToInstant('2026-11-09 06:00:00', 'Not/AZone')).toBeNull()
  })
})

describe('sessionOf', () => {
  it('uses the kiosk default: evening from 14:00 IST', () => {
    expect(sessionOf(deviceLocalToInstant('2026-11-09 06:00:00', 'Asia/Kolkata')!)).toBe('morning')
    expect(sessionOf(deviceLocalToInstant('2026-11-09 13:59:59', 'Asia/Kolkata')!)).toBe('morning')
    expect(sessionOf(deviceLocalToInstant('2026-11-09 14:00:00', 'Asia/Kolkata')!)).toBe('evening')
    expect(sessionOf(deviceLocalToInstant('2026-11-09 23:30:00', 'Asia/Kolkata')!)).toBe('evening')
  })
})

describe('isStale', () => {
  const now = new Date('2026-11-09T05:00:00Z')
  it('flags punches older than 7 days or more than 10 minutes ahead', () => {
    expect(isStale(new Date('2026-11-02T04:59:00Z'), now)).toBe(true)
    expect(isStale(new Date('2026-11-02T05:01:00Z'), now)).toBe(false)
    expect(isStale(new Date('2026-11-09T05:11:00Z'), now)).toBe(true)
    expect(isStale(new Date('2026-11-09T05:09:00Z'), now)).toBe(false)
  })
})

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})
