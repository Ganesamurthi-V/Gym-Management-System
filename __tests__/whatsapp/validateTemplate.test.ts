/**
 * Unit tests for the WhatsApp template verification gate
 * (services/whatsapp/validateTemplate.ts).
 *
 * Every payload built by buildTemplatePayload for an approved template must
 * pass; deliberately malformed payloads must be rejected with a clear error,
 * so the send path never dispatches an invalid template to Meta.
 */

import { describe, it, expect } from 'vitest'
import { buildTemplatePayload } from '@/services/whatsapp/graph'
import { validateTemplatePayload } from '@/services/whatsapp/validateTemplate'
import type { TemplateContext, TemplateId } from '@/types/whatsapp'

const base: TemplateContext = {
  phone: '9876543210',
  gymName: 'Iron Temple',
  memberName: 'Arjun',
}

/** Fully-populated context so no template falls back to a placeholder. */
const full: TemplateContext = {
  ...base,
  plan: 'monthly',
  startDate: '2026-07-06',
  validUntil: '2026-10-06',
  expiryDate: '2026-07-20',
  daysRemaining: 14,
  dueAmount: 1500,
  memberId: 'GF001',
}

const ALL_TEMPLATES: TemplateId[] = [
  '_gymflow_welcome_member',
  'membership_renewed',
  'membership_expiry_reminder',
  'membership_expired',
  'payment_due_reminder',
  '_birthday_wishes',
]

describe('validateTemplatePayload — every approved template passes', () => {
  for (const id of ALL_TEMPLATES) {
    it(`accepts a well-formed ${id} payload`, () => {
      const payload = buildTemplatePayload(id, full)
      const result = validateTemplatePayload(id, payload)
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    })
  }

  it('accepts _birthday_wishes with the [gymName, memberName] body order', () => {
    const payload = buildTemplatePayload('_birthday_wishes', base) as any
    const body = payload.template.components.find((c: any) => c.type === 'body')
    expect(body.parameters.map((p: any) => p.text)).toEqual(['Iron Temple', 'Arjun'])
    expect(validateTemplatePayload('_birthday_wishes', payload).valid).toBe(true)
  })
})

describe('validateTemplatePayload — rejects contract violations', () => {
  it('rejects an unknown template', () => {
    const result = validateTemplatePayload('not_a_template' as TemplateId, {})
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/not an approved template/i)
  })

  it('rejects a template name that does not match the payload', () => {
    const payload = buildTemplatePayload('membership_renewed', full) as any
    payload.template.name = 'membership_renewd' // typo
    const result = validateTemplatePayload('membership_renewed', payload)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/template name mismatch/i)
  })

  it('rejects a wrong body variable count (extra param)', () => {
    const payload = buildTemplatePayload('payment_due_reminder', full) as any
    const body = payload.template.components.find((c: any) => c.type === 'body')
    body.parameters.push({ type: 'text', text: 'extra' })
    const result = validateTemplatePayload('payment_due_reminder', payload)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/count mismatch/i)
  })

  it('rejects a wrong body variable count (missing param)', () => {
    const payload = buildTemplatePayload('membership_renewed', full) as any
    const body = payload.template.components.find((c: any) => c.type === 'body')
    body.parameters.pop()
    const result = validateTemplatePayload('membership_renewed', payload)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/count mismatch/i)
  })

  it('rejects an empty / null-ish body variable', () => {
    const payload = buildTemplatePayload('membership_expired', full) as any
    const body = payload.template.components.find((c: any) => c.type === 'body')
    body.parameters[0].text = '   '
    const result = validateTemplatePayload('membership_expired', payload)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/null, undefined, or empty/i)
  })

  it('rejects an image template missing its header component', () => {
    const payload = buildTemplatePayload('membership_expiry_reminder', full) as any
    payload.template.components = payload.template.components.filter((c: any) => c.type !== 'header')
    const result = validateTemplatePayload('membership_expiry_reminder', payload)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/header image is required/i)
  })

  it('rejects _gymflow_welcome_member when its image header is missing', () => {
    // Regression: welcome was briefly built without a header → Meta error 132012.
    const payload = buildTemplatePayload('_gymflow_welcome_member', full) as any
    payload.template.components = payload.template.components.filter((c: any) => c.type !== 'header')
    const result = validateTemplatePayload('_gymflow_welcome_member', payload)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/header image is required/i)
  })

  it('rejects an image header whose link is empty', () => {
    const payload = buildTemplatePayload('_birthday_wishes', base) as any
    const header = payload.template.components.find((c: any) => c.type === 'header')
    header.parameters[0].image.link = ''
    const result = validateTemplatePayload('_birthday_wishes', payload)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/header image link/i)
  })
})
