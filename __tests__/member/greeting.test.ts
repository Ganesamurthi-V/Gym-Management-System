import { describe, expect, it } from 'vitest'
import { greetingForHour, istHour } from '@/lib/member/greeting'

describe('greeting', () => {
  it('picks the greeting from the hour', () => {
    expect(greetingForHour(5)).toBe('Good morning')
    expect(greetingForHour(11)).toBe('Good morning')
    expect(greetingForHour(12)).toBe('Good afternoon')
    expect(greetingForHour(16)).toBe('Good afternoon')
    expect(greetingForHour(17)).toBe('Good evening')
    expect(greetingForHour(23)).toBe('Good evening')
    expect(greetingForHour(0)).toBe('Good evening')
    expect(greetingForHour(4)).toBe('Good evening')
  })

  it('reads the hour in India, not UTC', () => {
    // 20:00 UTC is 01:30 IST the next day.
    expect(istHour(new Date('2026-10-27T20:00:00Z'))).toBe(1)
    // 05:00 UTC is 10:30 IST.
    expect(istHour(new Date('2026-10-27T05:00:00Z'))).toBe(10)
    // 18:29 UTC is 23:59 IST.
    expect(istHour(new Date('2026-10-27T18:29:00Z'))).toBe(23)
  })
})
