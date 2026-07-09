/**
 * Unit tests for normalizeDob (lib/import/normalizers.ts).
 *
 * DOB drives the birthday_wishes WhatsApp automation, which matches on
 * month+day. The parser must yield a clean "YYYY-MM-DD" for the common
 * spreadsheet formats and "" (never today's date) for empty/garbage cells.
 */

import { describe, it, expect } from 'vitest'
import { normalizeDob } from '@/lib/import/normalizers'

describe('normalizeDob', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDob('1995-07-09')).toBe('1995-07-09')
    expect(normalizeDob('1995-07-09T00:00:00Z')).toBe('1995-07-09')
  })

  it('parses DD/MM/YYYY', () => {
    expect(normalizeDob('09/07/1995')).toBe('1995-07-09')
    expect(normalizeDob('9/7/1995')).toBe('1995-07-09')
  })

  it('parses DD-MM-YYYY', () => {
    expect(normalizeDob('09-07-1995')).toBe('1995-07-09')
  })

  it('parses YYYY/MM/DD', () => {
    expect(normalizeDob('1995/07/09')).toBe('1995-07-09')
  })

  it('converts an Excel serial number', () => {
    // Serial 34889 = 1995-07-09
    expect(normalizeDob('34889')).toBe('1995-07-09')
  })

  it('returns "" for empty or unparseable input (never today)', () => {
    expect(normalizeDob('')).toBe('')
    expect(normalizeDob('   ')).toBe('')
    expect(normalizeDob('not a date')).toBe('')
  })

  it('preserves month+day, which is all the birthday automation needs', () => {
    // Even with an ambiguous 2-digit year, month and day must be correct.
    const out = normalizeDob('09/07/95')
    expect(out.slice(5)).toBe('07-09')
  })
})
