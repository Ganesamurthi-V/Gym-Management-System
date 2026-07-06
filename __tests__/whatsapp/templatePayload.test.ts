/**
 * Unit tests for the Meta Cloud API template payload builder
 * (services/whatsapp/graph.ts → buildTemplatePayload).
 *
 * These assert the exact structure Meta expects: template name, language,
 * component types, and the positional body/header parameters for each of the
 * six approved templates.
 */

import { describe, it, expect } from 'vitest'
import { buildTemplatePayload } from '@/services/whatsapp/graph'
import type { TemplateContext } from '@/types/whatsapp'

const base: TemplateContext = {
  phone: '9876543210',
  gymName: 'Iron Temple',
  memberName: 'Arjun',
}

/** Pull the flat list of body-parameter text values out of a payload. */
function bodyTexts(payload: any): string[] {
  const body = payload.template.components.find((c: any) => c.type === 'body')
  return (body?.parameters ?? []).map((p: any) => p.text)
}
function headerTexts(payload: any): string[] {
  const header = payload.template.components.find((c: any) => c.type === 'header')
  return (header?.parameters ?? []).map((p: any) => p.text)
}

describe('buildTemplatePayload — common envelope', () => {
  it('normalises Indian phone numbers to include the country code', () => {
    const p = buildTemplatePayload('gymflow_welcome_member', base) as any
    expect(p.messaging_product).toBe('whatsapp')
    expect(p.type).toBe('template')
    expect(p.to).toBe('919876543210')
  })

  it('does not double-prefix a number that already has 91', () => {
    const p = buildTemplatePayload('gymflow_welcome_member', { ...base, phone: '919876543210' }) as any
    expect(p.to).toBe('919876543210')
  })

  it('throws on an unknown template', () => {
    expect(() => buildTemplatePayload('not_a_template' as any, base)).toThrow()
  })
})

describe('buildTemplatePayload — gymflow_welcome_member', () => {
  it('includes the gym name in the header (approved template has "Welcome to {{1}}")', () => {
    const p = buildTemplatePayload('gymflow_welcome_member', { ...base, plan: 'monthly' }) as any
    expect(headerTexts(p)).toEqual(['Iron Temple'])
  })

  it('maps gym, member, plan, start date in the body in order', () => {
    const p = buildTemplatePayload('gymflow_welcome_member', {
      ...base, plan: 'monthly', startDate: '2026-07-06',
    }) as any
    expect(p.template.name).toBe('gymflow_welcome_member')
    expect(p.template.language.code).toBe('en')
    expect(bodyTexts(p)).toEqual(['Iron Temple', 'Arjun', 'Monthly', '06 Jul 2026'])
  })

  it('falls back to a dash when start date is missing', () => {
    const p = buildTemplatePayload('gymflow_welcome_member', { ...base, plan: 'annual' }) as any
    expect(bodyTexts(p)).toEqual(['Iron Temple', 'Arjun', 'Annual (12 Months)', '—'])
  })
})

describe('buildTemplatePayload — membership_renewed', () => {
  it('maps member, gym, plan, valid-until in order', () => {
    const p = buildTemplatePayload('membership_renewed', {
      ...base, plan: 'quarterly', validUntil: '2026-10-06',
    }) as any
    expect(p.template.name).toBe('membership_renewed')
    expect(bodyTexts(p)).toEqual(['Arjun', 'Iron Temple', 'Quarterly (3 Months)', '06 Oct 2026'])
  })
})

describe('buildTemplatePayload — membership_expiry_reminder', () => {
  it('maps member, plan, expiry date, days remaining', () => {
    const p = buildTemplatePayload('membership_expiry_reminder', {
      ...base, plan: 'monthly', expiryDate: '2026-07-20', daysRemaining: 14,
    }) as any
    expect(bodyTexts(p)).toEqual(['Arjun', 'Monthly', '20 Jul 2026', '14'])
  })

  it('renders 0 days remaining as "0", not blank', () => {
    const p = buildTemplatePayload('membership_expiry_reminder', {
      ...base, plan: 'monthly', expiryDate: '2026-07-06', daysRemaining: 0,
    }) as any
    expect(bodyTexts(p)[3]).toBe('0')
  })
})

describe('buildTemplatePayload — membership_expired', () => {
  it('maps member, gym, plan, expiry date', () => {
    const p = buildTemplatePayload('membership_expired', {
      ...base, plan: 'monthly', expiryDate: '2026-07-01',
    }) as any
    expect(bodyTexts(p)).toEqual(['Arjun', 'Iron Temple', 'Monthly', '01 Jul 2026'])
  })
})

describe('buildTemplatePayload — payment_due_reminder', () => {
  it('maps member name and a bare grouped amount (template already prints ₹)', () => {
    const p = buildTemplatePayload('payment_due_reminder', { ...base, dueAmount: 1500 }) as any
    const texts = bodyTexts(p)
    expect(texts[0]).toBe('Arjun')
    expect(texts[1]).toBe('1,500')            // NOT "₹1,500" — avoids "₹₹1,500"
    expect(texts[1]).not.toContain('₹')
  })

  it('defaults a missing amount to zero', () => {
    const p = buildTemplatePayload('payment_due_reminder', base) as any
    expect(bodyTexts(p)[1]).toBe('0')
  })
})

describe('buildTemplatePayload — birthday_wishes', () => {
  it('puts the member name in the header and gym name in the body', () => {
    const p = buildTemplatePayload('birthday_wishes', base) as any
    expect(headerTexts(p)).toEqual(['Arjun'])
    expect(bodyTexts(p)).toEqual(['Iron Temple'])
  })
})
