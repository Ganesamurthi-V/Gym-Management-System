/**
 * Unit tests for normalizePhoneForImport (lib/import/normalizers.ts).
 *
 * Imported phones are stored in E.164 (91XXXXXXXXXX) so imported members are
 * immediately eligible for WhatsApp automations. Numbers that can't be parsed
 * to a 10-digit Indian mobile are stored as the INVALID_NUMBER sentinel, which
 * the automation scheduler and sendTemplate both refuse to send to.
 */

import { describe, it, expect } from 'vitest'
import { normalizePhoneForImport, INVALID_PHONE } from '@/lib/import/normalizers'

describe('normalizePhoneForImport', () => {
  it('normalizes a bare 10-digit mobile to E.164', () => {
    expect(normalizePhoneForImport('9876543210')).toEqual({ phone: '919876543210', valid: true })
  })

  it('strips separators and +91 prefixes', () => {
    expect(normalizePhoneForImport('+91 98765 43210')).toEqual({ phone: '919876543210', valid: true })
    expect(normalizePhoneForImport('91-98765-43210')).toEqual({ phone: '919876543210', valid: true })
  })

  it('is idempotent for numbers already stored as 91XXXXXXXXXX', () => {
    expect(normalizePhoneForImport('919876543210')).toEqual({ phone: '919876543210', valid: true })
  })

  it('drops a leading 0 (STD prefix)', () => {
    expect(normalizePhoneForImport('09876543210')).toEqual({ phone: '919876543210', valid: true })
  })

  it('keeps a 10-digit number that itself starts with 91', () => {
    // 9198765432 is a valid 10-digit mobile, not a country-coded number.
    expect(normalizePhoneForImport('9198765432')).toEqual({ phone: '919198765432', valid: true })
  })

  it('marks too-short numbers as INVALID_NUMBER', () => {
    expect(normalizePhoneForImport('12345')).toEqual({ phone: INVALID_PHONE, valid: false })
  })

  it('marks too-long / unparseable numbers as INVALID_NUMBER', () => {
    expect(normalizePhoneForImport('9876543210123456')).toEqual({ phone: INVALID_PHONE, valid: false })
  })

  it('marks empty, null, and non-numeric input as INVALID_NUMBER', () => {
    expect(normalizePhoneForImport('')).toEqual({ phone: INVALID_PHONE, valid: false })
    expect(normalizePhoneForImport(null)).toEqual({ phone: INVALID_PHONE, valid: false })
    expect(normalizePhoneForImport(undefined)).toEqual({ phone: INVALID_PHONE, valid: false })
    expect(normalizePhoneForImport('not a phone')).toEqual({ phone: INVALID_PHONE, valid: false })
  })
})
